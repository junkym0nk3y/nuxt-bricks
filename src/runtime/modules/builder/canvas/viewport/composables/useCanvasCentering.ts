// Vue
import { watch, onBeforeUnmount, type Ref } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';

/**
 * Горизонтальное центрирование канваса: rAF-планировщик с приоритетом
 * smooth-поведения + watcher'ы на появление контейнера, изменение
 * scale/width канваса и видимость/ширину левого сайдбара.
 */
export function useCanvasCentering(canvasContainer: Ref<HTMLElement | null>) {
    const canvasStore = useCanvasStore();
    const sidebarStore = useSidebarStore();

    let centerAnimationFrame: number | null = null;
    let pendingCenterBehavior: ScrollBehavior = 'auto';

    /**
     * Центрирует канвас по горизонтали относительно доступной ширины.
     * При ручном зуме (wheel/кнопки) не вмешивается — позицией скролла
     * управляет пользователь (zoom-to-cursor в useCanvasWheel).
     *
     * @param options - Настройки прокрутки контейнера.
     */
    function centerCanvasHorizontally(options: { behavior?: ScrollBehavior } = {}): void {
        if (typeof window === 'undefined' || canvasStore.hasManualZoom) {
            return;
        }

        const container = canvasContainer.value;

        if (!container) {
            return;
        }

        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        const behavior = options.behavior ?? 'auto';

        if (maxScrollLeft <= 0) {
            container.scrollLeft = 0;
            return;
        }

        const targetLeft = maxScrollLeft / 2;

        if (behavior === 'smooth' && typeof container.scrollTo === 'function') {
            container.scrollTo({
                left: targetLeft,
                behavior,
            });
            return;
        }

        container.scrollLeft = targetLeft;
    }

    /**
     * Планирует центрирование канваса в ближайшем кадре анимации.
     *
     * @param behavior - Поведение прокрутки (`auto` или `smooth`).
     */
    function scheduleCanvasCenter(behavior: ScrollBehavior = 'auto'): void {
        if (behavior === 'smooth') {
            pendingCenterBehavior = 'smooth';
        } else if (pendingCenterBehavior !== 'smooth') {
            pendingCenterBehavior = behavior;
        }

        if (centerAnimationFrame !== null) {
            cancelAnimationFrame(centerAnimationFrame);
        }

        centerAnimationFrame = requestAnimationFrame(() => {
            centerAnimationFrame = null;
            centerCanvasHorizontally({ behavior: pendingCenterBehavior });
            pendingCenterBehavior = 'auto';
        });
    }

    /**
     * Отслеживает появление canvasContainer и центрирует канвас
     * При монтировании контейнера автоматически центрирует его по горизонтали
     */
    watch(
        () => canvasContainer.value,
        (container) => {
            if (container) {
                scheduleCanvasCenter('auto');
            }
        }
    );

    /**
     * Отслеживает изменения масштаба и ширины канваса.
     * При изменении этих параметров пересчитывает центрирование.
     */
    watch(
        () => [canvasStore.scale, canvasStore.width],
        () => {
            scheduleCanvasCenter('auto');
        }
    );

    /**
     * Отслеживает видимость и ширину левого сайдбара и правой панели свойств.
     * При открытии/закрытии плавно центрирует канвас (с анимацией)
     */
    watch(
        () => [
            sidebarStore.left.visible,
            sidebarStore.left.width,
            sidebarStore.right.visible,
            sidebarStore.right.width,
        ],
        () => {
            scheduleCanvasCenter('smooth');
        }
    );

    onBeforeUnmount(() => {
        if (centerAnimationFrame !== null) {
            cancelAnimationFrame(centerAnimationFrame);
            centerAnimationFrame = null;
        }
    });

    return { scheduleCanvasCenter };
}
