// #region Imports
// Types
import type { IPreviewStoredPage } from '../../../common/types/bricks-api';

// Vue
import { onUnmounted } from 'vue';

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
 * `request-schema`, и билдер отвечает свежей схемой — синк самовосстанавливается
 * после перезагрузки любой из вкладок. Изменения компонентов отправляются
 * с debounce 300ms; канал закрывается при unmount.
 */
export function usePreviewSync() {
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    let previewBroadcastChannel: BroadcastChannel | null = null;
    let previewSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let previewPagename = '';

    /**
     * Отправляет актуальную схему канваса в открытую вкладку превью через BroadcastChannel.
     * Параллельно обновляет localStorage (вместе со `storedAt`), чтобы перезагрузка
     * вкладки показывала свежие данные.
     */
    function sendPreviewSchemaUpdate(): void {
        if (!previewBroadcastChannel || !previewPagename) {
            return;
        }

        const schema = componentsStore.exportSchema();

        if (typeof window !== 'undefined') {
            try {
                const stored = window.localStorage.getItem('bricks-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as IPreviewStoredPage;
                    if (parsed.pagename === previewPagename) {
                        parsed.schema = schema;
                        parsed.storedAt = new Date().toISOString();
                        window.localStorage.setItem('bricks-preview-page', JSON.stringify(parsed));
                    }
                }
            } catch {
                // ignore storage errors
            }
        }

        previewBroadcastChannel.postMessage({
            type: 'schema-update',
            pagename: previewPagename,
            schema,
        });
    }

    /**
     * Создаёт BroadcastChannel и подписывается на `request-schema` от превью-вкладки:
     * если запрошен pagename страницы, открытой в билдере, восстанавливает синк
     * и немедленно отвечает свежей схемой.
     */
    function ensurePreviewChannel(): void {
        if (!import.meta.client || previewBroadcastChannel) {
            return;
        }

        previewBroadcastChannel = new BroadcastChannel('bricks-preview-sync');

        previewBroadcastChannel.onmessage = (event: MessageEvent) => {
            const { type, pagename } = event.data ?? {};
            if (type !== 'request-schema' || !pagename) {
                return;
            }

            const currentPagename = String(publishStore.currentFormState.pagename ?? '').trim();
            if (pagename !== currentPagename && pagename !== previewPagename) {
                return;
            }

            previewPagename = pagename;
            sendPreviewSchemaUpdate();
        };
    }

    /**
     * Запоминает pagename открытой превью-вкладки (вызывается при клике «Превью»).
     *
     * @param pagename - ЧПУ страницы, открытой в превью.
     */
    function startPreviewSync(pagename: string): void {
        if (!import.meta.client) {
            return;
        }

        previewPagename = pagename;
        ensurePreviewChannel();
    }

    // Канал открывается сразу, чтобы превью-вкладка могла восстановить синк
    // через request-schema после перезагрузки билдера
    ensurePreviewChannel();

    /**
     * Планирует отправку схемы в превью с debounce 300ms.
     */
    function schedulePreviewSchemaUpdate(): void {
        if (!previewBroadcastChannel || !previewPagename) {
            return;
        }

        if (previewSyncTimer) {
            clearTimeout(previewSyncTimer);
        }

        previewSyncTimer = setTimeout(() => {
            sendPreviewSchemaUpdate();
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
            schedulePreviewSchemaUpdate();
        });
    });

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
