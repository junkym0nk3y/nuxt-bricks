/**
 * Composable для резолвинга изображений при импорте JSON-схемы.
 * Показывает модалку с найденными изображениями и позволяет выбрать:
 * оставить как есть или заменить на заглушку.
 */

// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IExtractedImageUrl,
    IImageResolverResult,
    IImageResolverState,
    IResolverPromise,
    TImageResolveAction,
} from '../types/schemaImageResolver';

// Vue
import { reactive, ref } from 'vue';

// Pinia
import { useMediaStore } from '../stores/media';

// Composables
import { useBricksAssetUrl } from '../../../common/composables/useBricksAssetUrl';

// Utils
import {
    extractSchemaImageUrls,
    getPlaceholderImageUrl,
    replaceSchemaImageUrls,
} from '../utils/schemaImageExtractor';
// #endregion

/**
 * Оркестрирует процесс резолвинга изображений при импорте схемы.
 */
export function useSchemaImageResolver() {
    // #region Data
    const mediaStore = useMediaStore();
    const { baseURL } = useBricksAssetUrl();

    const isModalOpen = ref(false);
    const pendingSchema = ref<IBricksSchema | null>(null);
    const pendingPromise = ref<IResolverPromise | null>(null);

    const state = reactive<IImageResolverState>({
        newImages: [],
        actions: new Map(),
        globalAction: 'keep',
    });

    // Поколение резолвинга. Операция начинается до модалки — с ожидания списка
    // медиатеки, и в этом окне гасить ещё нечего: `pendingPromise` не создан.
    // `handleCancel` поднимает поколение, и доехавший позже ответ уже не
    // открывает модалку прежней схемы поверх страницы, которую пользователь
    // успел выбрать. Гасит вызывающий: смену цели импорта видит он, не резолвер.
    let resolveGeneration = 0;
    // #endregion

    // #region Helpers
    /**
     * Сбрасывает состояние резолвера.
     */
    function resetState(): void {
        state.newImages = [];
        state.actions = new Map();
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
     * Модалка выбора показывается только после достоверного сравнения с
     * медиатекой. Когда её состав неизвестен, «новыми» выглядят все URL схемы —
     * включая те, что в медиатеке есть, — и предложение «оставить или заменить
     * заглушкой» разбирало бы придуманный список. Такой импорт проходит без
     * модалки и без изменений схемы, а вызывающий получает признак того, что
     * сравнение не выполнено.
     *
     * @param schema - Импортируемая схема.
     * @returns Схема (или `null` при отмене) и признак пропущенного сравнения.
     */
    async function startResolving(schema: IBricksSchema): Promise<IImageResolverResult> {
        // Начатый резолвинг вытесняется новым импортом: иначе его промис остался
        // бы неразрешённым навсегда — `pendingPromise` переписывается, а ждущий
        // вызывающий не получает ни схемы, ни отказа
        handleCancel();

        const startedIn = resolveGeneration;
        const allImages = extractSchemaImageUrls(schema);

        // Схеме без изображений медиатека не нужна вовсе — запрашивать её здесь
        // значило бы ждать сеть ради сравнения пустого списка
        if (allImages.length === 0) {
            return { schema, isComparisonSkipped: false };
        }

        if (!mediaStore.hasLoadedItemsSnapshot) {
            let isMediaUnavailable = false;

            try {
                await mediaStore.loadItems();
            } catch {
                isMediaUnavailable = true;
            }

            // Проверка поколения — общая для обоих исходов запроса, и стоит она
            // до разбора отказа. Иначе упавший запрос вытесненного импорта
            // возвращал бы свою схему как «импортировать без сравнения», и она
            // применилась бы поверх схемы более нового импорта
            if (resolveGeneration !== startedIn) {
                return { schema: null, isComparisonSkipped: false };
            }

            // Проверка снимка, а не только `catch`: вытесненный более свежим
            // запросом `loadItems` завершается без ошибки и без применения
            // ответа, и его «успех» означал бы сравнение с прежним списком
            if (isMediaUnavailable || !mediaStore.hasLoadedItemsSnapshot) {
                return { schema, isComparisonSkipped: true };
            }
        }

        const newImages = filterNewImages(allImages);

        // Нет новых изображений — возвращаем как есть
        if (newImages.length === 0) {
            return { schema, isComparisonSkipped: false };
        }

        // Инициализируем действия для каждого URL
        state.newImages = newImages;
        newImages.forEach((img) => {
            state.actions.set(img.url, 'keep');
        });

        pendingSchema.value = schema;
        isModalOpen.value = true;

        // Промис резолвится при confirm/cancel/skip
        const resolvedSchema = await new Promise<IBricksSchema | null>((resolve) => {
            pendingPromise.value = { resolve };
        });

        return { schema: resolvedSchema, isComparisonSkipped: false };
    }

    /**
     * Устанавливает действие для конкретного изображения.
     *
     * @param url - URL изображения.
     * @param action - Выбранное действие.
     */
    function setImageAction(url: string, action: TImageResolveAction): void {
        state.actions.set(url, action);
    }

    /**
     * Устанавливает глобальное действие для всех изображений.
     *
     * @param action - Действие для применения ко всем.
     */
    function setGlobalAction(action: TImageResolveAction): void {
        state.globalAction = action;
        state.newImages.forEach((img) => {
            state.actions.set(img.url, action);
        });
    }

    /**
     * Подтверждает выбранные действия и обрабатывает изображения.
     */
    function handleConfirm(): void {
        if (!pendingSchema.value || !pendingPromise.value) {
            return;
        }

        const placeholder = getPlaceholderImageUrl(baseURL);
        const urlMap = new Map<string, string>();

        state.newImages.forEach((image) => {
            const action = state.actions.get(image.url) ?? 'keep';
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
        // Гасит и начатое ожидание списка медиатеки, и открытую модалку
        resolveGeneration += 1;
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
