/**
 * Composable для резолвинга изображений при импорте JSON-схемы.
 * Показывает модалку с найденными изображениями и позволяет выбрать:
 * оставить как есть или заменить на заглушку.
 */

// #region Imports
// Types
import type { BricksSchema } from '../../common/types/brick';
import type {
    IExtractedImageUrl,
    IImageResolverState,
    TImageResolveAction,
} from '../types/schemaImageResolver';

// Vue
import { reactive, ref } from 'vue';

// Pinia
import { useMediaStore } from '../stores/media';

// Utils
import {
    extractSchemaImageUrls,
    getPlaceholderImageUrl,
    replaceSchemaImageUrls,
} from '../utils/schemaImageExtractor';
// #endregion

// #region Interfaces
interface IResolverPromise {
    resolve: (schema: BricksSchema | null) => void;
}
// #endregion

/**
 * Оркестрирует процесс резолвинга изображений при импорте схемы.
 */
export function useSchemaImageResolver() {
    // #region Data
    const mediaStore = useMediaStore();

    const isModalOpen = ref(false);
    const pendingSchema = ref<BricksSchema | null>(null);
    const pendingPromise = ref<IResolverPromise | null>(null);

    const state = reactive<IImageResolverState>({
        newImages: [],
        actions: {},
        globalAction: 'keep',
    });
    // #endregion

    // #region Helpers
    /**
     * Сбрасывает состояние резолвера.
     */
    function resetState(): void {
        state.newImages = [];
        state.actions = {};
        state.globalAction = 'keep';
        pendingSchema.value = null;
    }

    /**
     * Фильтрует изображения, которых нет в медиа-галерее.
     *
     * @param images - Все извлечённые URL из схемы.
     * @returns Только новые URL, отсутствующие в галерее.
     */
    function filterNewImages(images: IExtractedImageUrl[]): IExtractedImageUrl[] {
        const galleryUrls = new Set(mediaStore.items.map((item) => item.url));

        return images.filter((img) => !galleryUrls.has(img.url));
    }
    // #endregion

    // #region Public API
    /**
     * Запускает процесс резолвинга изображений.
     * Если новых изображений нет — возвращает схему без модалки.
     *
     * @param schema - Импортируемая схема.
     * @returns Promise с обработанной схемой или null (отмена).
     */
    async function startResolving(schema: BricksSchema): Promise<BricksSchema | null> {
        resetState();

        // Загружаем медиа-галерею если ещё не загружена
        if (mediaStore.items.length === 0) {
            try {
                await mediaStore.loadItems();
            } catch {
                // Если галерея недоступна — продолжаем без сравнения
            }
        }

        const allImages = extractSchemaImageUrls(schema);
        const newImages = filterNewImages(allImages);

        // Нет новых изображений — возвращаем как есть
        if (newImages.length === 0) {
            return schema;
        }

        // Инициализируем действия для каждого URL
        state.newImages = newImages;
        newImages.forEach((img) => {
            state.actions[img.url] = 'keep';
        });

        pendingSchema.value = schema;
        isModalOpen.value = true;

        // Возвращаем Promise, который резолвится при confirm/cancel/skip
        return new Promise<BricksSchema | null>((resolve) => {
            pendingPromise.value = { resolve };
        });
    }

    /**
     * Устанавливает действие для конкретного изображения.
     *
     * @param url - URL изображения.
     * @param action - Выбранное действие.
     */
    function setImageAction(url: string, action: TImageResolveAction): void {
        state.actions[url] = action;
    }

    /**
     * Устанавливает глобальное действие для всех изображений.
     *
     * @param action - Действие для применения ко всем.
     */
    function setGlobalAction(action: TImageResolveAction): void {
        state.globalAction = action;
        state.newImages.forEach((img) => {
            state.actions[img.url] = action;
        });
    }

    /**
     * Подтверждает выбранные действия и обрабатывает изображения.
     */
    function handleConfirm(): void {
        if (!pendingSchema.value || !pendingPromise.value) {
            return;
        }

        const placeholder = getPlaceholderImageUrl();
        const urlMap = new Map<string, string>();

        state.newImages.forEach((image) => {
            const action = state.actions[image.url] || 'keep';
            if (action === 'placeholder') {
                urlMap.set(image.url, placeholder);
            }
        });

        const resolvedSchema = replaceSchemaImageUrls(pendingSchema.value, urlMap);

        isModalOpen.value = false;
        const resolver = pendingPromise.value;
        pendingPromise.value = null;
        resetState();
        resolver.resolve(resolvedSchema);
    }

    /**
     * Отменяет импорт — ничего не загружается.
     */
    function handleCancel(): void {
        isModalOpen.value = false;
        const resolver = pendingPromise.value;
        pendingPromise.value = null;
        resetState();
        resolver?.resolve(null);
    }

    /**
     * Пропускает обработку — загружает схему как есть.
     */
    function handleSkip(): void {
        if (!pendingSchema.value) {
            handleCancel();
            return;
        }

        const schema = pendingSchema.value;
        isModalOpen.value = false;
        const resolver = pendingPromise.value;
        pendingPromise.value = null;
        resetState();
        resolver?.resolve(schema);
    }
    // #endregion

    return {
        isModalOpen,
        state,
        startResolving,
        setImageAction,
        setGlobalAction,
        handleConfirm,
        handleCancel,
        handleSkip,
    };
}
