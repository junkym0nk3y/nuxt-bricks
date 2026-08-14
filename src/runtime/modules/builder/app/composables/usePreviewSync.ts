// #region Imports
// Types
import type { IPreviewStoredPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderSessionToken } from '../types/composables';

// Utils
import { cloneDeviceSet } from '../../../common/utils/bricks/devices';
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { onUnmounted, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

// #region Data
/**
 * Actions стора компонентов, не меняющие схему: выбор, избранное, копирование
 * в буфер, чтение. Всё остальное (включая новые actions) по умолчанию триггерит
 * синк превью — false positive безопасен, false negative сломал бы синк.
 */
const NON_SCHEMA_ACTIONS = new Set([
    'selectComponent',
    'deselectComponent',
    'toggleInteractivePreview',
    'copyComponentToClipboard',
    'copySelectedComponent',
    'toggleFavorite',
    'exportSchema',
    'getRootComponents',
]);
// #endregion

/**
 * Синхронизация схемы канваса с открытой preview-вкладкой через BroadcastChannel.
 *
 * Канал открыт всё время жизни билдера: превью при монтировании шлёт
 * `request-schema`, и билдер отвечает снимком содержимого (схема + набор
 * устройств) — синк самовосстанавливается
 * после перезагрузки любой из вкладок. Изменения компонентов отправляются
 * с debounce 300ms; канал закрывается при unmount.
 *
 * Страницу в канале опознаёт КЛЮЧ АДРЕСА, а не имя: у `/blog/post` и
 * `/news/post` имя одно, и превью первой принимало бы схему второй как свою.
 *
 * @param sessionToken - Токен сессии: открытие другой страницы обрывает синк,
 * иначе её схема уезжала бы под адресом прежней.
 */
export function usePreviewSync(sessionToken: IBuilderSessionToken) {
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    let previewBroadcastChannel: BroadcastChannel | null = null;
    let previewSyncTimer: ReturnType<typeof setTimeout> | null = null;
    // Ключ адреса открытой превью-вкладки; пустая строка — синка нет
    let previewAddressKey = '';

    /**
     * Отправляет снимок содержимого канваса в открытую вкладку превью через
     * BroadcastChannel. Параллельно обновляет localStorage (вместе со `storedAt`),
     * чтобы перезагрузка вкладки показывала свежие данные.
     *
     * Снимок — схема И набор устройств: набор задаёт пороги media-query и ширины
     * контейнера, поэтому превью без него показывало бы новую схему в старой
     * раскладке.
     */
    function sendPreviewContentUpdate(): void {
        if (!previewBroadcastChannel || !previewAddressKey) {
            return;
        }

        const schema = componentsStore.exportSchema();
        // Копия, а не значение из состояния формы: там лежит reactive-прокси, а
        // structured clone на Proxy бросает DataCloneError — postMessage падал
        // целиком, и превью переставало обновляться до перезагрузки вкладки.
        // Запись в localStorage идёт ниже и проходила бы, маскируя отказ
        const viewportConfig = cloneDeviceSet(publishStore.currentFormState.viewportConfig);

        if (typeof window !== 'undefined') {
            try {
                const stored = window.localStorage.getItem('bricks-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as IPreviewStoredPage;
                    // Сверка по адресу: слот один на билдер, и снимок соседней
                    // одноимённой страницы иначе получил бы схему этой
                    if (
                        getPageAddressKey(toPageAddress(parsed.pagename, parsed.urlPrefix)) ===
                        previewAddressKey
                    ) {
                        parsed.schema = schema;
                        parsed.viewportConfig = viewportConfig;
                        parsed.storedAt = new Date().toISOString();
                        window.localStorage.setItem('bricks-preview-page', JSON.stringify(parsed));
                    }
                }
            } catch {
                // ignore storage errors
            }
        }

        previewBroadcastChannel.postMessage({
            type: 'content-update',
            address: previewAddressKey,
            schema,
            viewportConfig,
        });
    }

    /**
     * Создаёт BroadcastChannel и подписывается на `request-schema` от превью-вкладки:
     * если запрошен адрес страницы, открытой в билдере, восстанавливает синк
     * и немедленно отвечает свежей схемой.
     */
    function ensurePreviewChannel(): void {
        if (!import.meta.client || previewBroadcastChannel) {
            return;
        }

        previewBroadcastChannel = new BroadcastChannel('bricks-preview-sync');

        previewBroadcastChannel.onmessage = (event: MessageEvent) => {
            const { type, address } = event.data ?? {};
            if (type !== 'request-schema' || typeof address !== 'string' || !address) {
                return;
            }

            const formAddressKey = getPageAddressKey(
                toPageAddress(
                    String(publishStore.currentFormState.pagename ?? ''),
                    publishStore.currentFormState.urlPrefix
                )
            );

            if (address !== formAddressKey && address !== previewAddressKey) {
                return;
            }

            previewAddressKey = address;
            sendPreviewContentUpdate();
        };
    }

    /**
     * Запоминает адрес открытой превью-вкладки (вызывается при клике «Превью»).
     *
     * @param address - Адрес страницы, открытой в превью.
     */
    function startPreviewSync(address: IBricksPageAddress): void {
        if (!import.meta.client) {
            return;
        }

        previewAddressKey = getPageAddressKey(address);
        ensurePreviewChannel();
    }

    // Канал открывается сразу, чтобы превью-вкладка могла восстановить синк
    // через request-schema после перезагрузки билдера
    ensurePreviewChannel();

    /**
     * Планирует отправку схемы в превью с debounce 300ms.
     */
    function schedulePreviewContentUpdate(): void {
        if (!previewBroadcastChannel || !previewAddressKey) {
            return;
        }

        if (previewSyncTimer) {
            clearTimeout(previewSyncTimer);
        }

        previewSyncTimer = setTimeout(() => {
            sendPreviewContentUpdate();
            previewSyncTimer = null;
        }, 300);
    }

    // Синк по завершении мутирующих actions стора вместо deep-watch всей схемы
    // (deep-обход всех компонентов на каждую мутацию был дорог при drag/вводе текста).
    // Прямые мутации вне actions (useDraggableComponent) завершаются saveToHistory — покрыты.
    componentsStore.$onAction(({ name, after }) => {
        if (NON_SCHEMA_ACTIONS.has(name)) {
            return;
        }

        after(() => {
            schedulePreviewContentUpdate();
        });
    });

    // Отдельный триггер на набор устройств: подписка выше ловит только actions
    // стора компонентов, а правка набора блоков не трогает — превью осталось бы
    // на прежней раскладке до следующей правки схемы
    watch(
        () => publishStore.currentFormState.viewportConfig,
        () => {
            schedulePreviewContentUpdate();
        },
        { deep: true }
    );

    // Открытие другой страницы обрывает синк. Канал и `previewAddressKey` живут
    // дольше сессии, поэтому схема новой страницы уезжала в localStorage и
    // BroadcastChannel под адресом прежней — превью-вкладка показывала чужой
    // контент под своим адресом. Вкладка просто перестаёт обновляться:
    // её `request-schema` дальше отсекается сравнением с адресом формы.
    // flush: 'sync' — сброс обязан произойти в момент инвалидации токена, до
    // того как `openBuilderSession` уйдёт в await и схема сменится на канвасе
    watch(
        sessionToken.token,
        () => {
            previewAddressKey = '';

            if (previewSyncTimer) {
                clearTimeout(previewSyncTimer);
                previewSyncTimer = null;
            }
        },
        { flush: 'sync' }
    );

    onUnmounted(() => {
        if (previewSyncTimer) {
            clearTimeout(previewSyncTimer);
            previewSyncTimer = null;
        }
        previewBroadcastChannel?.close();
        previewBroadcastChannel = null;
    });

    return { startPreviewSync };
}
