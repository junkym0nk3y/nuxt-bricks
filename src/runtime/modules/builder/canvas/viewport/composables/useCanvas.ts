import { ref, computed, watch } from 'vue';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';
import { convertRemToPx, convertPxToRem } from '../../../../common/utils/main';
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';
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

    /**
     * Визуальная ширина контента Figma Mode при scale = 1
     * (три viewport-а с rem-компенсацией + gap'ы).
     */
    const getFigmaContentWidth = (): number => {
        const bp = config.canvasBreakpoints;
        return (
            bp.mobile.width * getRemCompensation('mobile') +
            bp.tablet.width * getRemCompensation('tablet') +
            bp.desktop.width * getRemCompensation('desktop') +
            FIGMA_GAP_PX * 2
        );
    };

    const calculateOptimalScale = (): number => {
        if (typeof window === 'undefined') {
            return 1;
        }

        const leftWidth = sidebarStore.left.visible ? sidebarStore.left.width : 0;
        const rightWidth = sidebarStore.right.visible ? sidebarStore.right.width : 0;
        const padding = 80;
        const availableWidth =
            window.innerWidth -
            convertRemToPx(leftWidth) -
            convertRemToPx(rightWidth) -
            VERTICAL_NAV_WIDTH_PX -
            padding;

        if (canvasStore.isFigmaMode) {
            return Math.min(availableWidth / getFigmaContentWidth(), 1);
        }

        // Учитываем rem-компенсацию: канвас визуально увеличивается в remCompensation раз
        const effectiveWidth = canvasStore.width * remCompensation.value;
        const scaleX = availableWidth / effectiveWidth;
        return Math.min(scaleX, 1);
    };

    // Обновляем масштаб при переключении сайдбаров, figma mode или viewport (rem compensation).
    // Ручной зум (wheel/кнопки) не перетираем — авто-фит только при !hasManualZoom
    // (смена viewport сбрасывает флаг в store).
    watch(
        () => [
            sidebarStore.left.visible,
            sidebarStore.right.visible,
            canvasStore.isFigmaMode,
            canvasStore.viewport,
        ],
        () => {
            if (canvasStore.hasManualZoom) {
                return;
            }
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
    // т.к. у каждого viewport своя компенсация (применяется в BuilderCanvasViewport)
    const figmaBaseTransform = computed(() => {
        return `scale(${canvasStore.scale})`;
    });

    // Layout-ширина обёртки канваса следует за визуальным масштабом: transform
    // не влияет на layout, и без min-width при зуме больше fit-масштаба левый
    // край канваса выпирал бы за пределы scroll-области (недостижим скроллом)
    const canvasWrapperStyle = computed(() => {
        const totalScale = canvasStore.scale * remCompensation.value;
        return { minWidth: convertPxToRem(canvasStore.width * totalScale) };
    });

    // Аналогичный min-width для обёртки Figma Mode
    const figmaWrapperMinWidth = computed(() => {
        return convertPxToRem(getFigmaContentWidth() * canvasStore.scale);
    });

    // CSS-стили контейнера канваса относительно сайдбаров (левого и правой панели свойств)
    const canvasContainerStyle = computed(() => {
        const leftWidth = sidebarStore.left.visible ? sidebarStore.left.width : '0px';
        const rightWidth = sidebarStore.right.visible ? sidebarStore.right.width : '0px';
        const navWidth = VERTICAL_NAV_WIDTH_REM;

        return {
            marginLeft: sidebarStore.left.visible ? leftWidth : '0',
            width: `calc(100vw - ${leftWidth} - ${navWidth} - ${rightWidth})`,
            height: '100vh',
        };
    });

    /**
     * Служебный обработчик ресайза окна, пересчитывающий актуальный масштаб.
     * Ручной зум пользователя не перетирает.
     */
    const handleResize = (): void => {
        if (canvasStore.hasManualZoom) {
            return;
        }
        const scale = calculateOptimalScale();
        canvasStore.setCanvasScale(scale);
    };

    /**
     * Возвращает масштаб к автоматически подобранному значению
     * и снимает флаг ручного зума.
     */
    const resetZoom = (): void => {
        canvasStore.hasManualZoom = false;
        const scale = calculateOptimalScale();
        canvasStore.setCanvasScale(scale);
    };

    return {
        canvasContainer,
        canvasTransform,
        figmaBaseTransform,
        canvasContainerStyle,
        canvasWrapperStyle,
        figmaWrapperMinWidth,
        figmaGap: FIGMA_GAP_REM,
        remCompensation,
        getRemCompensation,
        handleResize,
        resetZoom,
        calculateOptimalScale,
    };
}
