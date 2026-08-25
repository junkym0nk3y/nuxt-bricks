/**
 * The lexer of the JSON highlight layer of the property editor.
 *
 * A lexer rather than a validator: whether the text is valid JSON is decided by
 * `JSON.parse` in the editor, and the parse error is shown under the field. This
 * pass only paints what is already recognizable, so it has to survive any text at
 * all — a half-typed value included.
 *
 * The tokens are handed over as data rather than as an HTML string, and the
 * template renders them as text nodes. That is deliberate: an HTML string would
 * have to go through the sanitizer before `v-html`, and a value containing
 * `<script>` would depend on the escaping of whoever built the markup. Text nodes
 * carry no such dependency — a property value cannot become an element.
 */
import type { IJsonHighlightToken } from '../components/property-editors/types';

/**
 * One pass over the text: a string (a key when a colon follows it), a number, a
 * literal, structural punctuation. Everything the pattern does not know becomes a
 * `plain` gap, so the concatenation of the token texts always equals the input.
 *
 * The string alternative accepts an unterminated tail (`"?`) — while typing, the
 * closing quote does not exist yet, and a string that stops matching would repaint
 * the rest of the document on every keystroke.
 *
 * The colon that turns a string into a key is an OPTIONAL group of the same match
 * rather than a lookahead. A lookahead is what breaks here: `"he said \"hi\": ok"`
 * lets the engine backtrack the body to the inner escaped quote, where a colon does
 * follow, and the value gets painted as a key. An optional group never fails, so the
 * body keeps the longest match it took — the whole string — and the colon is only
 * read after it.
 */
const JSON_TOKEN_PATTERN =
    /("(?:[^"\\]|\\[\s\S])*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\bnull\b|([{}[\],:])/g;

/**
 * Splits the text of the editor into highlight tokens.
 *
 * @param source - The raw text of the field.
 * @returns The tokens in the order of the text; their texts concatenate back into
 * `source`.
 */
export function tokenizeJson(source: string): IJsonHighlightToken[] {
    const tokens: IJsonHighlightToken[] = [];
    let plainFrom = 0;
    let match: RegExpExecArray | null;

    JSON_TOKEN_PATTERN.lastIndex = 0;

    while ((match = JSON_TOKEN_PATTERN.exec(source)) !== null) {
        const [text, string, colon, number, boolean, punctuation] = match;

        // A zero-length match would spin the loop forever: `lastIndex` does not
        // move on its own
        if (text.length === 0) {
            JSON_TOKEN_PATTERN.lastIndex += 1;
            continue;
        }

        if (match.index > plainFrom) {
            tokens.push({ kind: 'plain', text: source.slice(plainFrom, match.index) });
        }

        if (string !== undefined) {
            tokens.push({ kind: colon === undefined ? 'string' : 'key', text: string });

            if (colon !== undefined) {
                tokens.push({ kind: 'punctuation', text: colon });
            }
        } else if (number !== undefined) {
            tokens.push({ kind: 'number', text });
        } else if (boolean !== undefined) {
            tokens.push({ kind: 'boolean', text });
        } else if (punctuation !== undefined) {
            tokens.push({ kind: 'punctuation', text });
        } else {
            tokens.push({ kind: 'null', text });
        }

        plainFrom = match.index + text.length;
    }

    if (plainFrom < source.length) {
        tokens.push({ kind: 'plain', text: source.slice(plainFrom) });
    }

    return tokens;
}
