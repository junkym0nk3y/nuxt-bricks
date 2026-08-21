/**
 * Comment collection: turns the scanner's character ranges into comment lines
 * of a concrete file.
 *
 * Everything file-shaped lives here — which section of a Vue SFC a comment sits
 * in, that Markdown is prose end to end, and that a Russian test case title is
 * not a comment at all but still has to be counted.
 */

import {
    CYRILLIC,
    DIRECTIVE,
    SYNTAX,
    findMatchingParen,
    indexLines,
    readStringLiteral,
    scanSource,
    skipWhitespace,
} from './comment-scanner.mjs';

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
    const empty = { comments: [], literals: [], strings: [], prose: false, indentSensitive: false };

    if (extension === 'md') {
        return { ...empty, prose: true };
    }

    if (extension === 'vue') {
        const comments = [];
        const literals = [];
        const strings = [];

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
        }

        return { ...empty, comments, literals, strings };
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
 * Projects a file down to its code: comment characters are blanked out, then
 * blank lines are dropped.
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
 * @param {string} path - Repository-relative path.
 * @param {string} source - File contents.
 * @returns {string[]} Code lines, in order.
 */
export function projectCode(path, source) {
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

    return characters
        .join('')
        .split('\n')
        .map((line) => (scanned.indentSensitive ? line.replace(/\s+$/, '') : line.trim()))
        .filter((line) => line.trim().length > 0);
}

/**
 * Statements whose string arguments a developer reads: they are part of the
 * sprint's scope, and no comment counter would ever see them.
 */
const DEV_MESSAGE_CALL = /\b(throw|new Error|createError|console\.\w+)\b/;

/**
 * Collects Russian developer-facing messages: text passed to `throw`,
 * `new Error`, `createError` or `console.*`.
 *
 * Not comments and not product text — a русский `throw` reaches the integrating
 * developer just as a Russian comment does, so the sprint covers it and the gate
 * has to see it. The statement is taken as everything back to the previous `;`,
 * which keeps a multi-line `createError({ ... })` intact.
 *
 * @param {string} path - Repository-relative path.
 * @param {string} source - File contents.
 * @returns {Array<{ line: number, text: string }>} Russian messages.
 */
export function collectDevMessages(path, source) {
    const index = indexLines(source);
    const scanned = scanFile(path, source);
    const messages = [];

    for (const range of [...scanned.strings, ...scanned.literals]) {
        const text = source.slice(range.start, range.end);

        if (!CYRILLIC.test(text)) {
            continue;
        }

        const before = source.slice(0, range.start);
        const statement = before.slice(before.lastIndexOf(';') + 1);

        if (DEV_MESSAGE_CALL.test(statement)) {
            messages.push({ line: index.offsetToLine(range.start), text: text.slice(0, 80) });
        }
    }

    return messages.sort((left, right) => left.line - right.line);
}

/**
 * Collects test case titles written in Russian. Renaming `describe`/`it` titles
 * is a stage of its own, and titles are string literals rather than comments, so
 * they need their own counter.
 *
 * Two call shapes carry a title: the plain `it('title', fn)` and the
 * table-driven `it.each([...])('title %s', fn)`, where the title is the first
 * argument of the second call. Only that first argument is ever read, which
 * keeps the Russian values asserted inside test bodies out of the count.
 *
 * Known limit: the tagged-template table form (`it.each` followed by a backtick)
 * is not recognised. No test uses it here.
 *
 * @param {string} source - File contents.
 * @returns {Array<{ line: number, text: string }>} Russian titles.
 */
export function collectTestTitles(source) {
    const index = indexLines(source);
    const pattern = /\b(?:describe|it|test)((?:\.\w+)*)\s*\(/g;
    const titles = [];
    let match = pattern.exec(source);

    while (match) {
        const openParen = match.index + match[0].length - 1;
        let literal = readStringLiteral(source, skipWhitespace(source, openParen + 1));

        if (!literal && match[1].includes('.each')) {
            const closeParen = findMatchingParen(source, openParen);
            const afterTable = closeParen === -1 ? -1 : skipWhitespace(source, closeParen + 1);

            if (afterTable !== -1 && source[afterTable] === '(') {
                literal = readStringLiteral(source, skipWhitespace(source, afterTable + 1));
            }
        }

        if (literal && CYRILLIC.test(literal.text)) {
            titles.push({ line: index.offsetToLine(match.index), text: literal.text });
        }

        match = pattern.exec(source);
    }

    return titles;
}
