// Types
import type { IMediaItem } from '../../../../common/types/media';
import type { IGalleryItem } from '../../../../common/types/content';
import type { IPropertyDefinition } from '../../../../common/types/brick';
import type {
    TInlineGalleryPayload,
    TMediaContext,
    IUseSidebarMediaSelectionOptions,
} from '../types/sidebarProperties';

// Vue
import { ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Utils
import { readOwnKey } from '../../../../common/utils/safeRecord';

/**
 * Picking media from the gallery for the properties panel: the context of the request
 * (an ordinary property or an image gallery) and the application of the picked item to
 * the property it belongs to.
 */
export function useSidebarMediaSelection(options: IUseSidebarMediaSelectionOptions) {
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
            ];

            for (const [propertyName, value] of companions) {
                if (propertyName) {
                    patch[propertyName] = value;
                }
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
        // The name of the prop is declared by a brick file, the props come from the schema
        const currentValue = readOwnKey(selected.component.props, property.name);
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

        store.updateComponentProp(selected.id, property.name, items);
        currentMediaContext.value = null;
    }

    return { currentMediaContext, handleOpenMediaGallery, handleMediaSelect };
}
