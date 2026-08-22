import type { IComponentLibraryItem } from '../../../../common/types/brick';

/** Modals never reach the library: they are not put on the canvas */
const HIDDEN_CATEGORY = 'Modal';

/**
 * Groups the library components by category.
 *
 * The groups are collected in a `Map` rather than in an object: the category comes from a
 * brick file of the consumer and may be the perfectly valid string `__proto__` or
 * `constructor` — on an object such a key reads as a member of `Object.prototype`,
 * the bucket is never initialized and the grouping throws on `.push`. The component
 * renders on SSR, so that throw takes the whole editor page down with a 500.
 *
 * @param components - Flat list of the library components.
 * @returns Map of "category → components", in the order the categories first appear.
 */
export function groupComponentsByCategory(
    components: IComponentLibraryItem[]
): Map<string, IComponentLibraryItem[]> {
    return components
        .filter((component) => component.category !== HIDDEN_CATEGORY)
        .reduce<Map<string, IComponentLibraryItem[]>>((grouped, component) => {
            const bucket = grouped.get(component.category);

            // push, not spread: the accumulator is created right here and never
            // leaks outwards, while copying the bucket for every element would make
            // the grouping quadratic — and the computed recomputes on every typed
            // character of the search
            if (bucket) {
                bucket.push(component);
            } else {
                grouped.set(component.category, [component]);
            }

            return grouped;
        }, new Map());
}
