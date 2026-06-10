<script setup lang="ts">
// #region Imports
// Types
import type { ILandingRendererProps } from '../../types/render';
import type { LandingComponent } from '../../types/landing';

// Vue
import { computed, h, useCssModule } from 'vue';

// Composables
import { useStoryImports } from '../../composables/useStoryImports';
import { useLandingRendererStories } from '../../composables/useLandingRendererStories';
import { useLandingRendererLayouts } from '../../composables/useLandingRendererLayouts';
import { useLandingConfig } from '../../composables/useLandingConfig';

// Components
import BricksRendererPlaceholder from './BricksRendererPlaceholder.vue';

// Utils
import {
    buildDeviceVisibilityClasses,
    shouldAriaHideComponent,
} from '../../utils/landing/deviceVisibility';
// #endregion

// #region Props
const props = withDefaults(defineProps<ILandingRendererProps>(), {
    allComponents: () => [],
    resolvedProps: () => ({}) as Record<string, Record<string, unknown>>,
});
// #endregion

// #region Data
const styles = useCssModule();
const { findImportModule } = useStoryImports();
const { resolveStoryComponent } = useLandingRendererStories({ findImportModule });
const allComponents = computed(() => props.allComponents ?? []);
const { renderLayoutComponent, needsContainerWrapper } = useLandingRendererLayouts({
    allComponents,
    styles,
    renderChild: (component) => renderComponent(component),
});

const config = useLandingConfig();
const cbp = config.canvasBreakpoints;

/** Флаг: хотя бы один breakpoint имеет overrideContainer */
const hasContainerOverride =
    cbp.desktop.overrideContainer || cbp.tablet.overrideContainer || cbp.mobile.overrideContainer;
// #endregion

// #region Methods
/**
 * Рендерит компонент из схемы с учётом его типа.
 *
 * @param component - Компонент схемы, который необходимо визуализировать.
 * @returns VNode отрисованного компонента.
 */
function renderComponent(component: LandingComponent) {
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
 * Рендерит UI-компонент или placeholder, если story не найден.
 *
 * @param component - Компонент схемы, соответствующий story-файлу.
 * @returns VNode UI-компонента или placeholder.
 */
function renderUiComponent(
    component: LandingComponent,
    visibilityClasses: string[],
    extraAttrs: Record<string, string | undefined> = {}
) {
    const componentProps = component.props as Record<string, any>;
    const mergedProps = {
        ...componentProps,
        ...(props.resolvedProps?.[component.id] ?? {}),
    };
    const storyComponent = resolveStoryComponent(component.storyPath);
    const gridItemStyle: Record<string, string> = {};
    if (component.gridColumn) {
        gridItemStyle.gridColumn = component.gridColumn;
    }
    if (component.gridRow) {
        gridItemStyle.gridRow = component.gridRow;
    }

    if (storyComponent) {
        return h(storyComponent, {
            ...mergedProps,
            key: component.id,
            id: component.htmlId || undefined,
            class: [styles.landingComponent, ...visibilityClasses],
            style: Object.keys(gridItemStyle).length ? gridItemStyle : undefined,
            ...extraAttrs,
        });
    }

    return h(BricksRendererPlaceholder, {
        key: component.id,
        id: component.htmlId || undefined,
        title: `${component.componentName || 'Компонент'} недоступен`,
        description: 'Компонент не найден в библиотеке. Обновите stories или schema.',
        class: [styles.landingPlaceholder, ...visibilityClasses],
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
    component: LandingComponent,
    visibilityClasses: string[],
    extraAttrs: Record<string, string | undefined> = {}
) {
    const hasContainer = needsContainerWrapper(component);

    if (!hasContainer) {
        return content;
    }

    const containerAttrs: Record<string, string | undefined> = { ...extraAttrs };
    if (hasContainerOverride) {
        containerAttrs['data-bricks-container'] = '';
    }

    return h(
        'div',
        {
            class: ['container', styles.container, ...visibilityClasses],
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

.landingGrid {
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

.landingFlex {
    position: relative;
    min-width: 0;

    > * {
        min-width: 0;
    }

    > .landingComponent {
        width: auto;
    }
}

.landingGrid > *:first-child {
    grid-column: var(--bricks-grid-lead-left, auto);
}

.landingGrid > *:last-child {
    grid-column: var(--bricks-grid-lead-right, auto);
}

.landingSpace {
    display: block;
    width: 100%;
}

.landingText {
    display: block;
}

.landingTitle {
    display: block;
}

.landingImage {
    min-width: 0;
}

.landingPlaceholder {
    width: 100%;
}

.landingComponent {
    display: block;
    width: 100%;
}
</style>
