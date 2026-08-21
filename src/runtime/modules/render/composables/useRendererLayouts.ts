// #region Imports
// Types
import type { VNode } from 'vue';
import type { IBricksComponent } from '../../common/types/brick';
import type { IRendererLayoutsOptions } from '../types/render';

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
 * @param options - The schema data, the styles and the function that renders
 * child components.
 * @returns The needsContainerWrapper and renderLayoutComponent functions.
 */
export function useRendererLayouts({
    allComponents,
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
    // #endregion

    // #region Methods
    /**
     * Returns the list of child components.
     *
     * @param component - The parent layout.
     * @returns The filtered list of child components.
     */
    function getChildComponents(component: IBricksComponent): IBricksComponent[] {
        if (!component.children || !allComponents.value.length) {
            return [];
        }

        return component.children
            .map((childId) => allComponents.value.find((item) => item.id === childId))
            .filter(Boolean) as IBricksComponent[];
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
     * Renders a layout block through the registry, adding classes from the outer
     * context (device visibility, for example).
     *
     * @param component - Schema component.
     * @param extraClasses - Additional classes.
     * @param extraAttrs - Additional attributes.
     * @returns VNode of the layout block, or `null` for non-layout components.
     */
    function renderLayoutComponent(
        component: IBricksComponent,
        extraClasses: string[] = [],
        extraAttrs: Record<string, string | undefined> = {}
    ): VNode | null {
        const definition = getBlockDefinition(component.componentName);

        if (!definition?.renderPublished) {
            return null;
        }

        if (activeAncestry.has(component.id) || activeAncestry.size >= MAX_COMPONENT_TREE_DEPTH) {
            return null;
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

        return definition.renderPublished({
            component,
            definition,
            extraClasses,
            extraAttrs,
            styles,
            renderChild: scopedRenderChild,
            getChildComponents,
        });
    }
    // #endregion

    return {
        needsContainerWrapper,
        renderLayoutComponent,
    };
}
