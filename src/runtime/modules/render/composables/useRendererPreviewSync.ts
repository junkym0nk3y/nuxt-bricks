// #region Imports
// Types
import type { IPreviewStoredPage } from '../../common/types/bricks-api';
import type { IRendererPreviewSync, IRendererPreviewSyncOptions } from '../types/composables';

// Vue
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

// Composables
import { useBricksConfig } from '../../common/composables/useBricksConfig';
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
 * Превью сохранённой версии (`?version=` в URL) ни синка, ни снапшота не
 * получает: его состояние приезжает с сервера и меняться не должно.
 *
 * @param options - Данные страницы, refs live-синка и колбэк перезапуска data sources.
 */
export function useRendererPreviewSync(options: IRendererPreviewSyncOptions): IRendererPreviewSync {
    const {
        pagename,
        isPreview,
        previewVersionId,
        middlewarePageData,
        livePreviewData,
        page,
        refreshDataSources,
    } = options;

    // Превью версии показывает состояние из истории: живой канвас ему не источник
    const isVersionPreview = previewVersionId !== null;

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
     *
     * Запись в localStorage принадлежит превью текущего канваса: вкладка версии её
     * не заводила и не должна уносить — иначе закрытие превью версии оставило бы
     * живое превью без снапшота.
     */
    function closePreview(): void {
        if (typeof window === 'undefined') {
            return;
        }

        if (!isVersionPreview) {
            window.localStorage.removeItem('bricks-preview-page');
        }

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

            // Превью версии получило состояние с сервера: снапшот живого канваса
            // подменил бы историю тем, что сейчас в редакторе
            if (isVersionPreview) {
                return;
            }

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

        // Синк с билдером — только для превью текущего состояния: вкладка версии
        // не просит схему у билдера (иначе он ответил бы живым канвасом) и не
        // принимает его обновлений
        if (!isVersionPreview) {
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
            });
        }

        onUnmounted(() => {
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
