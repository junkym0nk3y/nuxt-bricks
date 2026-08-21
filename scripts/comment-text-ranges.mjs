/**
 * Translatable text that is not a comment: developer-facing messages, test case
 * titles and the comments of generated output.
 *
 * All three are in the sprint's scope and all three live inside string literals,
 * so the comment scanner does not see them. Two readers need them: the report
 * counts them per area, and the `--diff` projection has to let their text change
 * — otherwise the check that proves "no logic moved" would fail on the very work
 * the stage was supposed to do.
 */

import {
    CYRILLIC,
    findMatchingParen,
    readStringLiteral,
    skipWhitespace,
} from './comment-scanner.mjs';

/**
 * Calls whose direct string arguments a developer reads: they are part of the
 * sprint's scope, and no comment counter would ever see them. `throw` takes any
 * callee after it, because a thrown error is often built by a project helper
 * (`throw createBrickSourceError(source, start, path, 'message')`).
 */
const DEV_CALL_HEAD =
    /\bthrow\s+(?:new\s+)?[\w.$]+\s*\(|\bnew\s+[\w.$]*Error\s*\(|\bcreateError\s*\(|\bconsole\.\w+\s*\(/g;

/**
 * Comment syntaxes that occur INSIDE a template literal, because the module
 * generates CSS and SQL as strings.
 *
 * The SQL line form demands whitespace after the dashes, and that is not
 * cosmetic: a CSS custom property (`--bricks-hide`, `--bricks-base-0`) starts
 * with the same two characters, and a rule matching a bare `--` would blank
 * real declarations of the generated stylesheet.
 */
const LITERAL_COMMENT_PATTERNS = [/\/\*[\s\S]*?\*\//g, /(?:^|\n)[ \t]*--[ \t][^\n]*/g];

/** Trees whose `describe`/`it`/`test` calls really are test cases. */
const TEST_PATH_PATTERN = /^(?:test|e2e)\/|\.(?:spec|test)\.[cm]?[jt]sx?$/;

/**
 * Whether the file holds test cases rather than production code.
 *
 * @param {string} path - Repository-relative path.
 * @returns {boolean} The path belongs to a test tree.
 */
export function isTestPath(path) {
    return TEST_PATH_PATTERN.test(path);
}

/**
 * Ranges holding the text of developer-facing messages.
 *
 * A call head is matched first, and the text is then collected from its argument
 * list by `collectMessageText` — that is where the message ends and the code
 * begins is decided. Heads found inside a comment or a string are ignored: a
 * fixture that merely quotes `console.warn(...)` is not a call.
 *
 * @param {{ comments: Array<{ start: number, end: number }>, strings: Array<{ start: number, end: number }>, literals: Array<{ start: number, end: number }>, substitutions?: Array<{ start: number, end: number }> }} scanned - Scanner ranges.
 * @param {string} source - File contents.
 * @param {boolean} cyrillicOnly - Keep only the ranges carrying Cyrillic.
 * @returns {Array<{ start: number, end: number }>} Message text ranges.
 */
export function devMessageRanges(scanned, source, cyrillicOnly = true) {
    const index = indexRanges(scanned);
    const ranges = [];

    DEV_CALL_HEAD.lastIndex = 0;
    let head = DEV_CALL_HEAD.exec(source);

    while (head) {
        if (!index.isInside(head.index)) {
            ranges.push(...collectMessageText(source, head.index + head[0].length, index));
        }

        head = DEV_CALL_HEAD.exec(source);
    }

    return cyrillicOnly
        ? ranges.filter((range) => CYRILLIC.test(source.slice(range.start, range.end)))
        : ranges;
}

/**
 * Indexes the scanner ranges by their start offset, so the walkers below can ask
 * "does a comment, a string or a template start right here" in one lookup.
 *
 * @param {{ comments: Array<{ start: number, end: number }>, strings: Array<{ start: number, end: number }>, literals: Array<{ start: number, end: number }>, substitutions?: Array<{ start: number, end: number }> }} scanned - Scanner ranges.
 * @returns {{ commentEnd: Map<number, number>, stringEnd: Map<number, number>, templateEnd: Map<number, number>, substitutions: Array<{ start: number, end: number }>, isInside: (offset: number) => boolean }} Index.
 */
function indexRanges(scanned) {
    const commentEnd = new Map(scanned.comments.map((range) => [range.start, range.end]));
    const stringEnd = new Map(scanned.strings.map((range) => [range.start, range.end]));
    const templateEnd = new Map(scanned.literals.map((range) => [range.start, range.end]));
    const all = [...scanned.comments, ...scanned.strings, ...scanned.literals];

    return {
        commentEnd,
        stringEnd,
        templateEnd,
        substitutions: scanned.substitutions ?? [],
        isInside: (offset) => all.some((range) => offset > range.start && offset < range.end),
    };
}

/**
 * Text of a developer-facing message: everything a reader reads, and nothing a
 * reader computes.
 *
 * The walk starts right after the opening parenthesis of the call and ends at its
 * closing one. Nesting decides what counts as text: a literal reachable without
 * entering another call is the message, and `${ok ? 'OK' : 'EXCEEDED'}` is
 * message text too, because a ternary is not a call. A literal handed to a
 * nested call is a machine value — `t('bricks.media.listResponseInvalid')` and
 * `choose('safe')` are code, and a rewrite of them has to stay visible to the
 * `--diff` projection. So does an expression: `${maxBytes}` may not silently
 * become `${maxBytes + 1}` because the sentence around it was translated.
 *
 * @param {string} source - File contents.
 * @param {number} from - Offset right after the call's opening parenthesis.
 * @param {ReturnType<typeof indexRanges>} index - Indexed scanner ranges.
 * @param {number} [to] - Offset the walk must not pass (end of a substitution).
 * @returns {Array<{ start: number, end: number }>} Ranges holding message text.
 */
function collectMessageText(source, from, index, to = source.length) {
    const found = [];
    let depth = 1;
    let position = from;

    while (position < to && depth > 0) {
        const commentEnd = index.commentEnd.get(position);

        if (commentEnd !== undefined) {
            position = commentEnd;
            continue;
        }

        const stringEnd = index.stringEnd.get(position);

        if (stringEnd !== undefined) {
            if (depth === 1) {
                found.push({ start: position, end: stringEnd });
            }

            position = stringEnd;
            continue;
        }

        const templateEnd = index.templateEnd.get(position);

        if (templateEnd !== undefined) {
            if (depth === 1) {
                found.push(...collectTemplateText(source, position, templateEnd, index));
            }

            position = templateEnd;
            continue;
        }

        if (source[position] === '(') {
            depth += 1;
        } else if (source[position] === ')') {
            depth -= 1;
        }

        position += 1;
    }

    return found;
}

/**
 * Text of a template literal that is itself message text: the parts between the
 * substitutions, plus whatever the substitutions turn out to hold.
 *
 * @param {string} source - File contents.
 * @param {number} start - Offset of the opening backtick.
 * @param {number} end - Offset just past the closing backtick.
 * @param {ReturnType<typeof indexRanges>} index - Indexed scanner ranges.
 * @returns {Array<{ start: number, end: number }>} Ranges holding message text.
 */
function collectTemplateText(source, start, end, index) {
    const inner = index.substitutions
        .filter((span) => span.start > start && span.end <= end)
        .sort((left, right) => left.start - right.start)
        .filter(
            (span, position, list) =>
                !list.some(
                    (other, otherPosition) =>
                        otherPosition !== position &&
                        other.start < span.start &&
                        other.end >= span.end
                )
        );
    const found = [];
    let cursor = start;

    for (const span of inner) {
        if (span.start > cursor) {
            found.push({ start: cursor, end: span.start });
        }

        found.push(...collectMessageText(source, span.start + 2, index, span.end - 1));
        cursor = span.end;
    }

    if (cursor < end) {
        found.push({ start: cursor, end });
    }

    return found;
}

/**
 * Ranges of the title arguments of test cases.
 *
 * Two call shapes carry a title: the plain `it('title', fn)` and the
 * table-driven `it.each([...])('title %s', fn)`, where the title is the first
 * argument of the second call. Only that first argument is ever read, which
 * keeps the Russian values asserted inside test bodies out of the count.
 *
 * Known limit: the tagged-template table form (`it.each` followed by a backtick)
 * is not recognized. No test uses it here.
 *
 * @param {string} source - File contents.
 * @param {boolean} cyrillicOnly - Keep only the titles carrying Cyrillic.
 * @returns {Array<{ start: number, end: number, text: string }>} Title ranges.
 */
export function testTitleRanges(source, cyrillicOnly = true) {
    const pattern = /\b(?:describe|it|test)((?:\.\w+)*)\s*\(/g;
    const ranges = [];
    let match = pattern.exec(source);

    while (match) {
        const openParen = match.index + match[0].length - 1;
        let start = skipWhitespace(source, openParen + 1);
        let literal = readStringLiteral(source, start);

        if (!literal && match[1].includes('.each')) {
            const closeParen = findMatchingParen(source, openParen);
            const afterTable = closeParen === -1 ? -1 : skipWhitespace(source, closeParen + 1);

            if (afterTable !== -1 && source[afterTable] === '(') {
                start = skipWhitespace(source, afterTable + 1);
                literal = readStringLiteral(source, start);
            }
        }

        if (literal && (!cyrillicOnly || CYRILLIC.test(literal.text))) {
            ranges.push({ start, end: literal.end, text: literal.text, line: match.index });
        }

        match = pattern.exec(source);
    }

    return ranges;
}

/**
 * Ranges of the comments written inside template literals — the comments of the
 * CSS and SQL this package generates as strings.
 *
 * @param {{ literals: Array<{ start: number, end: number }> }} scanned - Scanner ranges.
 * @param {string} source - File contents.
 * @returns {Array<{ start: number, end: number }>} Comment ranges inside literals.
 */
export function literalCommentRanges(scanned, source) {
    const ranges = [];

    for (const literal of scanned.literals) {
        const text = source.slice(literal.start, literal.end);

        for (const pattern of LITERAL_COMMENT_PATTERNS) {
            pattern.lastIndex = 0;
            let match = pattern.exec(text);

            while (match) {
                ranges.push({
                    start: literal.start + match.index,
                    end: literal.start + match.index + match[0].length,
                });
                match = pattern.exec(text);
            }
        }
    }

    return ranges;
}

/**
 * Splits a range around the `${...}` substitutions inside it.
 *
 * The text of a message is translatable, an expression inside it is code:
 * `throw new Error(`limit ${maxBytes}`)` may not silently become
 * `${maxBytes + 1}` just because the sentence around it was translated. So the
 * substitutions stay in the projection and only the prose between them is
 * collapsed.
 *
 * Their boundaries come from the scanner, which already tracks template
 * literals with a context stack. Finding them here with a local parser was the
 * first attempt and it was wrong: such a parser knows about quotes but not about
 * regexp literals, and `${/}/.test(flag)` closed the substitution early — the
 * expression then collapsed along with the text, hiding a change of code.
 *
 * @param {{ start: number, end: number }} range - Range of translatable text.
 * @param {Array<{ start: number, end: number }>} substitutions - Scanner substitution ranges.
 * @returns {Array<{ start: number, end: number }>} Sub-ranges safe to collapse.
 */
function splitAroundSubstitutions(range, substitutions) {
    const inside = substitutions
        .filter((span) => span.start >= range.start && span.end <= range.end)
        .sort((left, right) => left.start - right.start);
    const parts = [];
    let cursor = range.start;

    for (const span of inside) {
        if (span.start > cursor) {
            parts.push({ start: cursor, end: span.start });
        }

        cursor = Math.max(cursor, span.end);
    }

    if (cursor < range.end) {
        parts.push({ start: cursor, end: range.end });
    }

    return parts;
}

/**
 * Every range whose text this sprint is allowed to rewrite without it counting
 * as a change of code. Language-agnostic on purpose: the projection has to
 * collapse both the Russian original and its English replacement.
 *
 * Case titles count only in test files. The pattern that finds them cannot tell
 * `it('...')` from the `.test('name', 'message', fn)` of a yup schema, and in
 * production code that second one is validation, not a title: collapsing it
 * would let a renamed yup test pass the projection as translated prose.
 *
 * @param {string} path - Repository-relative path.
 * @param {{ strings: Array<{ start: number, end: number }>, literals: Array<{ start: number, end: number }>, substitutions: Array<{ start: number, end: number }> }} scanned - Scanner ranges.
 * @param {string} source - File contents.
 * @returns {Array<{ start: number, end: number }>} Ranges of translatable text.
 */
export function translatableTextRanges(path, scanned, source) {
    const ranges = [
        ...devMessageRanges(scanned, source, false),
        ...(isTestPath(path) ? testTitleRanges(source, false) : []),
        ...literalCommentRanges(scanned, source),
    ];

    return ranges.flatMap((range) => splitAroundSubstitutions(range, scanned.substitutions ?? []));
}
