// #region Imports
// Vue
import { onUnmounted, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
// #endregion

/**
 * Синхронизация схемы канваса с открытой preview-вкладкой через BroadcastChannel.
 * Изменения компонентов отправляются с debounce 300ms; канал закрывается при unmount.
 */
export function usePreviewSync() {
    const componentsStore = useComponentsStore();

    let previewBroadcastChannel: BroadcastChannel | null = null;
    let previewSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let previewPagename = '';

    /**
     * Отправляет актуальную схему канваса в открытую вкладку превью через BroadcastChannel.
     * Параллельно обновляет localStorage, чтобы перезагрузка вкладки показывала свежие данные.
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
                    const parsed = JSON.parse(stored) as Record<string, unknown>;
                    if (parsed.pagename === previewPagename) {
                        parsed.schema = schema;
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
     * Открывает BroadcastChannel для синхронизации preview-вкладки.
     *
     * @param pagename - ЧПУ страницы, открытой в превью.
     */
    function startPreviewSync(pagename: string): void {
        if (!import.meta.client) {
            return;
        }

        previewPagename = pagename;

        if (!previewBroadcastChannel) {
            previewBroadcastChannel = new BroadcastChannel('bricks-preview-sync');
        }
    }

    // Отправляем обновления схемы в preview при изменении компонентов на канвасе (debounce 300ms)
    watch(
        () => componentsStore.components,
        () => {
            if (!previewBroadcastChannel) {
                return;
            }

            if (previewSyncTimer) {
                clearTimeout(previewSyncTimer);
            }

            previewSyncTimer = setTimeout(() => {
                sendPreviewSchemaUpdate();
                previewSyncTimer = null;
            }, 300);
        },
        { deep: true }
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
