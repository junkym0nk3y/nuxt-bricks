// #region Imports
// Types
import type { IComponentLibraryItem, TBricksDeviceKey } from '../common/types/brick';
import type { ILayoutProperty } from '../common/types/layoutProperty';
import type { IBlockCanvasContext, IBlockDefinition } from './types/registry';

// Definitions
import { blockGridDefinition } from './components/blockGrid.definition';
import { blockFlexDefinition } from './components/blockFlex.definition';
import { blockSectionDefinition } from './components/blockSection.definition';
import { blockSpaceDefinition } from './components/blockSpace.definition';
import { blockSliderDefinition } from './components/blockSlider.definition';
import { blockTextDefinition } from './components/blockText.definition';
import { blockMediaDefinition } from './components/blockMedia.definition';
import { blockAccordionDefinition } from './components/blockAccordion.definition';
import { blockSvgDefinition } from './components/blockSvg.definition';

// Utils
import { readOwnKey } from '../common/utils/safeRecord';
// #endregion

/**
 * Registry of the layout blocks. Bundle firewall: the definitions of the containers
 * (Grid/Flex/Section/Space) do NOT import their `.vue` files — their published render
 * is an `h('div')`, and the canvas map lives separately in canvasBlockComponents.ts.
 * The leaf definitions do import their components, for `renderPublished` — which is
 * exactly what the published bundle contains today.
 * Key order = the order of the blocks in the component library.
 */
export const BLOCK_REGISTRY: Record<string, IBlockDefinition> = {
    Grid: blockGridDefinition,
    Flex: blockFlexDefinition,
    Section: blockSectionDefinition,
    Space: blockSpaceDefinition,
    Slider: blockSliderDefinition,
    Text: blockTextDefinition,
    Media: blockMediaDefinition,
    Accordion: blockAccordionDefinition,
    Svg: blockSvgDefinition,
};

/**
 * Returns the definition of a block by the componentName from the schema.
 * Case-insensitive: the canvas works with lowercase names ('grid'), the schema with
 * 'Grid'. `componentName` arrives from the schema and the contract only checks it for
 * being a non-empty string, hence the lookup by own key alone.
 *
 * @param name - Block name ('Grid' or 'grid').
 * @returns The definition, or undefined for an unknown block.
 */
export function getBlockDefinition(name: string): IBlockDefinition | undefined {
    const direct = readOwnKey(BLOCK_REGISTRY, name);

    if (direct) {
        return direct;
    }

    const lowered = name.toLowerCase();
    return Object.values(BLOCK_REGISTRY).find((def) => def.name.toLowerCase() === lowered);
}

/**
 * Returns the editor panel properties of a block.
 *
 * @param name - Block name.
 * @returns Array of property definitions (empty for an unknown block).
 */
export function getBlockProperties(name: string): ILayoutProperty[] {
    const definition = getBlockDefinition(name);
    return definition ? definition.properties : [];
}

/**
 * Derives the defaultProps of a block: the panel property defaults plus extraDefaults.
 *
 * @param definition - Block definition.
 * @returns Object of default props for creating the component.
 */
function deriveDefaultProps(definition: IBlockDefinition): Record<string, unknown> {
    const defaults = getBlockProperties(definition.name).reduce<Record<string, unknown>>(
        (acc, property) => {
            acc[property.name] = property.default;
            return acc;
        },
        {}
    );

    return { ...defaults, ...definition.extraDefaults };
}

/**
 * Returns the component library items of every layout block. `LAYOUT_COMPONENTS` used
 * to be assembled by hand and is now derived from this call, so a new block shows up in
 * the library without a second list to keep in sync.
 *
 * @returns Array of library items with derived defaultProps.
 */
export function getLayoutLibraryItems(): IComponentLibraryItem[] {
    return Object.values(BLOCK_REGISTRY).map((definition) => ({
        name: definition.name,
        category: 'Layout',
        brickPath: `layout/${definition.name.toLowerCase()}`,
        description: definition.description,
        thumbnail: definition.thumbnail,
        ...(definition.isInteractive ? { isInteractive: true } : {}),
        defaultProps: deriveDefaultProps(definition),
    }));
}

/**
 * Coerces a value according to its property definition.
 *
 * @param value - Raw value out of props.
 * @param property - Property definition.
 * @returns Normalized value.
 */
function coercePropValue(value: unknown, property: ILayoutProperty): unknown {
    if (property.type === 'number') {
        let numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            numeric = Number(property.default) || 0;
        }
        if (property.min !== undefined) {
            numeric = Math.max(property.min, numeric);
        }
        if (property.max !== undefined) {
            numeric = Math.min(property.max, numeric);
        }
        return numeric;
    }

    if (property.type === 'boolean') {
        return Boolean(value);
    }

    if (property.type === 'select' && property.options) {
        const isValid = property.options.some((option) => option.value === value);
        return isValid ? value : property.default;
    }

    return value;
}

/**
 * Resolves the props of a block for a viewport: a generic merge of
 * `props.responsive[viewport]` (when responsiveMode === 'all') plus coercion by the
 * property definitions. The select-against-options validation here reproduces the
 * rowHeight normalization and the justify/align guards that `useCanvasItemLayout`
 * used to carry itself.
 *
 * @param name - Block name.
 * @param baseProps - Component props out of the schema.
 * @param viewport - Active viewport.
 * @returns Resolved props for binding on the canvas.
 */
export function resolveBlockProps(
    name: string,
    baseProps: Record<string, unknown>,
    viewport: TBricksDeviceKey
): Record<string, unknown> {
    const definition = getBlockDefinition(name);
    if (!definition) {
        return { ...baseProps };
    }

    const resolved: Record<string, unknown> = { ...baseProps };

    if (definition.responsiveMode === 'all' && viewport !== 'desktop') {
        const responsive = baseProps.responsive;
        if (responsive && typeof responsive === 'object') {
            const overrides = (responsive as Record<string, unknown>)[viewport];
            if (overrides && typeof overrides === 'object') {
                Object.assign(resolved, overrides as Record<string, unknown>);
            }
        }
    }

    for (const property of definition.properties) {
        if (property.name in resolved) {
            resolved[property.name] = coercePropValue(resolved[property.name], property);
        }
    }

    return resolved;
}

/**
 * Returns the canvas binding of a block: either the custom canvasBind from the
 * definition or the generic binding (a container gets layoutProps + layoutId +
 * data-bricks-layout, a leaf gets layoutProps only).
 *
 * @param definition - Block definition.
 * @param ctx - Canvas binding context.
 * @returns Props for the canvas component of the block.
 */
export function resolveCanvasBind(
    definition: IBlockDefinition,
    ctx: IBlockCanvasContext
): Record<string, unknown> {
    if (definition.canvasBind) {
        return definition.canvasBind(ctx);
    }

    if (definition.hasChildren) {
        return {
            layoutProps: ctx.layoutProps,
            layoutId: ctx.component.id,
            'data-bricks-layout': definition.name.toLowerCase(),
        };
    }

    return { layoutProps: ctx.layoutProps };
}
