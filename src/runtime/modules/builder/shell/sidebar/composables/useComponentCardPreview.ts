/**
 * Превью карточки компонента библиотеки: lazy-загрузка brick-компонента
 * и contain-масштабирование под фиксированную область превью
 * (ResizeObserver + watchers на смену компонента/пропсов/режима).
 */

// Types
import type { ISidebarComponentCardProps } from '../components/types';
import type { IBrickExportModule } from '../../../../common/types/index';

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
    type ComputedRef,
    type Ref,
    type ShallowRef,
} from 'vue';

// Composables
import { useBrickImports } from '../../../../common/composables/useBrickImports';

// Utils
import { convertRemToPx } from '../../../../common/utils/main';

interface IComponentCardPreview {
    ComponentPreview: ShallowRef<Component | null>;
    previewWrapperRef: Ref<HTMLElement | null>;
    previewContentRef: Ref<HTMLElement | null>;
    componentWrapperRef: Ref<HTMLElement | null>;
    previewScale: Ref<number>;
    componentProps: ComputedRef<Record<string, unknown>>;
}

/**
 * Максимальное увеличение для маленьких компонентов
 */
const MAX_SCALE_UP = 3;

/**
 * Фиксированная высота превью (из CSS)
 */
const PREVIEW_HEIGHT_REM = 18;
const LAYOUT_PREVIEW_HEIGHT_REM = 12;

/**
 * Логика превью карточки: async-компонент, refs областей и масштаб.
 */
export function useComponentCardPreview(props: ISidebarComponentCardProps): IComponentCardPreview {
    const { findImportModule } = useBrickImports();
    const ComponentPreview = shallowRef<Component | null>(null);
    const previewWrapperRef = ref<HTMLElement | null>(null);
    const previewContentRef = ref<HTMLElement | null>(null);
    const componentWrapperRef = ref<HTMLElement | null>(null);
    const previewScale = ref(1);
    let resizeObserver: ResizeObserver | null = null;

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
        setTimeout(() => {
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

    onMounted(() => {
        setupResizeObserver();
        nextTick(() => updatePreviewScale());
    });

    onBeforeUnmount(() => {
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
        previewContentRef,
        componentWrapperRef,
        previewScale,
        componentProps,
    };
}
