// #region Imports
// Types
import type { IPreviewStoredPage } from '../../common/types/bricks-api';
import type {
    IPreviewDeviceBreakpoint,
    IRendererPreviewSync,
    IRendererPreviewSyncOptions,
} from '../types/composables';

// Utils
import { getPageAddressKey, toPageAddress } from '../../common/utils/bricks/pageAddress';

// Vue
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

// Composables
import { useBricksDevices } from '../../common/composables/useBricksDevices';

// Utils
import { deviceRanges, resolveDeviceIcon } from '../../common/utils/bricks/devices';
// #endregion

/**
 * Live-синхронизация превью с builder-вкладкой: снапшот из localStorage
 * (только если свежее данных БД), realtime-обновления схемы через
 * BroadcastChannel, повторный запрос схемы при возврате на вкладку,
 * ResizeObserver для баннера с текущим устройством/разрешением.
 * Вне превью (или на сервере) — только computed для баннера, без подписок.
 * Превью сохранённой версии (`?version=` в URL) ни синка, ни снапшота не
 * получает: его состояние приезжает с сервера и меняться не должно.
 *
 * @param options - Адрес и данные страницы, refs live-синка и колбэк перезапуска
 * data sources.
 */
export function useRendererPreviewSync(options: IRendererPreviewSyncOptions): IRendererPreviewSync {
    const {
        address,
        isPreview,
        previewVersionId,
        middlewarePageData,
        livePreviewData,
        page,
        refreshDataSources,
    } = options;

    // Превью версии показывает состояние из истории: живой канвас ему не источник
    const isVersionPreview = previewVersionId !== null;

    // Токен страницы в слоте localStorage и в канале синка — ключ адреса, а не
    // имя: слот один на билдер, и снимок `/blog/post` иначе показался бы в превью
    // `/news/post` как её собственный
    const addressKey = getPageAddressKey(address);

    // Текущее разрешение и адаптив для превью-баннера
    const windowWidth = ref(0);
    const windowHeight = ref(0);

    const { resolvePageDevices } = useBricksDevices();

    // Набор страницы, а не проекта: у страницы со своим набором баннер обязан
    // показывать её ступени — иначе на ширине 1400 он скажет «Планшет», пока
    // страница уже отрисована как ноутбук. Подпись и глиф приходят из набора,
    // второй таблицы иконок в коде больше нет
    const pageDevices = computed(() => resolvePageDevices(page.value?.viewportConfig ?? null));

    const sortedDeviceBreakpoints = computed<IPreviewDeviceBreakpoint[]>(() => {
        const devices = pageDevices.value;
        const ranges = deviceRanges(devices);

        return devices
            .map((device, index) => ({
                name: device.label,
                minWidth: ranges[index].min,
                icon: resolveDeviceIcon(device.icon),
            }))
            .sort((a, b) => b.minWidth - a.minWidth);
    });

    const currentDevice = computed<IPreviewDeviceBreakpoint>(() => {
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
     * Принадлежит ли снимок в слоте этой вкладке превью.
     *
     * @returns true — слот пуст, нечитаем или снят с этого же адреса.
     */
    function isPreviewSlotOwned(): boolean {
        const stored = window.localStorage.getItem('bricks-preview-page');

        if (!stored) {
            return true;
        }

        try {
            const parsed = JSON.parse(stored) as IPreviewStoredPage;

            return (
                getPageAddressKey(toPageAddress(parsed.pagename, parsed.urlPrefix)) === addressKey
            );
        } catch {
            return true;
        }
    }

    /**
     * Закрывает окно превью и очищает сохранённые данные превью.
     *
     * Запись в localStorage принадлежит превью текущего канваса: вкладка версии её
     * не заводила и не должна уносить — иначе закрытие превью версии оставило бы
     * живое превью без снапшота.
     *
     * Слот один на билдер, и владеет им последнее открытое превью, поэтому перед
     * удалением сверяется адрес: закрытие вкладки A, открытой раньше B, иначе
     * унесло бы снимок B — после перезагрузки B осталась бы без состояния канваса
     * (канал синка передаёт только схему, накладывать её не на что). Нечитаемую
     * запись убираем: владельца у неё не определить, а восстановить по ней нечего.
     */
    function closePreview(): void {
        if (typeof window === 'undefined') {
            return;
        }

        if (!isVersionPreview && isPreviewSlotOwned()) {
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
                    const storedKey = getPageAddressKey(
                        toPageAddress(parsed.pagename, parsed.urlPrefix)
                    );

                    if (storedKey === addressKey && isStoredPreviewFresh(parsed)) {
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
                const { type, address: msgAddress, schema, viewportConfig } = event.data ?? {};

                if (type === 'content-update' && msgAddress === addressKey) {
                    // livePreviewData как fallback: актуально для временных страниц, которых нет в БД
                    const base = middlewarePageData.value ?? livePreviewData.value;
                    if (base) {
                        // Набор устройств приезжает вместе со схемой: он задаёт
                        // пороги и ширины контейнера, и без него превью
                        // показывало бы новую схему в прежней раскладке
                        livePreviewData.value = {
                            ...base,
                            schema,
                            viewportConfig: viewportConfig ?? null,
                        };
                    }
                }
            };

            /**
             * Запрашивает свежую схему у билдер-вкладки: восстанавливает live-синк
             * после перезагрузки превью или самого билдера.
             */
            function requestFreshSchema(): void {
                previewChannel.postMessage({ type: 'request-schema', address: addressKey });
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
