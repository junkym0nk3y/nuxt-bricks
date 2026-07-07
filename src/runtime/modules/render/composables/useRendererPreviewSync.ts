// #region Imports
// Types
import type { IPublishedPage, IPreviewStoredPage } from '../../common/types/bricks-api';

// Vue
import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';

// Composables
import { useBricksConfig } from '../../common/composables/useBricksConfig';
// #endregion

// #region Interfaces
export interface IRendererPreviewSyncOptions {
    pagename: string;
    isPreview: boolean;
    /** Данные страницы из payload middleware (БД). */
    middlewarePageData: Ref<IPublishedPage | null>;
    /** Live-данные превью: заполняются из localStorage и BroadcastChannel. */
    livePreviewData: Ref<IPublishedPage | null>;
    /** Итоговые данные страницы (live-превью либо payload middleware). */
    page: ComputedRef<IPublishedPage | null>;
    /** Перезапуск data sources при смене данных страницы. */
    refreshDataSources: () => void;
}

export interface IPreviewDeviceBreakpoint {
    name: string;
    minWidth: number;
    icon: string;
}

export interface IRendererPreviewSync {
    /** Активный device-брейкпоинт по текущей ширине окна (для баннера превью). */
    currentDevice: ComputedRef<IPreviewDeviceBreakpoint>;
    /** Текст текущего разрешения окна (для баннера превью). */
    resolutionText: ComputedRef<string>;
    /** Закрывает окно превью и очищает сохранённые данные превью. */
    closePreview: () => void;
}
// #endregion

const DEVICE_ICONS: Record<string, string> = {
    desktop: 'ta:outline-device-desktop',
    ultra: 'ta:outline-device-desktop',
    laptop: 'ta:outline-device-desktop',
    tablet: 'ta:outline-device-tablet',
    mobile: 'ta:outline-device-mobile',
};

/**
 * Live-синхронизация превью с builder-вкладкой: снапшот из localStorage
 * (только если свежее данных БД), realtime-обновления схемы через
 * BroadcastChannel, повторный запрос схемы при возврате на вкладку,
 * ResizeObserver для баннера с текущим устройством/разрешением.
 * Вне превью (или на сервере) — только computed для баннера, без подписок.
 *
 * @param options - Данные страницы, refs live-синка и колбэк перезапуска data sources.
 */
export function useRendererPreviewSync(options: IRendererPreviewSyncOptions): IRendererPreviewSync {
    const { pagename, isPreview, middlewarePageData, livePreviewData, page, refreshDataSources } =
        options;

    // Текущее разрешение и адаптив для превью-баннера
    const windowWidth = ref(0);
    const windowHeight = ref(0);

    const { breakpoints: deviceBreakpoints } = useBricksConfig();

    const sortedDeviceBreakpoints = computed(() =>
        Object.entries(deviceBreakpoints)
            .map(([name, minWidth]) => ({
                name,
                minWidth,
                icon: DEVICE_ICONS[name] ?? 'ta:outline-device-desktop',
            }))
            .sort((a, b) => b.minWidth - a.minWidth)
    );

    const currentDevice = computed(() => {
        const width = windowWidth.value;
        const bps = sortedDeviceBreakpoints.value;

        for (const bp of bps) {
            if (width >= bp.minWidth) {
                return bp;
            }
        }

        return bps[bps.length - 1];
    });

    const resolutionText = computed(() => `${windowWidth.value}×${windowHeight.value}`);

    /**
     * Закрывает окно превью и очищает сохранённые данные превью.
     */
    function closePreview(): void {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.removeItem('bricks-preview-page');
        window.close();
    }

    if (isPreview && import.meta.client) {
        let resizeObserver: ResizeObserver | null = null;

        /**
         * Проверяет, что снапшот превью из localStorage не старее данных БД из SSR payload.
         * Записи без `storedAt` (легаси) при наличии данных БД считаются устаревшими —
         * иначе замороженный снапшот перетирал бы свежесохранённую страницу.
         */
        function isStoredPreviewFresh(stored: IPreviewStoredPage): boolean {
            const dbPage = middlewarePageData.value;
            if (!dbPage) {
                return true;
            }

            const storedAt = Date.parse(stored.storedAt ?? '');
            if (Number.isNaN(storedAt)) {
                return false;
            }

            const updatedAt = Date.parse(dbPage.updatedAt ?? '');
            if (Number.isNaN(updatedAt)) {
                return true;
            }

            return storedAt >= updatedAt;
        }

        // При монтировании читаем данные из localStorage — но только если они свежее БД
        onMounted(() => {
            resizeObserver = new ResizeObserver(() => {
                windowWidth.value = window.innerWidth;
                windowHeight.value = window.innerHeight;
            });
            resizeObserver.observe(document.documentElement);

            try {
                const stored = window.localStorage.getItem('bricks-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as IPreviewStoredPage;
                    if (parsed.pagename === pagename && isStoredPreviewFresh(parsed)) {
                        livePreviewData.value = parsed;
                    }
                }
            } catch {
                // ignore storage errors
            }
        });

        // Подписываемся на realtime-обновления схемы от builder-вкладки
        const previewChannel = new BroadcastChannel('bricks-preview-sync');

        previewChannel.onmessage = (event: MessageEvent) => {
            const { type, pagename: msgPagename, schema } = event.data ?? {};

            if (type === 'schema-update' && msgPagename === pagename) {
                // livePreviewData как fallback: актуально для временных страниц, которых нет в БД
                const base = middlewarePageData.value ?? livePreviewData.value;
                if (base) {
                    livePreviewData.value = { ...base, schema };
                }
            }
        };

        /**
         * Запрашивает свежую схему у билдер-вкладки: восстанавливает live-синк
         * после перезагрузки превью или самого билдера.
         */
        function requestFreshSchema(): void {
            previewChannel.postMessage({ type: 'request-schema', pagename });
        }

        /**
         * Повторный запрос при возврате на вкладку — билдер мог перезагрузиться,
         * пока превью было в фоне.
         */
        function handleVisibilityChange(): void {
            if (!document.hidden) {
                requestFreshSchema();
            }
        }

        requestFreshSchema();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        onUnmounted(() => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            previewChannel.close();
            resizeObserver?.disconnect();
            resizeObserver = null;
        });

        // Обновляем data sources при смене данных страницы (первичная загрузка или live-обновление)
        watch(
            () => page.value,
            (value) => {
                if (value) {
                    refreshDataSources();
                }
            },
            { immediate: true }
        );
    }

    return {
        currentDevice,
        resolutionText,
        closePreview,
    };
}
