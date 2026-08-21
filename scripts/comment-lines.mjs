/**
 * Comment collection: turns the scanner's character ranges into comment lines
 * of a concrete file.
 *
 * Everything file-shaped lives here — which section of a Vue SFC a comment sits
 * in, that Markdown is prose end to end, and that a Russian test case title is
 * not a comment at all but still has to be counted.
 */

import { CYRILLIC, DIRECTIVE, SYNTAX, indexLines, scanSource } from './comment-scanner.mjs';
import {
    devMessageRanges,
    testTitleRanges,
    translatableTextRanges,
} from './comment-text-ranges.mjs';

/**
 * @typedef {object} TCommentLine
 * @property {number} line - One-based line number.
 * @property {string} text - Full text of that line.
 * @property {string} section - `code`, `template`, `style` or `prose`.
 * @property {boolean} directive - The comment is a tool directive, not prose.
 */

/**
 * @typedef {object} TScannedFile
 * @property {Array<{ start: number, end: number, section: string }>} comments - Comment ranges.
 * @property {Array<{ start: number, end: number }>} literals - Template literal ranges.
 * @property {Array<{ start: number, end: number }>} strings - Quoted string ranges.
 * @property {Array<{ start: number, end: number }>} substitutions - `${...}` ranges inside template literals.
 * @property {boolean} prose - The whole file is prose, with no code to protect.
 * @property {boolean} indentSensitive - Leading whitespace carries meaning.
 */

/**
 * @typedef {object} TFileComments
 * @property {TCommentLine[]} commentLines - Comment lines of the file.
 * @property {number[]} literalLines - Template literal lines carrying Cyrillic.
 */

/**
 * Config files carrying `#` comments but no extension. Without them
 * `.gitattributes` (two Russian comment lines) would never be scanned at all,
 * because the scope is decided by extension.
 */
const SYNTAX_BY_BASENAME = {
    '.gitattributes': 'conf',
    '.gitignore': 'conf',
    '.npmrc': 'conf',
    '.nuxtrc': 'conf',
    '.nvmrc': 'conf',
    '.prettierignore': 'conf',
    '.stylelintignore': 'conf',
    '.editorconfig': 'conf',
    '.dockerignore': 'conf',
};

/**
 * Basename of a repository-relative path.
 *
 * @param {string} path - Repository-relative path.
 * @returns {string} Last path segment.
 */
function basename(path) {
    return path.slice(path.lastIndexOf('/') + 1);
}

/** Which scanner syntax each file extension is read with. */
const SYNTAX_BY_EXTENSION = {
    ts: 'js',
    js: 'js',
    mjs: 'js',
    cjs: 'js',
    scss: 'css',
    css: 'css',
    sql: 'sql',
    yml: 'yaml',
    yaml: 'yaml',
};

/**
 * Splits a Vue SFC into its top-level blocks. Root blocks sit at column zero in
 * this repository (Prettier keeps them there) and a nested `<template #slot>`
 * is always indented, so anchoring at line start separates them without a
 * parser. A block closed on its own opening line is honoured too, otherwise an
 * empty `<script setup lang="ts"></script>` would swallow the rest of the file
 * or be dropped whole.
 *
 * Known limit: an attribute value containing `>` (a `generic=` constraint, say)
 * would cut the opening tag short. No such block exists in this repository, and
 * a full attribute parser is not worth it for a lint script.
 *
 * @param {string} source - File contents.
 * @returns {Array<{ kind: string, start: number, end: number }>} Block ranges.
 */
function splitSfcBlocks(source) {
    const blocks = [];
    const opener = /^<(template|script|style)(\s[^>]*)?>/gm;
    let match = opener.exec(source);

    while (match) {
        const kind = match[1];
        const contentStart = match.index + match[0].length;
        const lineEnd = source.indexOf('\n', contentStart);
        const restOfLine = source.slice(contentStart, lineEnd === -1 ? source.length : lineEnd);
        const inlineClose = restOfLine.indexOf(`</${kind}>`);
        let contentEnd;

        if (inlineClose === -1) {
            const closer = new RegExp(`^</${kind}>`, 'gm');
            closer.lastIndex = contentStart;
            const closing = closer.exec(source);
            contentEnd = closing ? closing.index : source.length;
        } else {
            contentEnd = contentStart + inlineClose;
        }

        blocks.push({ kind, start: contentStart, end: contentEnd });
        opener.lastIndex = contentEnd;
        match = opener.exec(source);
    }

    return blocks;
}

/**
 * Turns comment ranges into per-line records. A block comment contributes every
 * line it spans, which is exactly what a line-start regexp loses.
 *
 * @param {Array<{ start: number, end: number, section: string }>} ranges - Comment ranges.
 * @param {string} source - File contents.
 * @param {{ lines: string[], offsetToLine: (offset: number) => number }} index - Line index.
 * @returns {TCommentLine[]} Comment lines.
 */
function toCommentLines(ranges, source, index) {
    const seen = new Map();

    for (const range of ranges) {
        const firstLine = index.offsetToLine(range.start);
        const lastLine = index.offsetToLine(Math.max(range.start, range.end - 1));
        const opening = source
            .slice(range.start, range.start + 4)
            .replace(/^(\/\/|\/\*|<!--|--|#)/, '');
        const directive = DIRECTIVE.test(opening + source.slice(range.start + 4, range.end));

        for (let line = firstLine; line <= lastLine; line += 1) {
            if (!seen.has(line)) {
                seen.set(line, {
                    line,
                    text: index.lines[line - 1] ?? '',
                    section: range.section,
                    directive,
                });
            }
        }
    }

    return [...seen.values()].sort((left, right) => left.line - right.line);
}

/**
 * Shifts scanner ranges from block-local offsets to file offsets.
 *
 * @param {Array<{ start: number, end: number }>} ranges - Block-local ranges.
 * @param {number} offset - Offset of the block inside the file.
 * @returns {Array<{ start: number, end: number }>} File-level ranges.
 */
function shiftRanges(ranges, offset) {
    return ranges.map((range) => ({ start: range.start + offset, end: range.end + offset }));
}

/**
 * Line numbers of a template literal that carry Cyrillic text.
 *
 * @param {Array<{ start: number, end: number }>} ranges - Literal ranges.
 * @param {{ lines: string[], offsetToLine: (offset: number) => number }} index - Line index.
 * @returns {number[]} Line numbers.
 */
function cyrillicLiteralLines(ranges, index) {
    const found = [];

    for (const range of ranges) {
        const firstLine = index.offsetToLine(range.start);
        const lastLine = index.offsetToLine(Math.max(range.start, range.end - 1));

        for (let line = firstLine; line <= lastLine; line += 1) {
            if (CYRILLIC.test(index.lines[line - 1] ?? '')) {
                found.push(line);
            }
        }
    }

    return found;
}

/**
 * Scans a file once and returns the raw ranges every reader needs.
 *
 * Vue SFCs are scanned per block: the `<template>` and `<style>` sections must
 * end up with no comments at all, while `<script>` keeps them translated.
 * Markdown has no comment syntax to speak of — the local `README.md` files are
 * prose end to end, so the whole file counts as translatable text.
 *
 * @param {string} path - Repository-relative path.
 * @param {string} source - File contents.
 * @returns {TScannedFile} Ranges.
 */
function scanFile(path, source) {
    const extension = path.split('.').pop();
    const empty = {
        comments: [],
        literals: [],
        strings: [],
        substitutions: [],
        prose: false,
        indentSensitive: false,
    };

    if (extension === 'md') {
        return { ...empty, prose: true };
    }

    if (extension === 'vue') {
        const comments = [];
        const literals = [];
        const strings = [];
        const substitutions = [];

        for (const block of splitSfcBlocks(source)) {
            const language = { template: 'html', style: 'css', script: 'js' }[block.kind];
            const section = block.kind === 'script' ? 'code' : block.kind;
            const scanned = scanSource(source.slice(block.start, block.end), language);

            comments.push(
                ...shiftRanges(scanned.comments, block.start).map((range) => ({
                    ...range,
                    section,
                }))
            );
            literals.push(...shiftRanges(scanned.literals, block.start));
            strings.push(...shiftRanges(scanned.strings, block.start));
            substitutions.push(...shiftRanges(scanned.substitutions, block.start));
        }

        return { ...empty, comments, literals, strings, substitutions };
    }

    const language = SYNTAX_BY_EXTENSION[extension] ?? SYNTAX_BY_BASENAME[basename(path)];

    if (!language) {
        return empty;
    }

    const scanned = scanSource(source, language);
    const section = language === 'css' ? 'style' : 'code';

    return {
        comments: scanned.comments.map((range) => ({ ...range, section })),
        literals: scanned.literals,
        strings: scanned.strings,
        substitutions: scanned.substitutions,
        prose: false,
        indentSensitive: SYNTAX[language].indentSensitive === true,
    };
}

/**
 * Collects every comment line of a file.
 *
 * @param {string} path - Repository-relative path.
 * @param {string} source - File contents.
 * @returns {TFileComments} Findings.
 */
export function collectComments(path, source) {
    const index = indexLines(source);
    const scanned = scanFile(path, source);

    if (scanned.prose) {
        return {
            commentLines: index.lines
                .map((text, position) => ({
                    line: position + 1,
                    text,
                    section: 'prose',
                    directive: false,
                }))
                .filter((entry) => entry.text.trim().length > 0),
            literalLines: [],
        };
    }

    return {
        commentLines: toCommentLines(scanned.comments, source, index),
        literalLines: cyrillicLiteralLines(scanned.literals, index),
    };
}

/**
 * Projects a file down to its code: comment characters are blanked out,
 * translatable text is collapsed, then blank lines are dropped.
 *
 * Two revisions with equal projections differ in comments only. Comparing
 * projections is what makes the check honest — asking merely whether a changed
 * line "is a comment line" passes a rewritten `credentials: omit` sitting next
 * to a trailing comment, which is exactly the defect the check exists to catch.
 *
 * A prose file projects to nothing: a local `README.md` is translatable text end
 * to end, so there is no code in it for the check to protect. Indent-sensitive
 * syntaxes keep their leading whitespace, because in YAML a changed indent is a
 * changed document, not a reformatted line.
 *
 * Text the sprint translates outside comments — dev messages, test case titles,
 * the comments of generated CSS and SQL — is collapsed to nothing rather than
 * blanked, so that its own length does not leak into the projection. Without
 * this the check contradicted the sprint: translating the one Russian
 * `console.warn` of a domain was reported as a change of code, and no stage
 * touching a dev message or a generated-output comment could ever be verified.
 * Surrounding code on the same line is still compared, and the caller is told
 * that such text differed (`projectCode(path, source, { normalizeText: false })`
 * keeps it).
 *
 * @param {string} path - Repository-relative path.
 * @param {string} source - File contents.
 * @param {{ normalizeText?: boolean }} [options] - `normalizeText: false` compares translatable text too.
 * @returns {string[]} Code lines, in order.
 */
export function projectCode(path, source, options = {}) {
    const scanned = scanFile(path, source);

    if (scanned.prose) {
        return [];
    }

    const characters = [...source];

    for (const range of scanned.comments) {
        for (let position = range.start; position < range.end; position += 1) {
            if (characters[position] !== '\n') {
                characters[position] = ' ';
            }
        }
    }

    if (options.normalizeText !== false) {
        for (const range of translatableTextRanges(path, scanned, source)) {
            for (let position = range.start; position < range.end; position += 1) {
                if (characters[position] !== '\n') {
                    characters[position] = '';
                }
            }
        }
    }

    return characters
        .join('')
        .split('\n')
        .map((line) => (scanned.indentSensitive ? line.replace(/\s+$/, '') : line.trim()))
        .filter((line) => line.trim().length > 0);
}

/**
 * Collects Russian developer-facing messages: text passed to `throw`,
 * `new Error`, `createError` or `console.*`.
 *
 * Not comments and not product text — a Russian `throw` reaches the integrating
 * developer just as a Russian comment does, so the sprint covers it and the gate
 * has to see it. The ranges themselves come from `comment-text-ranges.mjs`,
 * shared with the `--diff` projection: two copies of "what counts as a message"
 * would let the gate demand a translation the projection then reports as a change
 * of code.
 *
 * @param {string} path - Repository-relative path.
 * @param {string} source - File contents.
 * @returns {Array<{ line: number, text: string }>} Russian messages.
 */
export function collectDevMessages(path, source) {
    const index = indexLines(source);
    const scanned = scanFile(path, source);
    const byLine = new Map();

    // One entry per line, because the column counts lines: the text of a message
    // built out of a template literal arrives in several pieces (the parts around
    // its substitutions), and counting the pieces would inflate the report
    for (const range of devMessageRanges(scanned, source)) {
        const line = index.offsetToLine(range.start);

        if (!byLine.has(line)) {
            byLine.set(line, source.slice(range.start, range.end).slice(0, 80));
        }
    }

    return [...byLine.entries()]
        .map(([line, text]) => ({ line, text }))
        .sort((left, right) => left.line - right.line);
}

/**
 * Collects test case titles written in Russian. Renaming `describe`/`it` titles
 * is a stage of its own, and titles are string literals rather than comments, so
 * they need their own counter. The parsing lives in `comment-text-ranges.mjs`,
 * shared with the `--diff` projection.
 *
 * @param {string} source - File contents.
 * @returns {Array<{ line: number, text: string }>} Russian titles.
 */
export function collectTestTitles(source) {
    const index = indexLines(source);

    return testTitleRanges(source).map((range) => ({
        line: index.offsetToLine(range.line),
        text: range.text,
    }));
}
