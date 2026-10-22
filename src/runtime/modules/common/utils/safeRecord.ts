/**
 * Access to objects by a key that came from outside (a page schema, a brick file, a
 * data source response). For such keys `obj[key]` is unsafe: the member names of
 * `Object.prototype` (`__proto__`, `constructor`, `toString`, `hasOwnProperty`)
 * read as existing values, so an "already there" check fires falsely and a write
 * into an imaginary bin lands in the global prototype.
 *
 * `Object.prototype.hasOwnProperty.call` rather than `Object.hasOwn` — out of habit
 * of broad compatibility, not out of necessity: the actual JS floor of the project
 * is `safari 16` (the default `build.target` of Vite 7, see `.browserslistrc`), so
 * `Object.hasOwn` (Safari 15.4) would have passed. The former justification, "there
 * is an `ios_saf 11` in `.browserslistrc`", is wrong: that file is read by
 * autoprefixer only and has no effect on JS. There is nothing to change the form of
 * the call to — the behavior is identical.
 */

// #region Constants
/**
 * The only key that cannot be put into an ordinary object: assigning it calls the
 * prototype setter, and an own property of that name does not survive the
 * serialization of a Nuxt payload (devalue throws "Cannot stringify objects with
 * __proto__ keys"). Container keys have no such restriction — a `Map` is used there.
 */
const PROTO_KEY = '__proto__';
// #endregion

/**
 * Checks for an own (not inherited) key.
 *
 * @param target - An object of an arbitrary shape.
 * @param key - Key from an untrusted source.
 * @returns true if the key is declared on the object itself.
 */
export function hasOwnKey(target: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Reads a value by an external key without climbing into the prototype.
 *
 * @param target - Dictionary object.
 * @param key - Key from an untrusted source.
 * @returns The value, or undefined when there is no own key.
 */
export function readOwnKey<TValue>(
    target: Record<string, TValue>,
    key: string
): TValue | undefined {
    return hasOwnKey(target, key) ? target[key] : undefined;
}

/**
 * Assembles an ordinary object out of key/value pairs in such a way that the
 * special names become own properties rather than members of the prototype.
 * `__proto__` is dropped: representing it in an object that survives the payload is
 * impossible (see PROTO_KEY).
 *
 * @param entries - Key/value pairs whose keys come from an untrusted source.
 * @returns An object with own properties for every key except `__proto__`.
 */
export function toSafeRecord<TValue>(entries: Iterable<[string, TValue]>): Record<string, TValue> {
    return Object.fromEntries(Array.from(entries).filter(([key]) => key !== PROTO_KEY)) as Record<
        string,
        TValue
    >;
}
