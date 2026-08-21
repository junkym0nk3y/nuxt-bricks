/**
 * Comment scanner: finds comments in the file types this repository uses.
 *
 * Written as a state machine rather than a line-start regexp for two reasons a
 * regexp cannot cover. A pattern anchored at `//`, `/*` or `*` loses every
 * continuation line of a multi-line block, and it fires inside string and
 * regexp literals — `persistence/server/utils/fileSignatures.ts` holds an
 * `<!--...-->` regexp literal that is not a comment at all, and stripping it
 * would break SVG upload validation.
 *
 * One scanner drives every language: they differ only in their comment markers,
 * quotes and whether template literals and regexp literals exist. Shared by the
 * report and by the comment-only diff check, so both judge "this line is a
 * comment" by the same rule.
 */

export const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Tool directives are content, not prose: they change how oxlint, stylelint or
 * TypeScript treats the next line, so they survive the `<template>`/`<style>`
 * cleanup and are never counted as translatable text.
 */
export const DIRECTIVE =
    /^\s*(eslint|oxlint|stylelint|prettier|postcss|v8 ignore|c8 ignore|@ts-|#region|#endregion|region |endregion)/;

/**
 * Syntax of every scanned language. `indentSensitive` keeps the code projection
 * from trimming lines: in YAML a changed indent changes the document, and a
 * trimmed projection would call that a comment-only edit. `template` and `regex` are JavaScript-only
 * states; without `regex` a slash is never special, which is what keeps CSS
 * `url(//host)` and SQL from derailing the scan.
 */
export const SYNTAX = {
    js: {
        line: ['//'],
        block: [['/*', '*/']],
        quotes: ['"', "'"],
        template: true,
        regex: true,
    },
    css: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"] },
    sql: { line: ['--'], block: [['/*', '*/']], quotes: ['"', "'"] },
    yaml: { line: ['#'], block: [], quotes: ['"', "'"], indentSensitive: true },
    html: { line: [], block: [['<!--', '-->']], quotes: [] },
    // Ignore-style config files: a quote there is a literal character of a
    // pattern, not a string delimiter, so treating it as one would hide a `#`
    conf: { line: ['#'], block: [], quotes: [], indentSensitive: true },
};

/** Keywords after which a slash opens a regexp literal instead of dividing. */
const VALUE_KEYWORDS = new Set(
    'return typeof instanceof in of new delete void case do else yield await throw'.split(' ')
);

/**
 * Reads a string literal starting at the given offset.
 *
 * @param {string} source - File contents.
 * @param {number} start - Offset of the opening quote.
 * @returns {{ text: string, end: number } | null} Literal, or null if none opens here.
 */
export function readStringLiteral(source, start) {
    const quote = source[start];

    if (quote !== "'" && quote !== '"' && quote !== '`') {
        return null;
    }

    let index = start + 1;
    let text = '';

    while (index < source.length) {
        const char = source[index];

        if (char === '\\') {
            text += source.slice(index, index + 2);
            index += 2;
            continue;
        }

        if (char === quote) {
            return { text, end: index + 1 };
        }

        if (char === '\n' && quote !== '`') {
            return null;
        }

        text += char;
        index += 1;
    }

    return null;
}

/**
 * Offset of the first character that is not whitespace.
 *
 * @param {string} source - File contents.
 * @param {number} start - Offset to start from.
 * @returns {number} Offset of the next significant character.
 */
export function skipWhitespace(source, start) {
    let index = start;

    while (index < source.length && /\s/.test(source[index])) {
        index += 1;
    }

    return index;
}

/**
 * Offset of the parenthesis closing the one at `openIndex`, or -1.
 *
 * @param {string} source - File contents.
 * @param {number} openIndex - Offset of the opening parenthesis.
 * @returns {number} Offset of the closing parenthesis.
 */
export function findMatchingParen(source, openIndex) {
    let depth = 0;
    let index = openIndex;

    while (index < source.length) {
        const literal = readStringLiteral(source, index);

        if (literal) {
            index = literal.end;
            continue;
        }

        const char = source[index];

        if (char === '(') {
            depth += 1;
        } else if (char === ')') {
            depth -= 1;

            if (depth === 0) {
                return index;
            }
        }

        index += 1;
    }

    return -1;
}

/**
 * Splits a source string into lines while remembering where each line starts,
 * so a character offset from the scanner maps back to a line number.
 *
 * @param {string} source - File contents.
 * @returns {{ lines: string[], offsetToLine: (offset: number) => number }} Line index.
 */
export function indexLines(source) {
    const lines = source.split('\n');
    const starts = [];
    let offset = 0;

    for (const line of lines) {
        starts.push(offset);
        offset += line.length + 1;
    }

    /**
     * Binary search of the line owning an offset.
     *
     * @param {number} target - Character offset.
     * @returns {number} One-based line number.
     */
    function offsetToLine(target) {
        let low = 0;
        let high = starts.length - 1;

        while (low < high) {
            const middle = Math.ceil((low + high) / 2);

            if (starts[middle] <= target) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return low + 1;
    }

    return { lines, offsetToLine };
}

/**
 * Whether a `/` at the given offset opens a regexp literal rather than being a
 * division operator. Decided by the previous significant token, the way a
 * JavaScript lexer does it: after a value (identifier, literal, `)`, `]`) a
 * slash divides, after an operator or a keyword it opens a regexp.
 *
 * @param {string} source - File contents.
 * @param {number} slashOffset - Offset of the slash.
 * @returns {boolean} The slash opens a regexp literal.
 */
function slashStartsRegex(source, slashOffset) {
    let index = slashOffset - 1;

    while (index >= 0 && /\s/.test(source[index])) {
        index -= 1;
    }

    if (index < 0) {
        return true;
    }

    const previous = source[index];

    // A closing quote ends a string, and `++`/`--` here can only be postfix:
    // both yield a value, so the slash divides. Without these two the scan read
    // `value++ / divisor; // comment` as a regexp and swallowed the comment
    if (previous === "'" || previous === '"' || previous === '`') {
        return false;
    }

    if ((previous === '+' || previous === '-') && source[index - 1] === previous) {
        return false;
    }

    if (!/[\w$)\]]/.test(previous)) {
        return true;
    }

    if (!/[\w$]/.test(previous)) {
        return false;
    }

    const wordEnd = index + 1;

    while (index >= 0 && /[\w$]/.test(source[index])) {
        index -= 1;
    }

    return VALUE_KEYWORDS.has(source.slice(index + 1, wordEnd));
}

/**
 * Skips a quoted string. A newline also closes it: an unterminated quote in one
 * line must not swallow the rest of the file.
 *
 * @param {string} source - File contents.
 * @param {number} start - Offset of the opening quote.
 * @param {string} quote - Quote character.
 * @returns {number} Offset just past the closing quote.
 */
function skipQuoted(source, start, quote) {
    let index = start + 1;

    while (index < source.length) {
        const char = source[index];

        if (char === '\\') {
            index += 2;
            continue;
        }

        if (char === quote || char === '\n') {
            return index + 1;
        }

        index += 1;
    }

    return index;
}

/**
 * Skips a regexp literal including its character classes.
 *
 * @param {string} source - File contents.
 * @param {number} start - Offset of the opening slash.
 * @returns {number} Offset just past the closing slash.
 */
function skipRegex(source, start) {
    let index = start + 1;
    let inClass = false;

    while (index < source.length) {
        const char = source[index];

        if (char === '\\') {
            index += 2;
            continue;
        }

        if (char === '\n') {
            return index;
        }

        if (char === '[') {
            inClass = true;
        } else if (char === ']') {
            inClass = false;
        } else if (char === '/' && !inClass) {
            return index + 1;
        }

        index += 1;
    }

    return index;
}

/**
 * Advances through the text part of a template literal, which has only three
 * special sequences: an escape, the closing backtick, and `${` opening a
 * substitution that is code again.
 *
 * @param {string} source - File contents.
 * @param {number} index - Current offset.
 * @param {object[]} stack - Context stack (mutated).
 * @param {Array<{ start: number, end: number }>} literals - Collected literal ranges.
 * @returns {number} Next offset.
 */
function advanceTemplateText(source, index, stack, literals) {
    const char = source[index];

    if (char === '\\') {
        return index + 2;
    }

    if (char === '`') {
        literals.push({ start: stack.pop().start, end: index + 1 });

        return index + 1;
    }

    if (char === '$' && source[index + 1] === '{') {
        stack.push({ kind: 'substitution', depth: 1, start: index });

        return index + 2;
    }

    return index + 1;
}

/**
 * Matches a comment opening at the given offset and returns its full range.
 *
 * @param {string} source - File contents.
 * @param {number} index - Current offset.
 * @param {object} syntax - Entry of `SYNTAX`.
 * @returns {{ start: number, end: number } | null} Comment range, or null.
 */
function matchCommentAt(source, index, syntax) {
    if (syntax.line.some((marker) => source.startsWith(marker, index))) {
        const end = source.indexOf('\n', index);

        return { start: index, end: end === -1 ? source.length : end };
    }

    const blockMarker = syntax.block.find(([open]) => source.startsWith(open, index));

    if (!blockMarker) {
        return null;
    }

    const [open, close] = blockMarker;
    const end = source.indexOf(close, index + open.length);

    return { start: index, end: end === -1 ? source.length : end + close.length };
}

/**
 * Collects comment ranges from a source string in one pass.
 *
 * @param {string} source - Source (a whole file, or one SFC block).
 * The `${...}` substitutions are reported too: their content is code, not text,
 * so a reader that collapses translatable text (the `--diff` projection) has to
 * keep them. Recording them here rather than re-finding them means there is one
 * JavaScript scanner in the toolchain — a second, simpler one would not know
 * about regexp literals or comments, and `${/}/.test(flag)` alone was enough to
 * derail it.
 *
 * @param {string} language - Key of `SYNTAX`.
 * @returns {{ comments: Array<{ start: number, end: number }>, literals: Array<{ start: number, end: number }>, strings: Array<{ start: number, end: number }> }} Ranges.
 */
export function scanSource(source, language) {
    const syntax = SYNTAX[language];
    const comments = [];
    const literals = [];
    const strings = [];
    const substitutions = [];
    // Template literals interleave text and code, and the code inside `${...}`
    // can open another template literal. A stack of contexts keeps both apart
    // without a second scanner, so a comment inside a substitution is found
    // while the surrounding generated CSS or SQL text is not mistaken for one
    const stack = [];
    let index = 0;

    while (index < source.length) {
        const frame = stack.at(-1);

        if (frame?.kind === 'template') {
            index = advanceTemplateText(source, index, stack, literals);
            continue;
        }

        const char = source[index];
        const comment = matchCommentAt(source, index, syntax);

        if (comment) {
            comments.push(comment);
            index = comment.end;
            continue;
        }

        if (syntax.quotes.includes(char)) {
            const end = skipQuoted(source, index, char);
            strings.push({ start: index, end });
            index = end;
            continue;
        }

        if (syntax.template && char === '`') {
            stack.push({ kind: 'template', start: index });
            index += 1;
            continue;
        }

        if (frame?.kind === 'substitution' && (char === '{' || char === '}')) {
            frame.depth += char === '{' ? 1 : -1;

            if (frame.depth === 0) {
                substitutions.push({ start: stack.pop().start, end: index + 1 });
            }

            index += 1;
            continue;
        }

        if (syntax.regex && char === '/' && slashStartsRegex(source, index)) {
            index = skipRegex(source, index);
            continue;
        }

        index += 1;
    }

    // An unterminated literal still has to yield its range: the scan must not
    // silently drop the tail of a file it could not close
    for (const leftover of stack) {
        if (leftover.kind === 'template') {
            literals.push({ start: leftover.start, end: source.length });
        }
    }

    return { comments, literals, strings, substitutions };
}
