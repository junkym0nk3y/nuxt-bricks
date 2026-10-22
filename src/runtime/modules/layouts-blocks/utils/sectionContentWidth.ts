/**
 * Maximum content width of Section, shared by the canvas component and the published
 * render so that the two surfaces lay the content out by one rule.
 */

// Utils
import { getOverriddenDeviceKeys, getResponsiveOverrides } from './responsiveVars';

/**
 * Maximum content width that limits nothing: a column of the full width of the content
 * box, which is what the flex column of an unlimited section gives its children too.
 */
const UNLIMITED_CONTENT_WIDTH = '100%';

/**
 * The maximum content width of a section as a CSS length. Zero means "no limit" and
 * becomes the full width; on a device it is a deliberate reset of a limit the base
 * device sets. The value is rounded the way every other rem of the block is, so a width
 * that rounds to zero is no limit either, not a content area of zero.
 *
 * @param value - The value of the property, in rem.
 * @returns A CSS length.
 */
export function toSectionMaxWidth(value: unknown): string {
    const rem = Math.round(Math.max(0, Number(value) || 0) * 10) / 10;

    return rem > 0 ? `${rem}rem` : UNLIMITED_CONTENT_WIDTH;
}

/**
 * Whether a value of the property limits anything once rounded.
 *
 * @param value - The value of the property, in rem.
 * @returns Whether the value is a limit.
 */
function isContentLimit(value: unknown): boolean {
    return toSectionMaxWidth(value) !== UNLIMITED_CONTENT_WIDTH;
}

/**
 * Whether a section limits its content width on at least one device. The answer picks the
 * layout model of the section for every device at once: the published render declares the
 * limit for all devices or for none, and the canvas, which only knows the value of the
 * device it draws, has to ask the same question of all of them to pick the same model.
 *
 * The values are judged rounded, the way they are drawn. A value that rounds to zero, which
 * an imported schema or another backend can bring, would otherwise turn the section into a
 * grid with a column of the full width: no limit at all, and the flex behavior of the
 * children lost for nothing.
 *
 * @param props - The coerced props of the block, `props.responsive` included.
 * @returns Whether some device sets a limit.
 */
export function hasSectionContentLimit(props: Record<string, unknown>): boolean {
    return (
        isContentLimit(props.maxWidth) ||
        getOverriddenDeviceKeys(props).some((device) =>
            isContentLimit(getResponsiveOverrides(props, device).maxWidth)
        )
    );
}

/**
 * Layout of a section: a flex column, or, when the section limits its content area, a
 * grid of one column no wider than the limit, centered in the content box. The
 * background, the radius and the padding stay as wide as the section, and the horizontal
 * padding acts as the minimum margin, since the column is the narrower of the content box
 * and the limit. On a device without a limit the column is the full content box.
 *
 * The children become grid items, and only the default flow carries over from the flex
 * column: stacked, as wide as the column, at the top. What a child root asks of a flex
 * container does not: `align-self` aligns it within its own row rather than across, and
 * `flex-grow` and a `margin-top: auto` have no free space to take. The canvas does not
 * show this: there the grid items are the item wrappers, flex columns themselves, and the
 * root of a brick still sits in one. A child of a fixed width is centered by
 * `margin-inline: auto`, which holds in both layouts and on both surfaces. A grid placement
 * of a child root is a different matter: it would open implicit columns past the limit, so
 * the render pins brick roots to the column (see the classes of `TheRenderer`).
 *
 * A grid and not a padding computed from the width: a percentage of a padding resolves
 * against the containing block, which is not the section once the section shares a Flex
 * row. There the padding came out of the width of the whole row, the section could not
 * shrink below it and overflowed the row with no room left for its content, while the
 * canvas, which holds the section inside a wrapper of its own, showed it intact. The
 * column is measured against the section itself on both surfaces. An inner wrapper with a
 * max-width would have done the same, but the children of a section are the items of its
 * drop zone on the canvas, and a wrapper between them would change the zone.
 *
 * `align-content: start` keeps the rows at the top of a section taller than its content,
 * where the flex column keeps its children too.
 *
 * @param maxWidth - The maximum content width as a CSS length, or null without a limit.
 * @returns Inline style declarations of the section.
 */
export function sectionLayoutStyle(maxWidth: string | null): Record<string, string> {
    if (maxWidth === null) {
        return { display: 'flex', flexDirection: 'column' };
    }

    return {
        display: 'grid',
        gridTemplateColumns: `minmax(0, ${maxWidth})`,
        justifyContent: 'center',
        alignContent: 'start',
    };
}
