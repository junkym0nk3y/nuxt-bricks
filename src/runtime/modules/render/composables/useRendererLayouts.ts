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
 * Composable для рендеринга layout-блоков published-страницы.
 * Диспатч через registry: каждый блок несёт свой `renderPublished` в definition
 * (контейнеры — `h('div')` с per-device CSS-vars, leaf-блоки — свой `.vue`-компонент).
 *
 * @param options - Опции с данными схемы, стилями и функцией рендеринга дочерних компонентов.
 * @returns Объект с функциями needsContainerWrapper и renderLayoutComponent.
 */
export function useRendererLayouts({
    allComponents,
    styles,
    renderChild,
}: IRendererLayoutsOptions) {
    // #region Data
    /**
     * Id layout-предков активного вызова renderChild. Блоки с отложенным
     * рендером детей (Slider вызывает renderSlide из своего `.vue` уже после
     * выхода из renderPublished) получают снимок цепочки в замыкании и
     * подставляют его на время вызова — иначе цикл в повреждённой схеме
     * (A -> B -> A) не детектируется и рекурсия не ограничена.
     */
    let activeAncestry: ReadonlySet<string> = new Set<string>();
    // #endregion

    // #region Methods
    /**
     * Возвращает список дочерних компонентов.
     *
     * @param component - Родительский layout.
     * @returns Отфильтрованный список дочерних компонентов.
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
     * Проверяет, нужен ли контейнер с ограничением ширины.
     *
     * @param component - Компонент верхнего уровня.
     * @returns Требуется ли контейнер.
     */
    function needsContainerWrapper(component: IBricksComponent): boolean {
        if (component.parent) {
            return false;
        }

        return component.fullWidth !== true;
    }

    /**
     * Рендерит layout-блок через registry, дополняя классами из внешнего контекста
     * (например, device visibility).
     *
     * @param component - Компонент схемы.
     * @param extraClasses - Дополнительные классы.
     * @param extraAttrs - Дополнительные атрибуты.
     * @returns VNode layout-блока или `null` для не-layout компонентов.
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
         * renderChild с восстановлением цепочки предков: снимок живёт в
         * замыкании, поэтому и eager-вызовы (Grid/Flex внутри renderPublished),
         * и deferred-вызовы (renderSlide слайдера после выхода отсюда) видят
         * своих предков.
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
