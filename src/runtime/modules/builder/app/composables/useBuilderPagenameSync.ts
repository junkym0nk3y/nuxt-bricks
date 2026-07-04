// #region Imports
// Utils
import { isValidPagename } from '../../publish/utils/draftSnapshots';
import { migrateBuilderDraft } from '../../publish/utils/draftStorage';

// Vue
import { onBeforeUnmount, watch, type ComputedRef } from 'vue';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Синхронизация адресной строки с pagename из настроек публикации (debounce 600ms):
 * для новой (несохранённой) страницы меняет URL через history.replaceState без навигации
 * и мигрирует черновик localStorage на новый pagename.
 *
 * @param routePagename - Текущий pagename из параметров маршрута.
 */
export function useBuilderPagenameSync(routePagename: ComputedRef<string>): void {
    const publishStore = usePublishStore();

    let pagenameRouteTimer: number | null = null;

    watch(
        () => publishStore.currentFormState.pagename,
        (next) => {
            if (typeof window === 'undefined') {
                return;
            }

            // Не синхронизируем URL при редактировании существующей страницы
            if (publishStore.editingPageId !== null) {
                return;
            }

            const normalized = String(next ?? '').trim();
            if (!normalized || !isValidPagename(normalized)) {
                return;
            }

            // Debounce URL sync — просто меняем адресную строку без навигации
            if (pagenameRouteTimer !== null) {
                window.clearTimeout(pagenameRouteTimer);
            }

            pagenameRouteTimer = window.setTimeout(() => {
                pagenameRouteTimer = null;

                const currentNormalized = String(
                    publishStore.currentFormState.pagename ?? ''
                ).trim();
                if (
                    !currentNormalized ||
                    !isValidPagename(currentNormalized) ||
                    !publishStore.isPagenameAvailable(currentNormalized)
                ) {
                    return;
                }

                // Мигрируем черновик на новый pagename
                const from = routePagename.value;
                if (from && from !== currentNormalized) {
                    migrateBuilderDraft(from, currentNormalized);
                }

                // Меняем URL без навигации (не триггерит Vue Router)
                const newUrl = `/bricks/${currentNormalized}`;
                window.history.replaceState(window.history.state, '', newUrl);
            }, 600);
        }
    );

    onBeforeUnmount(() => {
        if (pagenameRouteTimer !== null) {
            window.clearTimeout(pagenameRouteTimer);
            pagenameRouteTimer = null;
        }
    });
}
