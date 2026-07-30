// #region Imports
// Types
import type { IBuilderPagenameOptions, IUseBuilderPagenameReturn } from '../types/composables';

// Utils
import { migrateBuilderDraft } from '../../publish/utils/draftStorage';
import { BRICKS_ROUTE_NAMES } from '../../../common/constants/routes';

// Vue
import { computed, ref } from 'vue';

// Nuxt
import { useRoute, useRouter } from '#imports';
// #endregion

/** Имя роута страницы билдера (регистрация — extendPages в src/module.ts). */
const BUILDER_PAGE_ROUTE_NAME = BRICKS_ROUTE_NAMES.builderPage;

/**
 * Владелец pagename билдера — единый источник истины для URL и ключа черновиков.
 *
 * `routePagename` — slug из параметров маршрута (источник истины URL);
 * `sessionPagename` — pagename, на который открыта текущая сессия (ключ черновиков
 * localStorage). Расхождение значений означает навигацию на другую страницу —
 * её отслеживает watcher в `useBuilderSession`.
 *
 * @param options - Сообщение о недоступном хранилище: перенос черновика — ещё
 * один путь, на котором отказ storage иначе остался бы в консоли.
 */
export function useBuilderPagename(options: IBuilderPagenameOptions): IUseBuilderPagenameReturn {
    const route = useRoute();
    const router = useRouter();

    const routePagename = computed<string>(() => String(route.params.pagename || '').trim());
    const sessionPagename = ref<string>(routePagename.value);

    /**
     * Переносит открытую сессию на новый pagename: мигрирует черновик localStorage
     * и синхронизирует URL через Vue Router — `route.params` обновляется, поэтому
     * autosave и восстановление после reload работают по актуальному ключу.
     * Повторного bootstrap сессии не происходит: `sessionPagename` обновляется до
     * навигации, а страница билдера имеет статический page key
     * (см. `definePageMeta` в `pages/[pagename].vue`).
     *
     * @param next - Новый pagename.
     */
    async function renameSession(next: string): Promise<void> {
        const normalized = next.trim();
        if (!normalized || normalized === sessionPagename.value) {
            return;
        }

        // Страница билдера уже покинута (например, переход на дашборд) — URL не трогаем
        if (route.name !== BUILDER_PAGE_ROUTE_NAME) {
            return;
        }

        if (sessionPagename.value) {
            // Занятый целевой ключ — обычная ситуация (сессия владеет своим
            // ключом), а отказ хранилища означает, что черновик мог остаться под
            // прежним слагом: автосейв дальше пишет по новому ключу и сам о
            // поломке не сообщит
            if (migrateBuilderDraft(sessionPagename.value, normalized) === 'storage-unavailable') {
                options.draftStorageNotice.report();
            }
        }
        sessionPagename.value = normalized;

        if (routePagename.value !== normalized) {
            await router.replace({
                name: BUILDER_PAGE_ROUTE_NAME,
                params: { pagename: normalized },
            });
        }
    }

    return { routePagename, sessionPagename, renameSession };
}
