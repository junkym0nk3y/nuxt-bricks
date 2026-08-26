<script setup lang="ts">
// #region Imports
// Types
import type { IRendererProps } from '../types/render';
import type { IBricksComponent } from '../../common/types/brick';

// Vue
import { computed, h, useCssModule, type VNode } from 'vue';

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
const styles = useCssModule();
const { findImportModule } = useBrickImports();
const { resolveBrickComponent } = useRendererBricks({ findImportModule });
const componentIndex = computed(() => props.componentIndex);
const { renderLayoutComponent, needsContainerWrapper } = useRendererLayouts({
    componentIndex,
    styles,
    renderChild: (component) => renderComponent(component),
});
// #endregion

// #region Methods
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

    > * {
        overflow: hidden;
        min-width: 0;
        min-height: 0;
        grid-row: span 1;
    }
}

.bricksFlex {
    position: relative;
    min-width: 0;

    > * {
        min-width: 0;
    }

    > .bricksComponent {
        width: auto;
    }
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

.bricksComponent {
    display: block;
    width: 100%;
}
</style>
