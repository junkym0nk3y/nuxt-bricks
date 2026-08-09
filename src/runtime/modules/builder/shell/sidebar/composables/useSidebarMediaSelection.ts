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
 * Выбор медиа из галереи для панели свойств: контекст запроса
 * (обычное свойство / image-gallery) и применение выбранного элемента
 * к соответствующему свойству компонента.
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
            // Адрес файла и его спутники пишутся ОДНИМ изменением и всегда в
            // базовые props, минуя per-device scope панели. Причина не в
            // атомарности: `src` — свойство responsive-блока, и на mobile он
            // уходил в `responsive.mobile`, тогда как спутники ложились в базу.
            // Канвас на desktop получал адрес прежнего файла с пропорцией и
            // превью нового, а published per-device адрес не читает вовсе —
            // то есть отдельная картинка на mobile была иллюзией канваса.
            // Пустые значения пишутся тоже: у файла без вариантов или размеров
            // (SVG, видео, загрузка до их появления) прежние иначе остались бы
            // от предыдущей картинки.
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
        // Имя пропа объявляет brick-файл, пропсы приходят из схемы
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
