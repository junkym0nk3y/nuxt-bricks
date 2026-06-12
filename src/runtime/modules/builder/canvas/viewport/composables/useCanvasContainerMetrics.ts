// Types
import type { ICanvasContainerMetricsOptions } from '../../types/composables';

// Vue
import { watch, nextTick, onBeforeUnmount } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';
import { useComponentsStore } from '../../../core/stores/components';

/**
 * Синхронизация высоты канваса с контентом: пересчёт метрик контейнера
 * при изменении состава компонентов / viewport / Figma mode и ResizeObserver
 * с переподключением при смене containerRef.
 */
export function useCanvasContainerMetrics(options: ICanvasContainerMetricsOptions) {
    const canvasStore = useCanvasStore();
    const componentsStore = useComponentsStore();
    const { containerRef, scheduleCanvasCenter, scrollToSelected } = options;

    let containerResizeObserver: ResizeObserver | null = null;

    /**
     * Обновляет высоту канваса исходя из содержимого корневого контейнера.
     */
    function updateContainerMetrics(): void {
        const container = containerRef.value;
        if (!container) {
            return;
        }

        const previousMinHeight = container.style.minHeight;
        container.style.minHeight = '';
        const contentHeight = container.scrollHeight;
        container.style.minHeight = previousMinHeight;
        canvasStore.syncCanvasHeightWithContent(contentHeight, componentsStore.hasComponents);
    }

    /**
     * Создаёт ResizeObserver контейнера (вызывается из onMounted компонента,
     * когда containerRef уже отрендерен).
     */
    function initMetricsObserver(): void {
        containerResizeObserver = new ResizeObserver(() => {
            updateContainerMetrics();
            scheduleCanvasCenter('auto');
        });
        if (containerRef.value) {
            containerResizeObserver.observe(containerRef.value);
        }
    }

    /**
     * Пересчитывает высоту канваса при изменении состава компонентов.
     *
     * Два источника покрывают все кейсы:
     * - `components` (ссылка) — ловит полную замену массива (loadSchema, undo/redo)
     * - `components.length` — ловит мутации (push в addComponent, splice в moveComponentToRoot)
     *
     * ResizeObserver не срабатывает при уменьшении контента (minHeight не даёт контейнеру сжаться),
     * поэтому нужен явный пересчёт при add/remove/import.
     */
    watch([() => componentsStore.components, () => componentsStore.components.length], () => {
        nextTick(() => {
            updateContainerMetrics();
        });
    });

    /**
     * Пересчитывает высоту канваса после смены viewport.
     *
     * При смене адаптива (mobile → tablet → desktop) контент перестраивается:
     * компоненты меняют высоту из-за другой ширины, grid-колонки перестраиваются,
     * container queries переключаются. Высота сбрасывается до базовой в setViewport,
     * здесь подбираем правильную после рендера.
     */
    watch(
        () => canvasStore.viewport,
        () => {
            nextTick(() => {
                updateContainerMetrics();
                scrollToSelected();
            });
        }
    );

    /**
     * Переподключает ResizeObserver при смене containerRef.
     *
     * При переключении Figma ↔ Normal режимов v-if уничтожает старый DOM-элемент
     * и создаёт новый. ResizeObserver остаётся на старом (уничтоженном) элементе,
     * поэтому updateContainerMetrics() перестаёт вызываться автоматически.
     */
    watch(containerRef, (newContainer, oldContainer) => {
        if (containerResizeObserver) {
            if (oldContainer) {
                containerResizeObserver.unobserve(oldContainer);
            }
            if (newContainer) {
                containerResizeObserver.observe(newContainer);
            }
        }
    });

    /**
     * Отслеживает переключение Figma Mode.
     * Ждёт обновления DOM (v-if рендерит/убирает figmaWrapper),
     * затем пересчитывает высоту канваса и центрирует его.
     */
    watch(
        () => canvasStore.isFigmaMode,
        (isFigma) => {
            nextTick(() => {
                updateContainerMetrics();
                scheduleCanvasCenter('auto');

                // При выходе из Figma mode — скроллим до выбранного компонента
                if (!isFigma) {
                    scrollToSelected();
                }
            });
        }
    );

    onBeforeUnmount(() => {
        if (containerResizeObserver && containerRef.value) {
            containerResizeObserver.unobserve(containerRef.value);
        }
        containerResizeObserver?.disconnect();
        containerResizeObserver = null;
    });

    return { updateContainerMetrics, initMetricsObserver };
}
