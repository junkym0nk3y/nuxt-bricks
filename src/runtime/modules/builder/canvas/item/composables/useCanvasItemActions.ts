// #region Imports
// Types
import type { ICanvasItemProps, ICanvasContextMenuPosition } from '../../types/components';
import type { TBricksDeviceKey } from '../../../../common/types/brick';

// Vue
import { computed, nextTick, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';

// Composables
import { useComponentEditorMetadata } from '../../../core/composables/useComponentEditorMetadata';
import { useBuilderToast } from '../../../core/composables/useBuilderToast';

// Utils
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';
// #endregion

/**
 * Инкапсулирует обработчики контекстного меню и логику выбора компонента:
 * действия (удаление, буфер обмена, скрытие, перемещение, избранное),
 * обработчик клика с загрузкой properties, состояние контекстного меню.
 */
export function useCanvasItemActions(
    props: ICanvasItemProps,
    figmaViewport: Ref<TBricksDeviceKey> | null
) {
    const componentsStore = useComponentsStore();
    const canvasStore = useCanvasStore();
    const sidebarStore = useSidebarStore();
    const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
    const { showToast } = useBuilderToast();
    const { t } = useI18n();

    // #region Data
    /** Позиция открытого контекстного меню (null — меню закрыто) */
    const contextMenuPosition = ref<ICanvasContextMenuPosition | null>(null);
    // #endregion

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
     * Доступна ли вставка из буфера обмена компонентов.
     */
    const canPaste = computed<boolean>(() => componentsStore.clipboard !== null);
    // #endregion

    // #region Methods
    /**
     * Выделяет компонент: берёт properties из метаданных манифеста либо из
     * layout definitions и синхронизирует активный viewport в Figma mode.
     */
    function selectSelf(): void {
        const { properties, description } = resolveComponentEditorMetadata(props.component);

        componentsStore.selectComponent(props.component.id, properties, description);

        if (canvasStore.isFigmaMode && figmaViewport) {
            canvasStore.activeViewport = figmaViewport.value;
        }
    }

    /**
     * Выделяет компонент и скроллит канвас до него (открытие редактирования).
     */
    async function openEditor(): Promise<void> {
        // Определяем, нужна ли анимация панели свойств (повлияет на размер канваса)
        const sidebarAlreadyOpen = sidebarStore.right.visible;

        selectSelf();

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

    /**
     * Обрабатывает клик по компоненту: выделяет его и скроллит канвас до компонента.
     * Если компонент в режиме интерактивного предпросмотра — пропускает клик к children.
     */
    async function handleClick(event: MouseEvent): Promise<void> {
        event.stopPropagation();

        if (isInteractivePreview.value) {
            return;
        }

        await openEditor();
    }

    /**
     * Открывает контекстное меню в точке курсора. Компонент НЕ выделяется —
     * панель свойств открывает только пункт «Редактировать».
     */
    function handleContextMenu(event: MouseEvent): void {
        if (isInteractivePreview.value) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        contextMenuPosition.value = { x: event.clientX, y: event.clientY };
    }

    /** Пункт «Редактировать»: выделяет компонент и открывает панель свойств. */
    async function handleEdit(): Promise<void> {
        await openEditor();
    }

    /** Закрывает контекстное меню. */
    function closeContextMenu(): void {
        contextMenuPosition.value = null;
    }

    /** Удаляет компонент с канваса. */
    function handleDelete(): void {
        componentsStore.removeComponent(props.component.id);
        showToast(t('bricks.canvas.toastDeleted'));
    }

    /** Копирует компонент в буфер обмена компонентов. */
    function handleCopy(): void {
        componentsStore.copyComponentToClipboard(props.component.id);
        showToast(t('bricks.canvas.toastCopied'));
    }

    /** Вставляет дерево компонентов из буфера обмена. */
    function handlePaste(): void {
        componentsStore.pasteFromClipboard();
        showToast(t('bricks.canvas.toastPasted'));
    }

    /** Дублирует компонент. */
    function handleDuplicate(): void {
        componentsStore.duplicateComponent(props.component.id);
        showToast(t('bricks.canvas.toastPasted'));
    }

    /** Переключает скрытие компонента (toast — только при отключении). */
    function handleToggleHidden(): void {
        const willHide = !props.component.isHidden;
        componentsStore.setComponentHidden(props.component.id, willHide);

        if (willHide) {
            showToast(t('bricks.canvas.toastDisabled'));
        }
    }

    /** Переключает видимость на конкретном устройстве. */
    function handleToggleDevice(device: TBricksDeviceKey): void {
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

    /** Переключает избранное (toast — только при добавлении). */
    function handleToggleFavorite(): void {
        const willAdd = !isFavorite.value;
        componentsStore.toggleFavorite(props.component.componentName);

        if (willAdd) {
            showToast(t('bricks.canvas.toastFavoriteAdded'));
        }
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
        canPaste,
        contextMenuPosition,
        isInteractivePreview,
        handleClick,
        handleContextMenu,
        closeContextMenu,
        handleEdit,
        handleDelete,
        handleCopy,
        handlePaste,
        handleDuplicate,
        handleToggleHidden,
        handleToggleDevice,
        handleMoveUp,
        handleMoveDown,
        handleToggleFavorite,
        handleToggleInteractivePreview,
    };
}
