/**
 * Превью карточки компонента библиотеки: lazy-загрузка brick-компонента
 * и contain-масштабирование под фиксированную область превью
 * (ResizeObserver + watchers на смену компонента/пропсов/режима).
 */

// Types
import type { IComponentCardPreview, ISidebarComponentCardProps } from '../components/types';
import type { IBrickExportModule } from '../../../../common/types/index';
import type { IDragVisualSize, IBricksComponent } from '../../../../common/types/brick';
import type { IBlockCanvasContext } from '../../../../layouts-blocks/types/registry';

// Vue
import {
    computed,
    defineAsyncComponent,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
    type Component,
} from 'vue';

// Composables
import { useBrickImports } from '../../../../common/composables/useBrickImports';

// Utils
import { convertRemToPx } from '../../../../common/utils/main';
import { measureDragSize } from '../../../../common/utils/dragAndDrop';
import {
    getBlockDefinition,
    resolveBlockProps,
    resolveCanvasBind,
} from '../../../../layouts-blocks/registry';
import { CANVAS_BLOCK_COMPONENTS } from '../../../../layouts-blocks/canvasBlockComponents';

/**
 * Максимальное увеличение для маленьких компонентов
 */
const MAX_SCALE_UP = 3;

/**
 * Фиксированная высота превью (из CSS)
 */
const PREVIEW_HEIGHT_REM = 18;
const LAYOUT_PREVIEW_HEIGHT_REM = 12;

/** id скрытого measure-инстанса: в схему не попадает, нужен только контексту рендера. */
const MEASURE_PROBE_ID = 'measure-probe';

/**
 * Логика превью карточки: async-компонент, refs областей и масштаб.
 */
export function useComponentCardPreview(props: ISidebarComponentCardProps): IComponentCardPreview {
    const { findImportModule } = useBrickImports();
    const ComponentPreview = shallowRef<Component | null>(null);
    const previewWrapperRef = ref<HTMLElement | null>(null);
    const componentWrapperRef = ref<HTMLElement | null>(null);
    /** Скрытый инстанс layout-блока для точного замера его реального размера. */
    const measureWrapperRef = ref<HTMLElement | null>(null);
    const previewScale = ref(1);
    let resizeObserver: ResizeObserver | null = null;
    let previewUpdateTimer: ReturnType<typeof setTimeout> | null = null;

    const importModule = findImportModule(props.component.brickPath);
    if (importModule) {
        ComponentPreview.value = defineAsyncComponent<Component>({
            loader: async () => {
                const mod = await importModule();
                const exported = (mod as IBrickExportModule).default;
                if (!exported) {
                    throw new Error(
                        `Missing default export for component: ${props.component.name}`
                    );
                }
                return exported as Component;
            },
            onError: (error) => {
                console.error(`Error loading component preview: ${props.component.name}`, error);
            },
        });
    }

    /**
     * Фильтрует slot-пропсы из defaultProps чтобы не передавать их как обычные пропсы
     * @returns Объект пропсов без slot-пропсов
     */
    const componentProps = computed<Record<string, unknown>>(() => {
        const propsObj = { ...(props.component.defaultProps || {}) };
        // Удаляем slot prop если он есть (он должен передаваться как slot, а не prop)
        delete propsObj.slot;
        return propsObj;
    });

    /** Definition встроенного layout-блока (для user-bricks — null). */
    const blockDefinition = computed(() => getBlockDefinition(props.component.name) ?? null);

    /**
     * Реальный canvas-компонент встроенного блока для скрытого замера (Grid/Flex/
     * Media/…): у layout-карточки живого превью нет, только иконка. Берётся из
     * canvas-реестра — sidebar builder-only, published-бандла не касается.
     * User-bricks меряются по своему превью, скрытый инстанс им не нужен.
     */
    const measureComponent = computed<Component | null>(() => {
        if (!blockDefinition.value) {
            return null;
        }

        return CANVAS_BLOCK_COMPONENTS[blockDefinition.value.name] ?? null;
    });

    /**
     * Биндинги measure-инстанса — точно как на канвасе (resolveCanvasBind),
     * чтобы замеренный размер совпал с реальным блоком после вставки.
     */
    const measureBindProps = computed<Record<string, unknown>>(() => {
        const definition = blockDefinition.value;
        if (!definition) {
            return componentProps.value;
        }

        const probeComponent: IBricksComponent = {
            id: MEASURE_PROBE_ID,
            type: 'layout',
            componentName: props.component.name,
            brickPath: props.component.brickPath,
            zIndex: 0,
            props: componentProps.value,
        };
        const context: IBlockCanvasContext = {
            component: probeComponent,
            layoutProps: resolveBlockProps(props.component.name, componentProps.value, 'desktop'),
            boundProps: componentProps.value,
            childComponents: [],
            renderChild: () => null,
        };

        return resolveCanvasBind(definition, context);
    });

    /**
     * Обновляет масштаб предпросмотра компонента
     *
     * Измеряет РЕАЛЬНЫЙ размер компонента (не wrapper с фиксированной шириной).
     * Стратегия: contain - компонент полностью влезает в превью.
     * Маленькие компоненты увеличиваются (до MAX_SCALE_UP), большие уменьшаются.
     */
    async function updatePreviewScale(): Promise<void> {
        await nextTick();

        // Даем время компоненту отрендериться
        if (previewUpdateTimer) {
            clearTimeout(previewUpdateTimer);
        }

        previewUpdateTimer = setTimeout(() => {
            previewUpdateTimer = null;
            const wrapper = previewWrapperRef.value;
            const componentWrapper = componentWrapperRef.value;

            if (!wrapper || !componentWrapper) {
                previewScale.value = 1;
                return;
            }

            // Получаем реальный компонент (первый child внутри componentWrapper)
            const actualComponent = componentWrapper.firstElementChild as HTMLElement;
            if (!actualComponent) {
                previewScale.value = 1;
                return;
            }

            // Размеры области превью
            const previewWidth = wrapper.clientWidth || 200;
            const previewHeightRem = props.isLayout
                ? LAYOUT_PREVIEW_HEIGHT_REM
                : PREVIEW_HEIGHT_REM;
            const previewHeight = convertRemToPx(`${previewHeightRem}rem`);

            // Измеряем РЕАЛЬНЫЙ размер компонента
            // offsetWidth/offsetHeight дают размер без учёта transform родителя
            let contentWidth = actualComponent.offsetWidth;
            let contentHeight = actualComponent.offsetHeight;

            // Фолбек на scrollWidth/scrollHeight если offset вернул 0
            if (!contentWidth) {
                contentWidth = actualComponent.scrollWidth || 100;
            }
            if (!contentHeight) {
                contentHeight = actualComponent.scrollHeight || 100;
            }

            // Для полноширинных компонентов (занимают 100% wrapper) используем wrapper
            // Это компоненты типа секций которые растягиваются на всю ширину
            if (contentWidth >= componentWrapper.offsetWidth * 0.95) {
                contentWidth = componentWrapper.scrollWidth;
                contentHeight = componentWrapper.scrollHeight;
            }

            if (!contentWidth || !contentHeight) {
                previewScale.value = 1;
                return;
            }

            // Вычисляем масштаб для contain (весь компонент влезает)
            const widthScale = previewWidth / contentWidth;
            const heightScale = previewHeight / contentHeight;

            // Contain: берём меньший масштаб чтобы влезло по обоим осям
            // Но разрешаем увеличение для маленьких компонентов (до MAX_SCALE_UP)
            const containScale = Math.min(widthScale, heightScale);
            const scale = Math.min(containScale, MAX_SCALE_UP);

            previewScale.value = Math.max(scale, 0.1);
        }, 100);
    }

    /**
     * Настраивает ResizeObserver для отслеживания изменений размера wrapper
     * При изменении размера автоматически пересчитывает масштаб превью
     */
    function setupResizeObserver(): void {
        if (resizeObserver || typeof ResizeObserver === 'undefined') {
            return;
        }
        resizeObserver = new ResizeObserver(() => updatePreviewScale());
        if (previewWrapperRef.value) {
            resizeObserver.observe(previewWrapperRef.value);
        }
    }

    /**
     * Отдаёт фактический размер блока для canvas-плейсхолдера.
     *
     * Источник истины — отрендеренный компонент на desktop-ширине (144rem):
     * user-bricks и leaf-блоки берутся из живого превью, layout — из скрытого
     * measure-инстанса. Хардкод-оценок по типу блока нет.
     *
     * Если превью ещё не отрендерилось (async-brick в загрузке, компонент без
     * DOM-корня), меряется сам host — плейсхолдер остаётся видимым.
     *
     * @returns Размер будущего canvas-плейсхолдера.
     */
    function getDragPreviewSize(): IDragVisualSize {
        const host = props.isLayout ? measureWrapperRef.value : componentWrapperRef.value;
        const measured = measureDragSize(host?.firstElementChild as HTMLElement | null);

        if (measured.width > 0 && measured.height > 0) {
            return measured;
        }

        return measureDragSize(host);
    }

    onMounted(() => {
        setupResizeObserver();
        nextTick(() => updatePreviewScale());
    });

    onBeforeUnmount(() => {
        if (previewUpdateTimer) {
            clearTimeout(previewUpdateTimer);
            previewUpdateTimer = null;
        }
        resizeObserver?.disconnect();
        resizeObserver = null;
    });

    // Watchers для автоматического пересчета масштаба при изменениях

    // При изменении ref wrapper - переподписываем ResizeObserver
    watch(
        previewWrapperRef,
        (el, prev) => {
            if (prev && resizeObserver) {
                resizeObserver.unobserve(prev);
            }
            if (el && resizeObserver) {
                resizeObserver.observe(el);
            }
        },
        { flush: 'post' }
    );

    // При загрузке асинхронного компонента - пересчитываем масштаб
    watch(ComponentPreview, async () => {
        await nextTick();
        updatePreviewScale();
    });

    // При изменении пропсов компонента - пересчитываем масштаб
    watch(
        () => props.component.defaultProps,
        async () => {
            await nextTick();
            updatePreviewScale();
        }
    );

    // При изменении isLayout - пересчитываем масштаб
    watch(
        () => props.isLayout,
        async () => {
            await nextTick();
            updatePreviewScale();
        }
    );

    return {
        ComponentPreview,
        previewWrapperRef,
        componentWrapperRef,
        measureWrapperRef,
        previewScale,
        componentProps,
        measureComponent,
        measureBindProps,
        getDragPreviewSize,
    };
}
