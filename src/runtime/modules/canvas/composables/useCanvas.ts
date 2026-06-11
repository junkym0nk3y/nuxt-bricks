import { ref, computed, watch } from 'vue';
import { useCanvasStore } from '../../builder/stores/canvas';
import { useSidebarStore } from '../../builder/stores/sidebar';
import { convertRemToPx } from '../../common/utils/main';
import { useBricksConfig } from '../../common/composables/useBricksConfig';
import { useCanvasRemBase } from './useCanvasRemBase';

/**
 * Хук-обёртка над стором холста, предоставляющий готовые методы управления масштабом,
 * стилями контейнера и реакцию на изменение размеров окна.
 *
 * @returns Объект с ссылками на DOM, реактивные стили и методы масштабирования.
 */
export function useCanvas() {
    const canvasStore = useCanvasStore();
    const sidebarStore = useSidebarStore();
    const config = useBricksConfig();
    const { remCompensation, getRemCompensation } = useCanvasRemBase();
    const canvasContainer = ref<HTMLElement | null>(null);

    /** Gap между viewport-ами в Figma Mode. */
    const FIGMA_GAP_REM = '28rem';
    const FIGMA_GAP_PX = convertRemToPx(FIGMA_GAP_REM);

    /**
     * Высчитывает оптимальный масштаб исходя из доступной ширины окна и состояния сайдбара.
     * В Figma Mode учитывает суммарную ширину трёх viewport-ов.
     *
     * @returns Число от 0 до 1, отражающее рекомендуемый масштаб.
     */
    /** Ширина вертикальной навигационной панели. */
    const VERTICAL_NAV_WIDTH_REM = '7.2rem';
    const VERTICAL_NAV_WIDTH_PX = convertRemToPx(VERTICAL_NAV_WIDTH_REM);

    const calculateOptimalScale = (): number => {
        if (typeof window === 'undefined') {
            return 1;
        }

        const leftWidth = sidebarStore.left.visible ? sidebarStore.left.width : 0;
        const padding = 80;
        const availableWidth =
            window.innerWidth - convertRemToPx(leftWidth) - VERTICAL_NAV_WIDTH_PX - padding;

        if (canvasStore.isFigmaMode) {
            const bp = config.canvasBreakpoints;
            const totalWidth =
                bp.mobile.width * getRemCompensation('mobile') +
                bp.tablet.width * getRemCompensation('tablet') +
                bp.desktop.width * getRemCompensation('desktop') +
                FIGMA_GAP_PX * 2;
            return Math.min(availableWidth / totalWidth, 1);
        }

        // Учитываем rem-компенсацию: канвас визуально увеличивается в remCompensation раз
        const effectiveWidth = canvasStore.width * remCompensation.value;
        const scaleX = availableWidth / effectiveWidth;
        return Math.min(scaleX, 1);
    };

    // Обновляем масштаб при переключении сайдбара, figma mode или viewport (rem compensation)
    watch(
        () => [sidebarStore.left.visible, canvasStore.isFigmaMode, canvasStore.viewport],
        () => {
            const scale = calculateOptimalScale();
            canvasStore.setCanvasScale(scale);
        },
        { immediate: true }
    );

    // CSS-трансформация холста с учётом rem-компенсации (Normal mode)
    const canvasTransform = computed(() => {
        const totalScale = canvasStore.scale * remCompensation.value;
        return `scale(${totalScale})`;
    });

    // CSS-трансформация обёртки Figma Mode — без rem-компенсации,
    // т.к. у каждого viewport своя компенсация (применяется в CanvasViewport)
    const figmaBaseTransform = computed(() => {
        return `scale(${canvasStore.scale})`;
    });

    // CSS-стили контейнера канваса относительно сайдбара
    const canvasContainerStyle = computed(() => {
        const leftWidth = sidebarStore.left.visible ? sidebarStore.left.width : 0;
        const navWidth = VERTICAL_NAV_WIDTH_REM;

        if (leftWidth) {
            return {
                marginLeft: leftWidth,
                width: `calc(100vw - ${leftWidth} - ${navWidth})`,
                height: '100vh',
            };
        }

        return {
            marginLeft: '0',
            width: `calc(100vw - ${navWidth})`,
            height: '100vh',
        };
    });

    /**
     * Служебный обработчик ресайза окна, пересчитывающий актуальный масштаб.
     */
    const handleResize = (): void => {
        const scale = calculateOptimalScale();
        canvasStore.setCanvasScale(scale);
    };

    /**
     * Плавно увеличивает масштаб холста на шаг 0.1.
     */
    const zoomIn = (): void => {
        canvasStore.setCanvasScale(canvasStore.scale + 0.1);
    };

    /**
     * Плавно уменьшает масштаб холста на шаг 0.1.
     */
    const zoomOut = (): void => {
        canvasStore.setCanvasScale(canvasStore.scale - 0.1);
    };

    /**
     * Возвращает масштаб к автоматически подобранному значению.
     */
    const resetZoom = (): void => {
        const scale = calculateOptimalScale();
        canvasStore.setCanvasScale(scale);
    };

    return {
        canvasContainer,
        canvasTransform,
        figmaBaseTransform,
        canvasContainerStyle,
        figmaGap: FIGMA_GAP_REM,
        remCompensation,
        getRemCompensation,
        handleResize,
        zoomIn,
        zoomOut,
        resetZoom,
        calculateOptimalScale,
    };
}
