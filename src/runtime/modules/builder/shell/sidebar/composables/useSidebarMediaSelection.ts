// Types
import type { IMediaItem } from '../../../../common/types/media';
import type { IInlineContentSegment, IGalleryItem } from '../../../../common/types/content';
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
import {
    cloneInlineSegments,
    createInlineMediaSegmentFromItem,
} from '../../../../layouts-blocks/utils/inlineContent';

/**
 * Выбор медиа из галереи для панели свойств: контекст запроса
 * (обычное свойство / inline-content / image-gallery) и применение
 * выбранного элемента к соответствующему свойству компонента.
 */
export function useSidebarMediaSelection(options: IUseSidebarMediaSelectionOptions) {
    const store = useComponentsStore();
    const currentMediaContext = ref<TMediaContext | null>(null);

    /**
     * Открывает медиагалерею для произвольного свойства, inline-контента или image-gallery.
     *
     * @param property - Свойство, которое редактирует медиа.
     * @param inlinePayload - Дополнительные данные для inline/gallery редактора.
     */
    function handleOpenMediaGallery(
        property: IPropertyDefinition,
        inlinePayload?: TInlineGalleryPayload
    ): void {
        if (property.type === 'inline-content' && inlinePayload) {
            currentMediaContext.value = {
                kind: 'inline-content',
                property,
                ...inlinePayload,
            };
        } else if (property.type === 'image-gallery' && inlinePayload) {
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
     * Обрабатывает выбор медиафайла и обновляет соответствующее свойство компонента.
     *
     * @param item - Выбранный объект медиа.
     */
    function handleMediaSelect(item: IMediaItem): void {
        const context = currentMediaContext.value;
        const selected = store.selectedComponentData;

        if (!context || !selected) {
            return;
        }

        if (context.kind === 'property') {
            options.applyPropertyValue(context.property, item.url);

            if (context.property.svgContentProperty) {
                store.updateComponentProp(
                    selected.id,
                    context.property.svgContentProperty,
                    item.svgContent || ''
                );
            }

            currentMediaContext.value = null;
            return;
        }

        if (context.kind === 'image-gallery') {
            handleImageGalleryMediaSelect(context, selected, item);
            return;
        }

        const property = context.property;
        const currentSegments = Array.isArray(selected.component.props[property.name])
            ? (selected.component.props[property.name] as IInlineContentSegment[])
            : [];
        const segments = cloneInlineSegments(currentSegments);

        if (context.action === 'replace' && typeof context.segmentIndex === 'number') {
            const targetIndex = context.segmentIndex;
            if (!segments[targetIndex]) {
                currentMediaContext.value = null;
                return;
            }

            const mediaSegment = createInlineMediaSegmentFromItem(item);
            segments[targetIndex] = {
                ...segments[targetIndex],
                ...mediaSegment,
            };
        } else {
            const insertionIndex =
                typeof context.insertIndex === 'number' ? context.insertIndex : segments.length;
            const mediaSegment = createInlineMediaSegmentFromItem(item);
            segments.splice(insertionIndex, 0, mediaSegment);
        }

        store.updateComponentProp(selected.id, property.name, segments);
        currentMediaContext.value = null;
    }

    /**
     * Обрабатывает выбор медиа для image-gallery редактора.
     *
     * @param context - Контекст медиа с данными о действии.
     * @param selected - Выбранный компонент.
     * @param item - Выбранный медиа-элемент.
     */
    function handleImageGalleryMediaSelect(
        context: TMediaContext & { kind: 'image-gallery' },
        selected: NonNullable<typeof store.selectedComponentData>,
        item: IMediaItem
    ): void {
        const property = context.property;
        const currentItems = Array.isArray(selected.component.props[property.name])
            ? (selected.component.props[property.name] as IGalleryItem[])
            : [];

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
