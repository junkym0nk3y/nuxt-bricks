// #region Imports
// Types
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type {
    IBuilderSessionAddressOptions,
    IUseBuilderSessionAddressReturn,
} from '../types/composables';

// Utils
import { migrateBuilderDraft } from '../../publish/utils/draftStorage';
import {
    getBuilderPageRouteLocation,
    isSamePageAddress,
    resolvePageAddressFromRoute,
} from '../../../common/utils/bricks/pageAddress';
import { BRICKS_BUILDER_PAGE_ROUTE_NAMES } from '../../../common/constants/routes';

// Vue
import { computed, ref } from 'vue';

// Nuxt
import { useRoute, useRouter } from '#imports';
// #endregion

/**
 * Владелец адреса сессии билдера — единый источник истины для URL и ключа
 * черновиков.
 *
 * `routeAddress` — адрес из параметров маршрута (источник истины URL);
 * `sessionAddress` — адрес, на который открыта текущая сессия (ключ черновиков
 * localStorage). Расхождение значений означает навигацию на другую страницу —
 * её отслеживает watcher в `useBuilderSession`.
 *
 * Адрес, а не один `pagename`: у `/blog/post` и `/news/post` редакторы и
 * черновики обязаны различаться, а имя у них одно.
 *
 * @param options - Сообщение о недоступном хранилище: перенос черновика — ещё
 * один путь, на котором отказ storage иначе остался бы в консоли.
 */
export function useBuilderSessionAddress(
    options: IBuilderSessionAddressOptions
): IUseBuilderSessionAddressReturn {
    const route = useRoute();
    const router = useRouter();

    const routeAddress = computed<IBricksPageAddress>(() =>
        resolvePageAddressFromRoute(route.params)
    );
    const sessionAddress = ref<IBricksPageAddress>(routeAddress.value);

    /**
     * Переносит открытую сессию на новый адрес: мигрирует черновик localStorage
     * и синхронизирует URL через Vue Router — `route.params` обновляется, поэтому
     * autosave и восстановление после reload работают по актуальному ключу.
     * Повторного bootstrap сессии не происходит: `sessionAddress` обновляется до
     * навигации, а страница билдера имеет статический page key
     * (см. `definePageMeta` в `pages/[pagename].vue`).
     *
     * Смена префикса — тот же перенос, что и смена имени: адрес редактора
     * включает префикс, поэтому URL и ключ черновика обязаны догнать обе
     * половины пары.
     *
     * @param next - Новый адрес страницы.
     */
    async function renameSession(next: IBricksPageAddress): Promise<void> {
        if (!next.pagename.trim() || isSamePageAddress(next, sessionAddress.value)) {
            return;
        }

        // Страница билдера уже покинута (например, переход на дашборд) — URL не трогаем
        if (
            typeof route.name !== 'string' ||
            !BRICKS_BUILDER_PAGE_ROUTE_NAMES.includes(route.name)
        ) {
            return;
        }

        if (sessionAddress.value.pagename) {
            // Занятый целевой ключ — обычная ситуация (сессия владеет своим
            // ключом), а отказ хранилища означает, что черновик мог остаться под
            // прежним адресом: автосейв дальше пишет по новому ключу и сам о
            // поломке не сообщит
            if (migrateBuilderDraft(sessionAddress.value, next) === 'storage-unavailable') {
                options.draftStorageNotice.report();
            }
        }
        sessionAddress.value = next;

        if (!isSamePageAddress(routeAddress.value, next)) {
            await router.replace(getBuilderPageRouteLocation(next));
        }
    }

    return { routeAddress, sessionAddress, renameSession };
}
