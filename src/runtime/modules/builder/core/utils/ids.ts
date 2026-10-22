/**
 * Builds an id out of a prefix, a timestamp and a random suffix.
 *
 * `crypto.randomUUID` is no good here: in the browser it exists only in a secure
 * context, and over plain HTTP it is missing entirely.
 *
 * `useId` (Vue 3.5; in Nuxt a deprecated re-export of the Vue one) is no
 * replacement either, and not only because both generators are called from pinia
 * actions, where there is no active instance (there it warns and returns an empty
 * string). It hands out a per-app-instance counter (`v-0`, `v-1`, …) that starts
 * over on every page load, while these ids are persisted into the schema and the
 * database — a new entry would collide with an already stored one. `useId` solves
 * the stability of a DOM attribute id between SSR and client, not uniqueness
 * between sessions.
 *
 * @param prefix - Id prefix.
 * @returns Id string shaped `<prefix>-<timestamp>-<random>`.
 */
function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generates a unique id for a canvas component.
 *
 * @returns Id string shaped `component-<timestamp>-<random>`.
 */
export function generateComponentId(): string {
    return generateId('component');
}

/**
 * Generates a unique id for a navigation entry.
 *
 * @returns Id string shaped `nav-<timestamp>-<random>`.
 */
export function generateNavigationItemId(): string {
    return generateId('nav');
}
