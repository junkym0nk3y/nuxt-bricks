<script setup lang="ts">
// #region Imports
// Types
import type { IRendererProps, IRendererSsrContext } from '../types/render';
import type { IBricksComponent } from '../../common/types/brick';

// Vue
import { computed, h, useCssModule, useSSRContext, type VNode } from 'vue';

// Composables
import { useBrickImports } from '../../common/composables/useBrickImports';
import { useRendererBricks } from '../composables/useRendererBricks';
import { useRendererLayouts } from '../composables/useRendererLayouts';

// Components
import RendererPlaceholder from './RendererPlaceholder.vue';

// Utils
import {
    buildDeviceVisibilityClasses,
    shouldAriaHideComponent,
} from '../../common/utils/bricks/deviceVisibility';
// #endregion

// #region Props
const props = withDefaults(defineProps<IRendererProps>(), {
    resolvedProps: () => new Map<string, Record<string, unknown>>(),
    placeholderLabels: null,
});
// #endregion

// #region Data
/**
 * Classes of the render.
 *
 * The rules that give a default to a root the render does not own — the root of a brick
 * (`bricksComponent`) and any child of a Grid or a Flex — sit inside `:where()`, so their
 * specificity is zero and the root class of the brick always wins. With a plain class both
 * had the same specificity, and the winner was the stylesheet linked later in the SSR
 * HTML: a card brick in a Grid with `display: flex` and a `min-height` of its own came out
 * as a collapsed block without JS, while with JS Vite inserted the brick styles last and
 * hid it.
 *
 * Three rules keep their class on purpose. The lead-cell placement of a Grid lays the grid
 * out rather than giving a default. The `width: auto` of a brick root in a Flex mirrors
 * the canvas, where a Flex holds the brick inside a wrapper sized by its content: a root
 * declaring `width: 100%` resolves against that wrapper there and shares the row by its
 * content instead of stretching across it. With its two classes the rule outranks the
 * root class of the brick, as it always did, so it never depended on the order of the
 * stylesheets. The parity covers a root width of 100% alone: any other width of a brick
 * root resolves on the canvas, against the wrapper for a percentage, and is overridden
 * here, a divergence older than the `:where()` and not settled by it.
 *
 * The third pins a brick root in a Section to the column. A section limiting its content
 * width lays its children out as the cells of a one-column grid, and a `grid-column` or a
 * `grid-row` in the root class of a brick would open implicit columns past the limit or
 * reorder the content. The flex column of a section without a limit ignores both, and so
 * does the canvas, where the cell is the item wrapper and not the root. The attribute of
 * the section and the class outrank the root class of the brick whatever the order.
 */
const styles = useCssModule();
const ssrContext = import.meta.server ? useSSRContext<IRendererSsrContext>() : undefined;
const { findImportModule } = useBrickImports();
const { resolveBrickComponent } = useRendererBricks({
    findImportModule,
    registerSsrModule: ssrContext ? registerSsrModule : undefined,
});
const componentIndex = computed(() => props.componentIndex);
const { renderLayoutComponent, needsContainerWrapper } = useRendererLayouts({
    componentIndex,
    styles,
    renderChild: (component) => renderComponent(component),
});
// #endregion

// #region Methods
/**
 * Registers a key of the client manifest with the SSR response, which then links the
 * stylesheets of that chunk and of everything it imports.
 *
 * @param manifestKey - Key of the client manifest.
 */
function registerSsrModule(manifestKey: string): void {
    if (!ssrContext) {
        return;
    }

    (ssrContext.modules ??= new Set()).add(manifestKey);
}

/**
 * Renders a component from the schema according to its type.
 *
 * @param component - Schema component that has to be visualized.
 * @returns VNode of the rendered component.
 */
function renderComponent(component: IBricksComponent) {
    const visibilityClasses = buildDeviceVisibilityClasses(component.deviceVisibility);
    const ariaAttrs: Record<string, string | undefined> = {};

    if (shouldAriaHideComponent(component.deviceVisibility)) {
        ariaAttrs['aria-hidden'] = 'true';
    }

    // The container carries `aria-hidden` when there is one, the component itself
    // otherwise. The answer is computed once and handed to the wrapper: asking twice
    // spread one decision over two functions and held only as long as both agreed
    const hasContainer = needsContainerWrapper(component);
    const componentAttrs = hasContainer ? {} : ariaAttrs;

    return wrapWithContainer(
        renderLayoutOrBrick(component, visibilityClasses, componentAttrs),
        hasContainer,
        visibilityClasses,
        ariaAttrs
    );
}

/**
 * Dispatches a schema component: a layout block of the registry, the placeholder
 * of a refused layout block, or a brick file of the consumer.
 *
 * @param component - Schema component.
 * @returns VNode of the chosen branch.
 */
function renderLayoutOrBrick(
    component: IBricksComponent,
    visibilityClasses: string[],
    extraAttrs: Record<string, string | undefined>
): VNode {
    const layoutResult = renderLayoutComponent(component, visibilityClasses, extraAttrs);

    if (layoutResult.kind === 'rendered') {
        return layoutResult.vnode;
    }

    // A layout block the guard refused (a cycle or a chain over the depth limit)
    // must not travel into the brick resolver: layout blocks have no brick files,
    // the resolver answers `undefined` on the `layout` prefix without a word, and
    // the visitor would be shown "the component is missing from the library" —
    // a wrong diagnosis for a corrupted component tree. The reason itself is not
    // shown: it is an internal detail of the schema, and it goes to the log
    if (layoutResult.kind === 'refused') {
        return renderPlaceholder(component, visibilityClasses, extraAttrs);
    }

    return renderUiComponent(component, visibilityClasses, extraAttrs);
}

/**
 * Grid placement of a component: it is kept for the placeholder too, otherwise a
 * neighbor of a failed cell would slide into its place.
 *
 * @param component - Schema component.
 * @returns The style object, or undefined when the component has no placement.
 */
function buildGridItemStyle(component: IBricksComponent): Record<string, string> | undefined {
    const gridItemStyle: Record<string, string> = {};

    if (component.gridColumn) {
        gridItemStyle.gridColumn = component.gridColumn;
    }

    if (component.gridRow) {
        gridItemStyle.gridRow = component.gridRow;
    }

    return Object.keys(gridItemStyle).length ? gridItemStyle : undefined;
}

/**
 * Renders the placeholder of an unavailable component.
 *
 * @param component - Schema component.
 * @param description - What exactly is wrong; omitted when there is nothing to
 * tell the visitor beyond the fact itself.
 * @returns VNode of the placeholder.
 */
function renderPlaceholder(
    component: IBricksComponent,
    visibilityClasses: string[],
    extraAttrs: Record<string, string | undefined>,
    description = ''
): VNode {
    const labels = props.placeholderLabels;

    // Without labels this is a published page: which brick failed to resolve is the
    // internal state of the library, and `render` has no locales to say it in the
    // language of the site — so the visitor is shown nothing at all. The node still
    // takes its place in the grid (and keeps the id): the comment on
    // buildGridItemStyle explains why a neighbor would otherwise slide into the
    // failed cell.
    if (!labels) {
        return h('div', {
            key: component.id,
            id: component.htmlId || undefined,
            class: visibilityClasses,
            style: buildGridItemStyle(component),
            ...extraAttrs,
            'aria-hidden': 'true',
        });
    }

    return h(RendererPlaceholder, {
        key: component.id,
        id: component.htmlId || undefined,
        title: labels.title(component.componentName || ''),
        description,
        class: [styles.bricksPlaceholder, ...visibilityClasses],
        style: buildGridItemStyle(component),
        ...extraAttrs,
    });
}

/**
 * Renders a UI component, or the placeholder when the brick is not found.
 *
 * @param component - Schema component matching a brick file.
 * @returns VNode of the UI component or of the placeholder.
 */
function renderUiComponent(
    component: IBricksComponent,
    visibilityClasses: string[],
    extraAttrs: Record<string, string | undefined> = {}
) {
    const componentProps = component.props as Record<string, unknown>;
    const mergedProps = {
        ...componentProps,
        ...(props.resolvedProps?.get(component.id) ?? {}),
    };
    const brickComponent = resolveBrickComponent(component.brickPath);

    if (brickComponent) {
        return h(brickComponent, {
            ...mergedProps,
            key: component.id,
            id: component.htmlId || undefined,
            class: [styles.bricksComponent, ...visibilityClasses],
            style: buildGridItemStyle(component),
            ...extraAttrs,
        });
    }

    return renderPlaceholder(
        component,
        visibilityClasses,
        extraAttrs,
        props.placeholderLabels?.missingBrick
    );
}

/**
 * Wraps the component into a container when a fixed width is required.
 *
 * @param content - The already prepared vnode.
 * @param hasContainer - Whether a container is required; decided by the caller.
 * @param visibilityClasses - Device visibility classes of the component.
 * @param containerAttrs - Attributes that belong to the container alone.
 * @returns The original content, or the vnode wrapped into a container.
 */
function wrapWithContainer(
    content: VNode,
    hasContainer: boolean,
    visibilityClasses: string[],
    containerAttrs: Record<string, string | undefined>
): VNode {
    if (!hasContainer) {
        return content;
    }

    return h(
        'div',
        {
            class: ['bricks-container', styles.container, ...visibilityClasses],
            ...containerAttrs,
        },
        [content]
    );
}
// #endregion
</script>

<template>
    <component :is="() => renderComponent(props.component)" />
</template>

<style module lang="scss">
.container {
    width: 100%;
    margin: 0 auto;
}

.bricksGrid {
    position: relative;
    grid-auto-flow: var(--bricks-grid-auto-flow, row);
    grid-template-rows: var(--bricks-grid-rows, auto);
    grid-auto-rows: var(--bricks-grid-auto-rows, auto);
    min-width: 0;
}

:where(.bricksGrid > *) {
    overflow: hidden;
    min-width: 0;
    min-height: 0;
    grid-row: span 1;
}

.bricksFlex {
    position: relative;
    min-width: 0;

    > .bricksComponent {
        width: auto;
    }
}

[data-bricks-layout='section'] > .bricksComponent {
    grid-column: 1 / -1;
    grid-row: auto;
}

:where(.bricksFlex > *) {
    min-width: 0;
}

.bricksGrid > *:first-child {
    grid-column: var(--bricks-grid-lead-left, auto);
}

.bricksGrid > *:last-child {
    grid-column: var(--bricks-grid-lead-right, auto);
}

.bricksSpace {
    display: block;
    width: 100%;
}

.bricksText {
    display: block;
}

.bricksImage {
    min-width: 0;
}

.bricksPlaceholder {
    width: 100%;
}

:where(.bricksComponent) {
    display: block;
    width: 100%;
}
</style>
