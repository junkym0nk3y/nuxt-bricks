<script setup lang="ts">
// #region Imports
// Types
import type { IRendererProps } from '../types/render';
import type { IBricksComponent } from '../../common/types/brick';

// Vue
import { computed, h, useCssModule } from 'vue';

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
    allComponents: () => [],
    resolvedProps: () => ({}) as Record<string, Record<string, unknown>>,
});
// #endregion

// #region Data
const styles = useCssModule();
const { findImportModule } = useBrickImports();
const { resolveBrickComponent } = useRendererBricks({ findImportModule });
const allComponents = computed(() => props.allComponents ?? []);
const { renderLayoutComponent, needsContainerWrapper } = useRendererLayouts({
    allComponents,
    styles,
    renderChild: (component) => renderComponent(component),
});
// #endregion

// #region Methods
/**
 * Рендерит компонент из схемы с учётом его типа.
 *
 * @param component - Компонент схемы, который необходимо визуализировать.
 * @returns VNode отрисованного компонента.
 */
function renderComponent(component: IBricksComponent) {
    const visibilityClasses = buildDeviceVisibilityClasses(component.deviceVisibility);
    const ariaAttrs: Record<string, string | undefined> = {};

    if (shouldAriaHideComponent(component.deviceVisibility)) {
        ariaAttrs['aria-hidden'] = 'true';
    }

    const hasContainer = needsContainerWrapper(component);
    const innerAttrs = hasContainer ? {} : ariaAttrs;

    const layoutContent = renderLayoutComponent(component, visibilityClasses, innerAttrs);
    const content = layoutContent ?? renderUiComponent(component, visibilityClasses, innerAttrs);

    return wrapWithContainer(content, component, visibilityClasses, ariaAttrs);
}

/**
 * Рендерит UI-компонент или placeholder, если brick не найден.
 *
 * @param component - Компонент схемы, соответствующий brick-файлу.
 * @returns VNode UI-компонента или placeholder.
 */
function renderUiComponent(
    component: IBricksComponent,
    visibilityClasses: string[],
    extraAttrs: Record<string, string | undefined> = {}
) {
    const componentProps = component.props as Record<string, any>;
    const mergedProps = {
        ...componentProps,
        ...(props.resolvedProps?.[component.id] ?? {}),
    };
    const brickComponent = resolveBrickComponent(component.brickPath);
    const gridItemStyle: Record<string, string> = {};
    if (component.gridColumn) {
        gridItemStyle.gridColumn = component.gridColumn;
    }
    if (component.gridRow) {
        gridItemStyle.gridRow = component.gridRow;
    }

    if (brickComponent) {
        return h(brickComponent, {
            ...mergedProps,
            key: component.id,
            id: component.htmlId || undefined,
            class: [styles.bricksComponent, ...visibilityClasses],
            style: Object.keys(gridItemStyle).length ? gridItemStyle : undefined,
            ...extraAttrs,
        });
    }

    return h(RendererPlaceholder, {
        key: component.id,
        id: component.htmlId || undefined,
        title: `${component.componentName || 'Компонент'} недоступен`,
        description: 'Компонент не найден в библиотеке. Обновите bricks или schema.',
        class: [styles.bricksPlaceholder, ...visibilityClasses],
        style: Object.keys(gridItemStyle).length ? gridItemStyle : undefined,
        ...extraAttrs,
    });
}

/**
 * Оборачивает компонент в контейнер, если требуется фиксированная ширина.
 *
 * @param content - Уже подготовленный vnode.
 * @param component - Компонент схемы для проверки.
 * @returns Исходный контент или обёрнутый в контейнер vnode.
 */
function wrapWithContainer(
    content: ReturnType<typeof h>,
    component: IBricksComponent,
    visibilityClasses: string[],
    extraAttrs: Record<string, string | undefined> = {}
) {
    const hasContainer = needsContainerWrapper(component);

    if (!hasContainer) {
        return content;
    }

    return h(
        'div',
        {
            class: ['bricks-container', styles.container, ...visibilityClasses],
            ...extraAttrs,
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
        grid-row: span 1; // Ограничиваем элемент одной строкой
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
