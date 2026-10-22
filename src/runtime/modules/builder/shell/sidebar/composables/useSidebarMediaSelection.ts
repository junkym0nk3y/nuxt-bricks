// Types
import type { IMediaItem } from '../../../../common/types/media';
import type { IGalleryItem } from '../../../../common/types/content';
import type { IPropertyDefinition } from '../../../../common/types/brick';
import type { TInlineGalleryPayload, TMediaContext } from '../types/sidebarProperties';
import type {
    IUseSidebarMediaSelectionOptions,
    IUseSidebarMediaSelectionReturn,
} from '../types/composables';

// Vue
import { ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

/** MIME prefix of a video file: the gallery tells the kinds apart by it as well */
const VIDEO_MIME_PREFIX = 'video/';

/**
 * The kind of a media file, as the blocks name it.
 *
 * @param item - The picked media item.
 * @returns `video` for a video file, `image` for everything else.
 */
function resolveMediaKind(item: IMediaItem): string {
    return item.mimeType.startsWith(VIDEO_MIME_PREFIX) ? 'video' : 'image';
}

/**
 * Picking media from the gallery for the properties panel: the context of the request
 * (an ordinary property or an image gallery) and the application of the picked item to
 * the property it belongs to.
 */
export function useSidebarMediaSelection(
    options: IUseSidebarMediaSelectionOptions
): IUseSidebarMediaSelectionReturn {
    const store = useComponentsStore();
    const currentMediaContext = ref<TMediaContext | null>(null);

    /**
     * Opens the media gallery for a property: either an ordinary one, or an image
     * gallery, where the pick also carries the place it lands in.
     *
     * @param property - Property whose media is being edited.
     * @param inlinePayload - Where the picked item goes inside an image gallery.
     */
    function handleOpenMediaGallery(
        property: IPropertyDefinition,
        inlinePayload?: TInlineGalleryPayload
    ): void {
        // A property that cannot be written at the current scope does not open the
        // gallery at all: the editors of such a property are disabled, and an opened
        // gallery would end in a pick that goes nowhere
        if (!options.isPropertyWritable(property)) {
            return;
        }

        if (property.type === 'image-gallery' && inlinePayload) {
            currentMediaContext.value = {
                kind: 'image-gallery',
                property,
                ...inlinePayload,
            };
        } else {
            currentMediaContext.value = {
                kind: 'property',
                property,
            };
        }

        options.onOpenMediaGallery();
    }

    /**
     * Handles the pick of a media file and updates the property it belongs to.
     *
     * @param item - Picked media object.
     */
    function handleMediaSelect(item: IMediaItem): void {
        const context = currentMediaContext.value;
        const selected = store.selectedComponentData;

        if (!context || !selected) {
            return;
        }

        // Asked again on the way back: the scope of the panel can change while the
        // gallery is open, and the write of a gallery item goes straight into the base
        // props — past the guard that turns an ordinary change away
        if (!options.isPropertyWritable(context.property)) {
            currentMediaContext.value = null;
            return;
        }

        if (context.kind === 'property') {
            // The address of the file and its companions go as ONE change, past the
            // per-device scope of the panel: why an identity write is indivisible is
            // spelled out at `updateComponentIdentityProps`. Empty values are part of
            // the patch too — for a file with no variants or no dimensions (an SVG, a
            // video, an upload before they appear) the previous ones would otherwise
            // stay behind from the previous picture.
            const patch: Record<string, string | number> = {
                [context.property.name]: item.url,
            };
            const companions: Array<[string | undefined, string | number]> = [
                [context.property.svgContentProperty, item.svgContent || ''],
                [context.property.previewUrlProperty, item.previewUrl || ''],
                [context.property.mockUrlProperty, item.mockUrl || ''],
                [context.property.naturalWidthProperty, item.width ?? 0],
                [context.property.naturalHeightProperty, item.height ?? 0],
                // The kind of the file is read off its MIME type instead of being asked
                // of the person: the gallery already knows whether this is a video, and
                // a picture picked while the block still said `video` reaches the page
                // inside a `<video>` — that is, as an empty frame, silently
                [context.property.mediaTypeProperty, resolveMediaKind(item)],
            ];

            for (const [propertyName, value] of companions) {
                if (propertyName) {
                    patch[propertyName] = value;
                }
            }

            // A property the blocks adapt takes the ordinary route, into the scope the
            // panel is showing: the background of a Section differs per device, and an
            // identity write would put it into the base props and wipe the overrides of
            // the others.
            //
            // Companions rule that out, and deliberately: the address of a file, its
            // scaled variants and its pixel size are one fact, and the store writes
            // them as one change — split per device, the mobile picture would keep the
            // preview and the ratio of the desktop one. A property declaring both is a
            // contradiction in its definition, and the indivisible write is the safer
            // half of it
            const hasCompanions = companions.some(([propertyName]) => Boolean(propertyName));

            if (context.property.responsive === true && !hasCompanions) {
                options.onWriteScopedValue(context.property, item.url);
                currentMediaContext.value = null;
                return;
            }

            store.updateComponentIdentityProps(selected.id, patch);

            currentMediaContext.value = null;
            return;
        }

        handleImageGalleryMediaSelect(context, selected, item);
    }

    /**
     * Handles the pick of media for the image gallery editor.
     *
     * @param context - Media context, carrying the action to perform.
     * @param selected - Selected component.
     * @param item - Picked media item.
     */
    function handleImageGalleryMediaSelect(
        context: TMediaContext & { kind: 'image-gallery' },
        selected: NonNullable<typeof store.selectedComponentData>,
        item: IMediaItem
    ): void {
        const property = context.property;
        // The value as the panel shows it: for an adaptive property that is the base
        // array with the overrides of the active device merged in. Reading the base one
        // instead would rebuild the gallery of the device out of somebody else's items
        const currentValue = options.readScopedValue(property);
        const currentItems = Array.isArray(currentValue) ? (currentValue as IGalleryItem[]) : [];

        const items = currentItems.map((galleryItem) => ({ ...galleryItem }));

        const newGalleryItem: IGalleryItem = {
            id: `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            url: item.url,
            title: item.filename || '',
            alt: item.filename || '',
            svgContent: item.svgContent || undefined,
            mimeType: item.mimeType || undefined,
        };

        if (context.action === 'replace' && typeof context.itemIndex === 'number') {
            const targetIndex = context.itemIndex;
            if (items[targetIndex]) {
                items[targetIndex] = {
                    ...items[targetIndex],
                    url: item.url,
                    svgContent: item.svgContent || undefined,
                    mimeType: item.mimeType || undefined,
                };
            }
        } else {
            const insertionIndex =
                typeof context.insertIndex === 'number' ? context.insertIndex : items.length;
            items.splice(insertionIndex, 0, newGalleryItem);
        }

        // A gallery of an adaptive property belongs to the device the panel is showing,
        // the same as any other adaptive value; the base write below is for the
        // ordinary case, and for the base scope itself
        if (property.responsive === true) {
            options.onWriteScopedValue(property, items);
        } else {
            store.updateComponentProp(selected.id, property.name, items);
        }

        currentMediaContext.value = null;
    }

    return { currentMediaContext, handleOpenMediaGallery, handleMediaSelect };
}
