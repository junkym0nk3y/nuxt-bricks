// #region Imports
// Types
import type { IComponentLibraryItem, TBricksDeviceKey } from '../common/types/brick';
import type { ILayoutProperty } from '../common/types/layoutProperty';
import type { IBlockCanvasContext, IBlockDefinition, TBlockTranslator } from './types/registry';

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

// Constants
import { BASE_DEVICE_KEY } from '../common/constants/devices';

// Utils
import { hasOwnKey, readOwnKey } from '../common/utils/safeRecord';
import { bindLayoutContainer } from './utils/canvasBindings';
import { coerceBlockProps, coercePropertyValue } from './utils/propertyCoercion';
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
        defaultProps: deriveDefaultProps(definition),
    }));
}

/**
 * Localized starting content of a block, ready to be merged into the defaultProps of
 * a library card. Empty for a block that declares no seed.
 *
 * Separate from `getLayoutLibraryItems` on purpose: the library list is assembled
 * once, while the seed follows the current language and has to be recomputed when it
 * changes — a block dragged out after a language switch starts in the new one, and a
 * block already on the canvas keeps what it was created with.
 *
 * @param name - Block name as the registry knows it.
 * @param translate - Translator of the builder.
 * @returns Props to override in the library card, or an empty object.
 */
export function resolveBlockSeedProps(
    name: string,
    translate: TBlockTranslator
): Record<string, unknown> {
    return getBlockDefinition(name)?.seedProps?.(translate) ?? {};
}

/**
 * Keeps of the overrides of a device only what the block actually adapts.
 *
 * A schema saved before a property lost its flag still carries the override, and the
 * panel used to write one for ANY property of a block: a `content` of Text or a `src`
 * of Media could sit in `props.responsive.mobile` and would then reach the canvas —
 * showing a picture the published page has no way of showing, because a media query
 * cannot swap the address of a file.
 *
 * An unknown key travels through untouched: it belongs to a brick component, or to a
 * schema written by a newer version, and dropping it here would quietly take data away.
 *
 * @param definition - Definition of the block.
 * @param overrides - Overrides of one device out of the schema.
 * @returns The overrides that are allowed to reach the surface.
 */
function filterResponsiveOverrides(
    definition: IBlockDefinition,
    overrides: Record<string, unknown>
): Record<string, unknown> {
    const declared = new Map(definition.properties.map((property) => [property.name, property]));

    return Object.fromEntries(
        Object.entries(overrides).filter(([name]) => {
            const property = declared.get(name);

            return property === undefined || property.responsive === true;
        })
    );
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

    if (definition.responsiveMode === 'all' && viewport !== BASE_DEVICE_KEY) {
        const responsive = baseProps.responsive;
        if (responsive && typeof responsive === 'object') {
            const overrides = (responsive as Record<string, unknown>)[viewport];
            if (overrides && typeof overrides === 'object') {
                Object.assign(
                    resolved,
                    filterResponsiveOverrides(definition, overrides as Record<string, unknown>)
                );
            }
        }
    }

    for (const property of definition.properties) {
        if (property.name in resolved) {
            resolved[property.name] = coercePropertyValue(resolved[property.name], property);
        }
    }

    return resolved;
}

/**
 * Returns the canvas binding of a block: either the custom canvasBind from the
 * definition or the generic binding (a container gets layoutProps + layoutId +
 * data-bricks-layout, a leaf gets layoutProps only).
 *
 * Coercion lives here rather than in each binding because the builder hands over two
 * different views of one component and only one of them was ever normalized:
 * `layoutProps` comes through `resolveBlockProps`, while `boundProps` is a copy of the
 * RAW schema props. Text, Media and Svg spread the second one, so a `type` or an
 * `alignment` the definition rejects reached the canvas component untouched — exactly
 * what the published render did before it started coercing.
 *
 * A property the block declares adaptive is overlaid from `layoutProps` — the values
 * already resolved for the sheet being drawn — while everything else keeps its base
 * value. The split is the contract of the `responsive` flag, and it holds in both
 * directions: a content or an address of a file cannot differ per device, so showing an
 * override of one in the editor would promise what the published page has no way of
 * doing; a padding or a fit CAN, so keeping the base there would show the editor a
 * sheet the page has already left. Blocks that build a per-device variable table
 * (Text, Slider) still do so out of `coercedProps` and let CSS pick the step.
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
        const coercedProps = coerceBlockProps(
            definition.properties,
            (ctx.component.props ?? {}) as Record<string, unknown>
        );
        const boundProps: Record<string, unknown> = { ...ctx.boundProps };

        for (const property of definition.properties) {
            if (property.name in boundProps) {
                boundProps[property.name] = coercedProps[property.name];
            }

            // A property the block adapts arrives at the value of the sheet being
            // drawn: `layoutProps` has already resolved the overrides of that device,
            // and only the declared adaptive ones survive the resolver. The rest stay
            // base — a content or an address cannot differ per device, and folding one
            // in here would show in the editor what the page has no way of showing
            if (property.responsive === true && hasOwnKey(ctx.layoutProps, property.name)) {
                boundProps[property.name] = ctx.layoutProps[property.name];
            }
        }

        return definition.canvasBind({ ...ctx, boundProps }, coercedProps);
    }

    if (definition.hasChildren) {
        return bindLayoutContainer(ctx, definition.name);
    }

    return { layoutProps: ctx.layoutProps };
}
