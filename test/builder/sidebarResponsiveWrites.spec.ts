/**
 * What the properties panel is allowed to write while a device tab is open.
 *
 * The panel used to scope a write to the device for ANY property of a block declaring
 * `responsiveMode: 'all'`, while a render adapts only the properties it built a
 * mechanic for. The two disagreed silently and in two different ways: the canvas showed
 * an override the page ignored, or the value moved in the panel and changed nothing
 * anywhere. The rule now has one owner — the `responsive` flag of the property — and
 * these cases hold every surface to it.
 */

// #region Imports
// Types
import type { IPropertyDefinition } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { storeMock, canvasStoreMock, scopeState } = vi.hoisted(() => ({
    storeMock: {
        selectedComponentData: null as unknown,
        updateComponentProp: vi.fn(),
        updateComponentResponsiveProp: vi.fn(),
        updateComponentIdentityProps: vi.fn(),
        setComponentFullWidth: vi.fn(),
        setComponentHidden: vi.fn(),
    },
    canvasStoreMock: {
        devices: [
            { key: 'mobile', label: 'Mobile', width: 375 },
            { key: 'desktop', label: 'Desktop', width: 1600 },
        ],
        viewport: 'desktop',
        isFigmaMode: false,
    },
    // The ref itself is created inside the factory of the mock: a `ref()` called in the
    // hoisted block would reach for an import that has not been initialized yet
    scopeState: {} as { scope: { value: string } },
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => storeMock,
}));

vi.mock('../../src/runtime/modules/builder/core/stores/canvas', () => ({
    useCanvasStore: () => canvasStoreMock,
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));

// The scope is owned by a composable of its own; the cases here drive it directly
vi.mock(
    '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarResponsiveScope',
    async () => {
        const { computed, ref } = await import('vue');
        const scope = ref('desktop');
        scopeState.scope = scope;

        return {
            useSidebarResponsiveScope: () => ({
                isResponsiveLayout: computed(() => true),
                isResponsiveComponent: computed(() => true),
                layoutDeviceScope: scope,
                hasResponsiveOverridesForScope: computed(() => false),
                hasLockedPropertiesForScope: computed(() => scope.value !== 'desktop'),
                // The real composable merges the overrides of the active device into the
                // props it hands to the editors, and the gallery cases below depend on
                // exactly that: the array shown is the array rewritten
                selectedComponentDataForVariants: computed(() => {
                    const selected = storeMock.selectedComponentData as {
                        component?: { props?: Record<string, unknown> };
                    } | null;

                    if (!selected?.component || scope.value === 'desktop') {
                        return selected;
                    }

                    const componentProps = selected.component.props ?? {};
                    const responsive = (componentProps.responsive ?? {}) as Record<string, unknown>;
                    const overrides = (responsive[scope.value] ?? {}) as Record<string, unknown>;

                    return {
                        ...selected,
                        component: {
                            ...selected.component,
                            props: { ...componentProps, ...overrides },
                        },
                    };
                }),
                handleSetLayoutDeviceScope: vi.fn(),
                handleResetLayoutDeviceScopeOverrides: vi.fn(),
            }),
        };
    }
);
// #endregion

import { useSidebarPropertiesPanel } from '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarPropertiesPanel';

// #region Data
const openGalleryMock = vi.fn();

const ADAPTIVE_PROPERTY: IPropertyDefinition = {
    name: 'paddingX',
    type: 'number',
    label: 'paddingX',
    default: 0,
    responsive: true,
};

const FIXED_PROPERTY: IPropertyDefinition = {
    name: 'content',
    type: 'textarea',
    label: 'content',
    default: '',
};

const MEDIA_PROPERTY: IPropertyDefinition = {
    name: 'src',
    type: 'image',
    label: 'src',
    default: '',
    previewUrlProperty: 'previewSrc',
    mediaTypeProperty: 'type',
};

const ADAPTIVE_MEDIA_PROPERTY: IPropertyDefinition = {
    name: 'backgroundImage',
    type: 'image',
    label: 'backgroundImage',
    default: '',
    responsive: true,
};

const ADAPTIVE_MEDIA_WITH_COMPANIONS: IPropertyDefinition = {
    name: 'illustration',
    type: 'image',
    label: 'illustration',
    default: '',
    responsive: true,
    previewUrlProperty: 'illustrationPreview',
};

const ADAPTIVE_GALLERY_PROPERTY: IPropertyDefinition = {
    name: 'slides',
    type: 'image-gallery',
    label: 'slides',
    default: [],
    responsive: true,
};
// #endregion

// #region Methods
/**
 * Builds the panel over a selected component with the given properties.
 *
 * @param properties - Property definitions of the component.
 * @param props - Props of the schema component.
 * @returns The panel composable.
 */
function mountPanel(
    properties: IPropertyDefinition[],
    props: Record<string, unknown> = {}
): ReturnType<typeof useSidebarPropertiesPanel> {
    storeMock.selectedComponentData = {
        id: 'block-1',
        component: { id: 'block-1', componentName: 'Section', props },
        properties,
    };

    return useSidebarPropertiesPanel({ onOpenMediaGallery: openGalleryMock });
}
// #endregion

describe('the properties panel on a device tab', () => {
    beforeEach(() => {
        scopeState.scope.value = 'desktop';
        storeMock.updateComponentProp.mockClear();
        storeMock.updateComponentResponsiveProp.mockClear();
        storeMock.updateComponentIdentityProps.mockClear();
    });

    it('an adaptive property is written into the overrides of the device', () => {
        const panel = mountPanel([ADAPTIVE_PROPERTY]);
        scopeState.scope.value = 'mobile';

        panel.handleChangeValues(ADAPTIVE_PROPERTY, 2);

        expect(storeMock.updateComponentResponsiveProp).toHaveBeenCalledWith(
            'block-1',
            'mobile',
            'paddingX',
            2
        );
    });

    it('a property nobody adapts is not written at all', () => {
        // Neither into the overrides — the page would ignore it — nor quietly into the
        // base: that would change every sheet at once while the person looks at one
        const panel = mountPanel([FIXED_PROPERTY]);
        scopeState.scope.value = 'mobile';

        panel.handleChangeValues(FIXED_PROPERTY, '<p>mobile text</p>');

        expect(storeMock.updateComponentResponsiveProp).not.toHaveBeenCalled();
        expect(storeMock.updateComponentProp).not.toHaveBeenCalled();
    });

    it('the same property is written normally on the base device', () => {
        const panel = mountPanel([FIXED_PROPERTY]);

        panel.handleChangeValues(FIXED_PROPERTY, '<p>text</p>');

        expect(storeMock.updateComponentProp).toHaveBeenCalledWith(
            'block-1',
            'content',
            '<p>text</p>'
        );
    });

    it('the editor of a property nobody adapts is disabled on a device tab', () => {
        // The guard above refuses the write; a disabled field is how the panel says so
        // before the person tries to move a control that will not move
        const panel = mountPanel([ADAPTIVE_PROPERTY, FIXED_PROPERTY]);
        scopeState.scope.value = 'mobile';

        const numberVariant = panel.componentVariants.value.input.find(
            (variant) => variant.property.name === 'paddingX'
        );
        const textVariant = panel.componentVariants.value.textarea.find(
            (variant) => variant.property.name === 'content'
        );

        expect(numberVariant?.disabled).toBe(false);
        expect(textVariant?.disabled).toBe(true);
    });
});

describe('picking a file from the gallery', () => {
    beforeEach(() => {
        scopeState.scope.value = 'desktop';
        storeMock.updateComponentProp.mockClear();
        storeMock.updateComponentResponsiveProp.mockClear();
        storeMock.updateComponentIdentityProps.mockClear();
    });

    it('the kind of the file comes from its MIME type, not from the person', () => {
        // A video picked while the block still said `image` reached the page inside an
        // `<img>` with the address of a video — an empty frame, and silently
        const panel = mountPanel([MEDIA_PROPERTY]);

        panel.handleOpenMediaGallery(MEDIA_PROPERTY);
        panel.handleMediaSelect({
            id: 1,
            url: '/media/clip.mp4',
            filename: 'clip.mp4',
            alt: '',
            size: 10,
            uploadedAt: '',
            mimeType: 'video/mp4',
            category: null,
            svgContent: null,
            width: null,
            height: null,
            previewUrl: null,
            mockUrl: null,
        });

        expect(storeMock.updateComponentIdentityProps).toHaveBeenCalledWith(
            'block-1',
            expect.objectContaining({ src: '/media/clip.mp4', type: 'video' })
        );
    });

    it('an adaptive media property lands in the scope the panel is showing', () => {
        // The background of a Section differs per device; an identity write would put
        // it into the base props and wipe the overrides of the other devices
        const panel = mountPanel([ADAPTIVE_MEDIA_PROPERTY]);
        scopeState.scope.value = 'mobile';

        panel.handleOpenMediaGallery(ADAPTIVE_MEDIA_PROPERTY);
        panel.handleMediaSelect({
            id: 2,
            url: '/media/bg.webp',
            filename: 'bg.webp',
            alt: '',
            size: 10,
            uploadedAt: '',
            mimeType: 'image/webp',
            category: null,
            svgContent: null,
            width: 100,
            height: 100,
            previewUrl: null,
            mockUrl: null,
        });

        expect(storeMock.updateComponentResponsiveProp).toHaveBeenCalledWith(
            'block-1',
            'mobile',
            'backgroundImage',
            '/media/bg.webp'
        );
        expect(storeMock.updateComponentIdentityProps).not.toHaveBeenCalled();
    });
});

describe('the edges of a media pick', () => {
    beforeEach(() => {
        scopeState.scope.value = 'desktop';
        storeMock.updateComponentProp.mockClear();
        storeMock.updateComponentResponsiveProp.mockClear();
        storeMock.updateComponentIdentityProps.mockClear();
        openGalleryMock.mockClear();
    });

    it('an adaptive property that also carries companions is written as one base fact', () => {
        // The address of a file, its scaled variants and its size are one fact and the
        // store writes them together. Split per device, the mobile picture would keep
        // the preview and the ratio of the desktop one — so the indivisible write wins,
        // and a definition declaring both is a contradiction of its own making
        const panel = mountPanel([ADAPTIVE_MEDIA_WITH_COMPANIONS]);
        scopeState.scope.value = 'mobile';

        panel.handleOpenMediaGallery(ADAPTIVE_MEDIA_WITH_COMPANIONS);
        panel.handleMediaSelect({
            id: 3,
            url: '/media/pic.webp',
            filename: 'pic.webp',
            alt: '',
            size: 10,
            uploadedAt: '',
            mimeType: 'image/webp',
            category: null,
            svgContent: null,
            width: 100,
            height: 100,
            previewUrl: '/media/pic-preview.webp',
            mockUrl: null,
        });

        expect(storeMock.updateComponentIdentityProps).toHaveBeenCalledWith(
            'block-1',
            expect.objectContaining({ illustration: '/media/pic.webp' })
        );
        expect(storeMock.updateComponentResponsiveProp).not.toHaveBeenCalled();
    });

    it('a gallery of an adaptive property lands in the scope as well', () => {
        const panel = mountPanel([ADAPTIVE_GALLERY_PROPERTY]);
        scopeState.scope.value = 'mobile';

        panel.handleOpenMediaGallery(ADAPTIVE_GALLERY_PROPERTY, { action: 'append' });
        panel.handleMediaSelect({
            id: 4,
            url: '/media/slide.webp',
            filename: 'slide.webp',
            alt: '',
            size: 10,
            uploadedAt: '',
            mimeType: 'image/webp',
            category: null,
            svgContent: null,
            width: 100,
            height: 100,
            previewUrl: null,
            mockUrl: null,
        });

        expect(storeMock.updateComponentResponsiveProp).toHaveBeenCalledWith(
            'block-1',
            'mobile',
            'slides',
            expect.arrayContaining([expect.objectContaining({ url: '/media/slide.webp' })])
        );
        expect(storeMock.updateComponentProp).not.toHaveBeenCalled();
    });

    it('the gallery does not even open for a property locked at this scope', () => {
        // The pick of a gallery item writes the props directly, so a gallery opened for
        // a locked property would end in a change nothing turns away
        const panel = mountPanel([
            { name: 'photos', type: 'image-gallery', label: 'photos', default: [] },
        ]);
        scopeState.scope.value = 'mobile';

        panel.handleOpenMediaGallery(
            { name: 'photos', type: 'image-gallery', label: 'photos', default: [] },
            { action: 'append' }
        );

        expect(openGalleryMock).not.toHaveBeenCalled();
    });
});

describe('a gallery of an adaptive property keeps the items of its device', () => {
    beforeEach(() => {
        scopeState.scope.value = 'desktop';
        storeMock.updateComponentProp.mockClear();
        storeMock.updateComponentResponsiveProp.mockClear();
        openGalleryMock.mockClear();
    });

    it('an added image joins the items of the device, not those of the base', () => {
        // The editor shows the array of the device and the write rewrites the whole
        // array: assembled out of the base one it would hand the device somebody
        // else's pictures and drop its own
        const panel = mountPanel([ADAPTIVE_GALLERY_PROPERTY], {
            slides: [{ id: 'base', url: '/base.webp' }],
            responsive: { mobile: { slides: [{ id: 'mobile', url: '/mobile.webp' }] } },
        });
        scopeState.scope.value = 'mobile';

        panel.handleOpenMediaGallery(ADAPTIVE_GALLERY_PROPERTY, { action: 'append' });
        panel.handleMediaSelect({
            id: 5,
            url: '/media/added.webp',
            filename: 'added.webp',
            alt: '',
            size: 10,
            uploadedAt: '',
            mimeType: 'image/webp',
            category: null,
            svgContent: null,
            width: 100,
            height: 100,
            previewUrl: null,
            mockUrl: null,
        });

        const written = storeMock.updateComponentResponsiveProp.mock.calls[0][3] as Array<{
            url: string;
        }>;

        expect(written.map((item) => item.url)).toEqual(['/mobile.webp', '/media/added.webp']);
    });
});
