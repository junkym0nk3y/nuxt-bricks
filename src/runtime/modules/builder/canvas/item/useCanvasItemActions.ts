// #region Imports
// Types
import type { ICanvasItemProps } from '../types/components';
import type { PropertyDefinition, TBricksDeviceKey } from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';

// Vue
import { computed, nextTick, type ComputedRef, type Ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../stores/components';
import { useCanvasStore } from '../../stores/canvas';
import { useSidebarStore } from '../../stores/sidebar';

// Composables
import { useStoryImports } from '../../../common/composables/useStoryImports';
import { useComponentProperties } from '../../composables/useComponentProperties';

// Utils
import { getLayoutProperties } from '../../utils/layoutProperties';
import { scrollToComponentOnCanvas } from '../../utils/scrollToComponent';

// Constants
import { LAYOUT_COMPONENTS } from '../../constants/layoutComponents';
// #endregion

/**
 * Инкапсулирует обработчики тулбара и логику выбора компонента:
 * действия (удаление, дублирование, скрытие, перемещение, избранное),
 * обработчик клика с загрузкой properties, вычисляемые состояния тулбара.
 */
export function useCanvasItemActions(
    props: ICanvasItemProps,
    isLayout: ComputedRef<boolean>,
    layoutName: ComputedRef<string>,
    availableFonts: string[],
    figmaViewport: Ref<TBricksDeviceKey> | null,
    itemTop: Ref<number>,
    itemRight: Ref<number>,
    isSelected: ComputedRef<boolean>
) {
    const componentsStore = useComponentsStore();
    const canvasStore = useCanvasStore();
    const sidebarStore = useSidebarStore();
    const { findImportModule } = useStoryImports();
    const { storyValuesToProperties } = useComponentProperties();

    // #region Computed
    /**
     * Проверяет, находится ли компонент в режиме интерактивного предпросмотра.
     */
    const isInteractivePreview = computed<boolean>(
        () => componentsStore.interactivePreviewId === props.component.id
    );

    /**
     * Проверяет, является ли компонент избранным по имени.
     */
    const isFavorite = computed<boolean>(() =>
        componentsStore.favorites.includes(props.component.componentName)
    );

    /**
     * Можно ли переместить компонент вверх (не первый среди siblings).
     */
    const canMoveUp = computed<boolean>(() => {
        if (props.component.parent) {
            const parent = componentsStore.getComponentById(props.component.parent);
            if (!parent?.children) {
                return false;
            }
            return parent.children.indexOf(props.component.id) > 0;
        }

        const roots = componentsStore.getRootComponents();
        return roots.findIndex((item) => item.id === props.component.id) > 0;
    });

    /**
     * Можно ли переместить компонент вниз (не последний среди siblings).
     */
    const canMoveDown = computed<boolean>(() => {
        if (props.component.parent) {
            const parent = componentsStore.getComponentById(props.component.parent);
            if (!parent?.children) {
                return false;
            }
            const idx = parent.children.indexOf(props.component.id);
            return idx !== -1 && idx < parent.children.length - 1;
        }

        const roots = componentsStore.getRootComponents();
        const idx = roots.findIndex((item) => item.id === props.component.id);
        return idx !== -1 && idx < roots.length - 1;
    });

    /**
     * Показывать ли тулбар. Виден только при выделении компонента.
     * В Figma mode — только на активном viewport.
     */
    const showToolbar = computed<boolean>(() => {
        if (!isSelected.value) {
            return false;
        }

        if (
            figmaViewport &&
            canvasStore.isFigmaMode &&
            figmaViewport.value !== canvasStore.activeViewport
        ) {
            return false;
        }

        return true;
    });

    /**
     * Стиль позиционирования тулбара в fixed-координатах viewport.
     * Тулбар телепортируется в body, чтобы избежать размытия от canvas transform: scale().
     */
    const toolbarFixedStyle = computed(() => ({
        position: 'fixed' as const,
        top: `${itemTop.value + 8}px`,
        right: `${window.innerWidth - itemRight.value + 8}px`,
    }));
    // #endregion

    // #region Methods
    /**
     * Обрабатывает клик по компоненту: загружает properties и выделяет компонент.
     * Если компонент в режиме интерактивного предпросмотра — пропускает клик к children.
     */
    async function handleClick(event: MouseEvent): Promise<void> {
        if (isInteractivePreview.value) {
            event.stopPropagation();
            return;
        }

        event.stopPropagation();

        let properties: PropertyDefinition[] = [];
        let description: string | undefined;

        if (isLayout.value) {
            properties = getLayoutProperties(layoutName.value, availableFonts);
            description = LAYOUT_COMPONENTS.find(
                (item) => item.storyPath === props.component.storyPath
            )?.description;
        } else {
            const moduleLoader = findImportModule(props.component.storyPath);
            if (moduleLoader) {
                try {
                    const module = await moduleLoader();
                    if (module?.story) {
                        description = (module.story as Record<string, unknown>).description as
                            | string
                            | undefined;

                        if ((module.story as Record<string, unknown>).values !== undefined) {
                            properties = storyValuesToProperties(
                                (module.story as Record<string, unknown>).values as Record<
                                    string,
                                    IBrickValues
                                >
                            );
                        }
                    }
                } catch (error) {
                    console.error('[CanvasItem] Failed to load story:', error);
                }
            }
        }

        // Определяем, нужна ли анимация сайдбара (повлияет на размер канваса)
        const sidebarAlreadyOpen =
            sidebarStore.left.visible && sidebarStore.activeView === 'properties';

        componentsStore.selectComponent(props.component.id, properties, description);

        if (canvasStore.isFigmaMode && figmaViewport) {
            canvasStore.activeViewport = figmaViewport.value;
        }

        // Скроллим до компонента после открытия сайдбара
        // Если сайдбар уже был открыт — достаточно nextTick
        // Если открывался — ждём завершения анимации (300ms transition + буфер)
        // В Figma mode скоупим поиск на активный viewport
        const componentId = props.component.id;
        const scrollViewport =
            canvasStore.isFigmaMode && figmaViewport ? figmaViewport.value : undefined;

        if (sidebarAlreadyOpen) {
            await nextTick();
            scrollToComponentOnCanvas(componentId, scrollViewport);
        } else {
            setTimeout(async () => {
                await nextTick();
                scrollToComponentOnCanvas(componentId, scrollViewport);
            }, 350);
        }
    }

    /** Удаляет компонент с канваса. */
    function handleDelete(): void {
        componentsStore.removeComponent(props.component.id);
    }

    /** Дублирует компонент. */
    function handleCopy(): void {
        componentsStore.duplicateComponent(props.component.id);
    }

    /** Переключает скрытие компонента. */
    function handleToggleHidden(): void {
        componentsStore.setComponentHidden(props.component.id, !props.component.isHidden);
    }

    /** Переключает видимость на конкретном устройстве. */
    function handleToggleDevice(device: 'mobile' | 'tablet' | 'desktop'): void {
        const current = props.component.deviceVisibility?.[device] !== false;
        componentsStore.setComponentDeviceVisibilityFlag(props.component.id, device, !current);
    }

    /** Перемещает компонент вверх. */
    function handleMoveUp(): void {
        componentsStore.moveComponentUp(props.component.id);
    }

    /** Перемещает компонент вниз. */
    function handleMoveDown(): void {
        componentsStore.moveComponentDown(props.component.id);
    }

    /** Переключает избранное. */
    function handleToggleFavorite(): void {
        componentsStore.toggleFavorite(props.component.componentName);
    }

    /**
     * Переключает режим интерактивного предпросмотра для компонента.
     */
    function handleToggleInteractivePreview(): void {
        componentsStore.toggleInteractivePreview(props.component.id);
    }
    // #endregion

    return {
        isFavorite,
        canMoveUp,
        canMoveDown,
        showToolbar,
        toolbarFixedStyle,
        isInteractivePreview,
        handleClick,
        handleDelete,
        handleCopy,
        handleToggleHidden,
        handleToggleDevice,
        handleMoveUp,
        handleMoveDown,
        handleToggleFavorite,
        handleToggleInteractivePreview,
    };
}
