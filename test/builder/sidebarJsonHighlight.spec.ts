/**
 * The lexer of the JSON highlight layer of the property editor.
 *
 * Two properties matter more than the exact painting. First, nothing may be lost:
 * the highlight layer lies under a transparent field, so a token the lexer swallowed
 * would leave a hole under the text the person is typing. Second, the layer must
 * survive text that is not JSON at all — while typing, most intermediate states are
 * not.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { tokenizeJson } from '../../src/runtime/modules/builder/shell/sidebar/utils/jsonHighlight';
// #endregion

// #region Data
/** Every text the lexer is expected to survive, valid JSON or not. */
const SOURCES = [
    '{"a": 1}',
    '{\n    "a": "b",\n    "c": [1, -2.5, 3e10, 4E-7]\n}',
    '{"quote": "he said \\"hi\\""}',
    '{"unicode": "\\u0041\\u00e9"}',
    '{"unterminated": "abc',
    '{"nested": {"deep": [{"x": true}, null, false]}}',
    '{"tag": "<script>alert(1)</script>"}',
    '{"key with: colon": 1}',
    '{"escaped backslash": "a\\\\"}',
    'not json at all',
    '',
    '{"num": 007, "neg": -0}',
    '{"tabs":\t"x"}',
    '{"a"   :   "b"}',
    '[]',
    '{"emoji": "smile ключ"}',
    '{"boolInString": "true"}',
    '{"trailing": 1,}',
    '{"',
    '"\\',
];
// #endregion

// #region Methods
/**
 * Collects the tokens of a kind into their texts.
 *
 * @param source - The text of the field.
 * @param kind - The token kind to pick.
 */
function textsOfKind(source: string, kind: string): string[] {
    return tokenizeJson(source)
        .filter((token) => token.kind === kind)
        .map((token) => token.text);
}
// #endregion

describe('json highlight lexer', () => {
    it('loses no character of any text it is given', () => {
        for (const source of SOURCES) {
            const rebuilt = tokenizeJson(source)
                .map((token) => token.text)
                .join('');

            expect(rebuilt, JSON.stringify(source)).toBe(source);
        }
    });

    it('tells an object key from a string value', () => {
        const source = '{"a": "b"}';

        expect(textsOfKind(source, 'key')).toEqual(['"a"']);
        expect(textsOfKind(source, 'string')).toEqual(['"b"']);
    });

    it('does not read a colon inside a string as the end of a key', () => {
        const source = '{"key with: colon": 1}';

        expect(textsOfKind(source, 'key')).toEqual(['"key with: colon"']);
        expect(textsOfKind(source, 'number')).toEqual(['1']);
    });

    it('keeps an escaped quote inside the string it belongs to', () => {
        const source = '{"escaped": "he said \\"hi\\": ok"}';

        expect(textsOfKind(source, 'key')).toEqual(['"escaped"']);
        expect(textsOfKind(source, 'string')).toEqual(['"he said \\"hi\\": ok"']);
    });

    it('paints a literal in a string as a string rather than as a literal', () => {
        expect(textsOfKind('{"a": "true"}', 'boolean')).toEqual([]);
        expect(textsOfKind('{"a": "true"}', 'string')).toEqual(['"true"']);
        expect(textsOfKind('{"a": true}', 'boolean')).toEqual(['true']);
        expect(textsOfKind('{"a": null}', 'null')).toEqual(['null']);
    });

    it('takes a number with a sign, a fraction and an exponent as one token', () => {
        expect(textsOfKind('[1, -2.5, 3e10, 4E-7]', 'number')).toEqual([
            '1',
            '-2.5',
            '3e10',
            '4E-7',
        ]);
    });

    it('recognizes a string whose closing quote has not been typed yet', () => {
        expect(textsOfKind('{"unterminated": "abc', 'string')).toEqual(['"abc']);
    });

    it('leaves markup inside a value as the text of one string token', () => {
        const tokens = tokenizeJson('{"tag": "<script>alert(1)</script>"}');
        const strings = tokens.filter((token) => token.kind === 'string');

        expect(strings).toHaveLength(1);
        expect(strings[0].text).toBe('"<script>alert(1)</script>"');
    });
});
