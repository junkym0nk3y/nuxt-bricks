// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';
import type { IResponsiveCssBlock } from '../types/responsiveCss';

// Constants
import { BASE_DEVICE_KEY, BASE_VAR_SUFFIX } from '../../common/constants/devices';

// Utils
import { buildDeviceMediaQuery, deviceRanges } from '../../common/utils/bricks/devices';

// Registry
import { BLOCK_REGISTRY } from '../registry';
// #endregion

/**
 * Collects the registry blocks that declared responsiveCssVars.
 * The selector is `[data-bricks-layout="<name>"]`; a prefix may be shared (Media and
 * Svg both use the common `--bricks-media-*`).
 *
 * @returns Array of blocks to generate CSS rules for.
 */
function getResponsiveCssBlocks(): IResponsiveCssBlock[] {
    return Object.values(BLOCK_REGISTRY).flatMap((definition) =>
        definition.responsiveCssVars
            ? [
                  {
                      selector: `[data-bricks-layout="${definition.name.toLowerCase()}"]`,
                      prefix: definition.responsiveCssVars.prefix,
                      vars: definition.responsiveCssVars.vars,
                  },
              ]
            : []
    );
}

/**
 * Generates the rule that picks the active variables of a block for a device.
 *
 * Device variables are emitted sparsely — only where an override really exists — so
 * the active rule FIRST clears the device variable on the element itself, and only
 * then reads it with a fallback to the base value.
 *
 * The reset is mandatory: custom properties are inherited, and without it a nested
 * block with no override of its own would read the value of a parent of the same type
 * (a nested Grid would take the columns of the outer Grid), and the fallback would
 * never fire at all. The reset does not touch the inline value of the element itself —
 * a declaration in `style` beats a declaration coming from a style rule.
 *
 * @param selector - CSS selector of the rule.
 * @param block - Block with its prefix/vars.
 * @param deviceKey - Key of the active device.
 * @param indent - Base indent of the rule.
 * @returns Text of the CSS rule.
 */
function buildBlockRule(
    selector: string,
    block: IResponsiveCssBlock,
    deviceKey: string,
    indent: string
): string {
    const isBase = deviceKey === BASE_DEVICE_KEY;

    const lines = block.vars.flatMap((name) => {
        const varName = `--bricks-${block.prefix}-${name}`;
        const baseVar = `${varName}-${BASE_VAR_SUFFIX}`;

        // The base lives in the ordinary block props and is always emitted — read it
        // directly
        if (isBase) {
            return [`${indent}    ${varName}: var(${baseVar});`];
        }

        const deviceVar = `${varName}-${deviceKey}`;
        return [
            `${indent}    ${deviceVar}: initial;`,
            `${indent}    ${varName}: var(${deviceVar}, var(${baseVar}));`,
        ];
    });

    return `${indent}${selector} {\n${lines.join('\n')}\n${indent}}`;
}

/**
 * Generates the whole CSS that selects the responsive variables of the layout blocks
 * from the registry, following three templates: the base device defaults, the builder
 * canvas (`data-bricks-viewport`) and the published media queries over the ranges of
 * the set.
 *
 * @param devices - Resolved device set of the page.
 * @returns CSS to inject into a `<style>`.
 */
export function buildResponsiveLayoutCss(devices: TBricksResolvedDeviceSet): string {
    const blocks = getResponsiveCssBlocks();

    const defaults = blocks
        .map((block) => buildBlockRule(block.selector, block, BASE_DEVICE_KEY, '        '))
        .join('\n\n');

    const builder = devices
        .map((device) =>
            blocks
                .map((block) =>
                    buildBlockRule(
                        `.bricks-canvas[data-bricks-viewport="${device.key}"] ${block.selector}`,
                        block,
                        device.key,
                        '        '
                    )
                )
                .join('\n\n')
        )
        .join('\n\n');

    const published = deviceRanges(devices)
        .map((range) => {
            const query = buildDeviceMediaQuery(range);

            const rules = blocks
                .map((block) => buildBlockRule(block.selector, block, range.key, '            '))
                .join('\n\n');

            return `        ${query} {\n${rules}\n        }`;
        })
        .join('\n\n');

    return `
        /* ===== Responsive layout vars: Defaults (base device) ===== */
${defaults}

        /* ===== Responsive layout vars: Builder (canvas viewport) ===== */
${builder}

        /* ===== Responsive layout vars: Published (real viewport) ===== */
${published}
    `;
}
