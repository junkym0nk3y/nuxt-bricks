/**
 * Preview of a library component card: the brick component is loaded lazily and
 * scaled to contain inside the fixed preview area (a ResizeObserver plus watchers on
 * a change of the component, its props or the card mode).
 */

// Types
import { BASE_DEVICE_KEY } from '../../../../common/constants/devices';
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
 * Ceiling of the scale-up applied to small components
 */
const MAX_SCALE_UP = 3;

/**
 * Fixed height of the preview, repeated from the CSS
 */
const PREVIEW_HEIGHT_REM = 18;
const LAYOUT_PREVIEW_HEIGHT_REM = 12;

/**
 * Id of the hidden measure instance: it never reaches the schema and only serves the
 * render context
 */
const MEASURE_PROBE_ID = 'measure-probe';

/**
 * Logic of the card preview: the async component, the refs of its areas and the scale.
 */
export function useComponentCardPreview(props: ISidebarComponentCardProps): IComponentCardPreview {
    const { findImportModule } = useBrickImports();
    const ComponentPreview = shallowRef<Component | null>(null);
    const previewWrapperRef = ref<HTMLElement | null>(null);
    const componentWrapperRef = ref<HTMLElement | null>(null);
    /** Hidden instance of the layout block, there to measure its real size exactly */
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
     * Filters the slot props out of `defaultProps` so they are not passed as ordinary
     * props.
     *
     * @returns Props object with no slot props in it.
     */
    const componentProps = computed<Record<string, unknown>>(() => {
        const propsObj = { ...(props.component.defaultProps || {}) };
        // Drop the slot prop if there is one: it has to travel as a slot, not as a prop
        delete propsObj.slot;
        return propsObj;
    });

    /** Definition of a built-in layout block (null for a user brick) */
    const blockDefinition = computed(() => getBlockDefinition(props.component.name) ?? null);

    /**
     * The real canvas component of a built-in block for the hidden measurement
     * (Grid/Flex/Media/…): a layout card has no live preview, only an icon. Taken
     * from the canvas registry — the sidebar is builder-only and never touches the
     * published bundle. A user brick is measured by its own preview and needs no
     * hidden instance.
     */
    const measureComponent = computed<Component | null>(() => {
        if (!blockDefinition.value) {
            return null;
        }

        return CANVAS_BLOCK_COMPONENTS[blockDefinition.value.name] ?? null;
    });

    /**
     * Bindings of the measure instance — exactly the ones of the canvas
     * (`resolveCanvasBind`), so that the measured size matches the real block once it
     * is inserted.
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
            // The library card preview is measured on the base device: there is one
            // card for every page, and the set of a particular page has nothing to do
            // with it
            layoutProps: resolveBlockProps(
                props.component.name,
                componentProps.value,
                BASE_DEVICE_KEY
            ),
            boundProps: componentProps.value,
            childComponents: [],
            renderChild: () => null,
        };

        return resolveCanvasBind(definition, context);
    });

    /**
     * Recomputes the scale of the component preview.
     *
     * What is measured is the real size of the component, not the wrapper with its
     * fixed width. The strategy is contain: the component fits into the preview
     * whole, small ones scaled up (no further than MAX_SCALE_UP), large ones down.
     */
    async function updatePreviewScale(): Promise<void> {
        await nextTick();

        // Give the component time to render
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

            // The real component is the first child inside componentWrapper
            const actualComponent = componentWrapper.firstElementChild as HTMLElement;
            if (!actualComponent) {
                previewScale.value = 1;
                return;
            }

            // Size of the preview area
            const previewWidth = wrapper.clientWidth || 200;
            const previewHeightRem = props.isLayout
                ? LAYOUT_PREVIEW_HEIGHT_REM
                : PREVIEW_HEIGHT_REM;
            const previewHeight = convertRemToPx(`${previewHeightRem}rem`);

            // Measure the real size of the component: offsetWidth/offsetHeight give
            // it without the transform of the parent
            let contentWidth = actualComponent.offsetWidth;
            let contentHeight = actualComponent.offsetHeight;

            // Fall back to scrollWidth/scrollHeight when offset came back as 0
            if (!contentWidth) {
                contentWidth = actualComponent.scrollWidth || 100;
            }
            if (!contentHeight) {
                contentHeight = actualComponent.scrollHeight || 100;
            }

            // A full-width component — a section and its kind, stretched across the
            // whole width — takes 100% of the wrapper, so the wrapper is measured
            // instead
            if (contentWidth >= componentWrapper.offsetWidth * 0.95) {
                contentWidth = componentWrapper.scrollWidth;
                contentHeight = componentWrapper.scrollHeight;
            }

            if (!contentWidth || !contentHeight) {
                previewScale.value = 1;
                return;
            }

            // Scale that makes the whole component fit
            const widthScale = previewWidth / contentWidth;
            const heightScale = previewHeight / contentHeight;

            // Contain: take the smaller of the two so it fits along both axes, while
            // still allowing a small component to grow up to MAX_SCALE_UP
            const containScale = Math.min(widthScale, heightScale);
            const scale = Math.min(containScale, MAX_SCALE_UP);

            previewScale.value = Math.max(scale, 0.1);
        }, 100);
    }

    /**
     * Sets up the ResizeObserver that watches the size of the wrapper and recomputes
     * the preview scale whenever it changes.
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
     * The actual size of the block, for the canvas placeholder.
     *
     * The source of truth is the rendered component inside its host of a fixed 144rem
     * width: a user brick and a leaf block are taken from the live preview, a layout
     * block from the hidden measure instance. There are no hardcoded guesses per
     * block type.
     *
     * When the preview has not rendered yet (an async brick still loading, a
     * component with no DOM root), the host itself is measured — the placeholder
     * stays visible.
     *
     * @returns Size of the canvas placeholder to come.
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

    // Watchers that recompute the scale on their own

    // A changed wrapper ref: resubscribe the ResizeObserver
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

    // The async component has loaded: recompute the scale
    watch(ComponentPreview, async () => {
        await nextTick();
        updatePreviewScale();
    });

    // The props of the component have changed: recompute the scale
    watch(
        () => props.component.defaultProps,
        async () => {
            await nextTick();
            updatePreviewScale();
        }
    );

    // `isLayout` has changed: recompute the scale
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
