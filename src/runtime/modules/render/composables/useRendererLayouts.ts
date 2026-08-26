// #region Imports
// Types
import type { IBricksComponent } from '../../common/types/brick';
import type {
    IRendererLayoutsOptions,
    TRendererLayoutRefusalReason,
    TRendererLayoutResult,
} from '../types/render';

// Utils
import { getBlockDefinition } from '../../layouts-blocks/registry';
import { MAX_COMPONENT_TREE_DEPTH } from '../../common/utils/bricks/schemaContract';
// #endregion

/**
 * Composable for rendering the layout blocks of a published page.
 * Dispatch through the registry: every block carries its own `renderPublished`
 * in its definition (containers — `h('div')` with per-device CSS vars, leaf
 * blocks — a `.vue` component of their own).
 *
 * @param options - The component index of the schema, the styles and the function
 * that renders child components.
 * @returns The needsContainerWrapper and renderLayoutComponent functions.
 */
export function useRendererLayouts({
    componentIndex,
    styles,
    renderChild,
}: IRendererLayoutsOptions) {
    // #region Data
    /**
     * Ids of the layout ancestors of the active renderChild call. Blocks that
     * render their children later (Slider calls renderSlide from its own `.vue`
     * after renderPublished has already returned) get a snapshot of the chain in
     * a closure and put it back for the duration of the call — otherwise a cycle
     * in a corrupted schema (A -> B -> A) goes undetected and the recursion is
     * unbounded.
     */
    let activeAncestry: ReadonlySet<string> = new Set<string>();

    /**
     * Refusals already reported, as `<reason>:<componentId>`.
     *
     * Per instance rather than per module: a schema is not the immutable import
     * map of the brick files — the live preview replaces it, and one and the same
     * component id belongs to different pages. A module-level set would silence
     * the refusal of every later page and of every later SSR request; this one
     * only keeps a reactive redraw of the same branch from repeating itself.
     */
    const reportedRefusals = new Set<string>();
    // #endregion

    // #region Methods
    /**
     * Returns the list of child components.
     *
     * The index is read at call time and never captured into a local: blocks that
     * render their children later (the slider calls renderSlide from its own `.vue`
     * long after renderPublished has returned) would otherwise resolve ids against
     * the schema that was current when the composable was created, and the live
     * preview replaces the schema underneath them.
     *
     * @param component - The parent layout.
     * @returns The child components, in the order of `children`, missing references
     * dropped.
     */
    function getChildComponents(component: IBricksComponent): IBricksComponent[] {
        if (!component.children) {
            return [];
        }

        return component.children
            .map((childId) => componentIndex.value.get(childId))
            .filter((child): child is IBricksComponent => Boolean(child));
    }

    /**
     * Checks whether a width-constraining container is needed.
     *
     * @param component - Top-level component.
     * @returns Whether a container is required.
     */
    function needsContainerWrapper(component: IBricksComponent): boolean {
        if (component.parent) {
            return false;
        }

        return component.fullWidth !== true;
    }

    /**
     * Reports a refusal of the guard, once per pair of reason and component.
     *
     * At the `warn` level and not `error`: the page stays operable, one block
     * does not render. Without this report the refusal was silent — the caller
     * could not tell it from "this is not a layout block" and showed the visitor
     * the placeholder of a brick missing from the library.
     *
     * @param component - Component whose rendering was refused.
     * @param reason - Which of the two guards refused it.
     */
    function reportLayoutRefusal(
        component: IBricksComponent,
        reason: TRendererLayoutRefusalReason
    ): void {
        const refusalKey = `${reason}:${component.id}`;

        if (reportedRefusals.has(refusalKey)) {
            return;
        }

        reportedRefusals.add(refusalKey);

        console.warn('[useRendererLayouts] Layout block refused: the component tree is invalid', {
            reason,
            componentId: component.id,
            componentName: component.componentName,
            ...(reason === 'depth' ? { maxComponentTreeDepth: MAX_COMPONENT_TREE_DEPTH } : {}),
        });
    }

    /**
     * Renders a layout block through the registry, adding classes from the outer
     * context (device visibility, for example).
     *
     * @param component - Schema component.
     * @param extraClasses - Additional classes.
     * @param extraAttrs - Additional attributes.
     * @returns The rendered vnode, `not-layout` for a component the registry does
     * not render, or a refusal of the guard with its reason.
     */
    function renderLayoutComponent(
        component: IBricksComponent,
        extraClasses: string[] = [],
        extraAttrs: Record<string, string | undefined> = {}
    ): TRendererLayoutResult {
        const definition = getBlockDefinition(component.componentName);

        if (!definition?.renderPublished) {
            return { kind: 'not-layout' };
        }

        // The cycle is checked first: when both guards hold at once, being one's
        // own ancestor is the more precise diagnosis of the two
        if (activeAncestry.has(component.id)) {
            reportLayoutRefusal(component, 'cycle');

            return { kind: 'refused', reason: 'cycle' };
        }

        if (activeAncestry.size >= MAX_COMPONENT_TREE_DEPTH) {
            reportLayoutRefusal(component, 'depth');

            return { kind: 'refused', reason: 'depth' };
        }

        const ancestry: ReadonlySet<string> = new Set(activeAncestry).add(component.id);

        /**
         * renderChild with the ancestor chain restored: the snapshot lives in the
         * closure, so both the eager calls (Grid/Flex inside renderPublished) and
         * the deferred ones (the slider's renderSlide after this function has
         * returned) see their ancestors.
         */
        const scopedRenderChild: typeof renderChild = (child) => {
            const previousAncestry = activeAncestry;
            activeAncestry = ancestry;

            try {
                return renderChild(child);
            } finally {
                activeAncestry = previousAncestry;
            }
        };

        return {
            kind: 'rendered',
            vnode: definition.renderPublished({
                component,
                definition,
                extraClasses,
                extraAttrs,
                styles,
                renderChild: scopedRenderChild,
                getChildComponents,
            }),
        };
    }
    // #endregion

    return {
        needsContainerWrapper,
        renderLayoutComponent,
    };
}
