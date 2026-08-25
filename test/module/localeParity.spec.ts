/**
 * The two locale files are the whole i18n contract of the package: a key present in
 * one of them and missing from the other shows the raw key to whoever runs the other
 * language, and nothing in the build says a word about it. The check is structural —
 * the same paths, the same node kinds, no empty strings — because the wording is a
 * matter of translation and this is a matter of the contract.
 */

// #region Imports
// Node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';
// #endregion

// #region Helpers
type TLocaleNode = string | TLocaleNode[] | { [key: string]: TLocaleNode };

/**
 * Reads a locale file of the package.
 *
 * @param locale - Locale code, matching the file name.
 * @returns The parsed message tree.
 */
function readLocale(locale: string): Record<string, TLocaleNode> {
    const path = fileURLToPath(
        new URL(`../../src/runtime/locales/${locale}.json`, import.meta.url)
    );

    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, TLocaleNode>;
}

/**
 * Kind of a node, as the parity check understands it. An array is told apart from an
 * object on purpose: `tm` hands an array back as a list and an object as a map, and a
 * locale that turned one into the other breaks the consumer of the key rather than
 * its wording.
 *
 * Anything that is neither of the three is `other` rather than quietly a string: a
 * number or a boolean in the tree passes through `rt` as a value it has no contract
 * for, and classifying it as a message would hide exactly that.
 *
 * @param node - Node of the message tree.
 * @returns The kind of the node.
 */
function nodeKind(node: TLocaleNode): string {
    if (Array.isArray(node)) {
        return 'array';
    }

    if (node !== null && typeof node === 'object') {
        return 'object';
    }

    return typeof node === 'string' ? 'string' : 'other';
}

/**
 * Names of the interpolation placeholders of a message, sorted. The set is part of the
 * contract of the key rather than of its wording: a locale that renamed `{name}` into
 * `{component}` leaves the caller passing a value nobody reads and the reader showing
 * an unresolved placeholder.
 *
 * @param message - Text of the message.
 * @returns Sorted placeholder names.
 */
function readPlaceholders(message: string): string[] {
    return [...message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*\}/g)].map((match) => match[1]).sort();
}

/**
 * Flattens a message tree into "path → kind" pairs plus "path → text" for the leaves.
 * Array elements get their index in the path: a list of a different length is as much
 * of a divergence as a missing key.
 *
 * @param node - Node of the message tree.
 * @param kinds - Accumulator of the kinds.
 * @param messages - Accumulator of the leaf texts.
 * @param prefix - Path accumulated so far.
 */
function flatten(
    node: TLocaleNode,
    kinds: Map<string, string>,
    messages: Map<string, string>,
    prefix = ''
): void {
    const kind = nodeKind(node);

    if (kind === 'string') {
        messages.set(prefix, node as string);
        return;
    }

    // A leaf that is neither a string nor a container is not walked into — its own kind
    // is already recorded by the caller, and the kind assertions fail on it
    if (kind === 'other') {
        return;
    }

    const children: Array<[string, TLocaleNode]> = Array.isArray(node)
        ? node.map((child, index) => [String(index), child])
        : Object.entries(node as { [key: string]: TLocaleNode });

    for (const [key, child] of children) {
        const path = prefix ? `${prefix}.${key}` : key;
        kinds.set(path, nodeKind(child));
        flatten(child, kinds, messages, path);
    }
}

/**
 * Reads a locale and flattens it in one step.
 *
 * @param locale - Locale code.
 * @returns The kinds of the nodes and the texts of the leaves.
 */
function readFlatLocale(locale: string): {
    kinds: Map<string, string>;
    messages: Map<string, string>;
} {
    const kinds = new Map<string, string>();
    const messages = new Map<string, string>();

    flatten(readLocale(locale), kinds, messages);

    return { kinds, messages };
}
// #endregion

const { kinds: ru, messages: ruMessages } = readFlatLocale('ru');
const { kinds: en, messages: enMessages } = readFlatLocale('en');

describe('locales: ru and en describe the same tree', () => {
    it('every key of the Russian locale exists in the English one', () => {
        expect([...ru.keys()].filter((path) => !en.has(path))).toEqual([]);
    });

    it('every key of the English locale exists in the Russian one', () => {
        expect([...en.keys()].filter((path) => !ru.has(path))).toEqual([]);
    });

    it('the same path holds a node of the same kind in both', () => {
        const mismatched = [...ru.entries()]
            .filter(([path, kind]) => en.has(path) && en.get(path) !== kind)
            .map(([path, kind]) => `${path}: ru ${kind}, en ${en.get(path)}`);

        expect(mismatched).toEqual([]);
    });

    it('every leaf is a string', () => {
        const wrongKind = [...ru.entries(), ...en.entries()]
            .filter(([, kind]) => kind === 'other')
            .map(([path]) => path);

        expect(wrongKind).toEqual([]);
    });

    // The set of placeholders is the contract of the key: a locale that renamed one
    // leaves the caller passing a value nobody reads and the reader looking at braces
    it('the same message takes the same interpolation placeholders in both', () => {
        const mismatched = [...ruMessages.entries()]
            .filter(([path]) => enMessages.has(path))
            .map(([path, message]) => ({
                path,
                ru: readPlaceholders(message),
                en: readPlaceholders(enMessages.get(path) ?? ''),
            }))
            .filter(({ ru: ruNames, en: enNames }) => ruNames.join() !== enNames.join())
            .map(
                ({ path, ru: ruNames, en: enNames }) => `${path}: ru {${ruNames}}, en {${enNames}}`
            );

        expect(mismatched).toEqual([]);
    });

    it('no message is empty', () => {
        const blank = [
            ...[...ruMessages.entries()].map(([path, message]) => [`ru: ${path}`, message]),
            ...[...enMessages.entries()].map(([path, message]) => [`en: ${path}`, message]),
        ]
            .filter(([, message]) => !message.trim())
            .map(([path]) => path);

        expect(blank).toEqual([]);
        // The check is worthless on an empty selection: a broken flattening would
        // find nothing and read as a pass
        expect(ruMessages.size).toBeGreaterThan(0);
    });
});
