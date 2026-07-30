// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import type { IBrickManifestEntry, IBricksManifest } from '../../../common/types/brickManifest';
import type { TCachedModal } from '../../core/types/modals';
import type { IComponentLibraryData, IUseComponentLibraryReturn } from '../types/composables';

// Utils
import { extractBrickSlots } from '../utils/brickSlots';
import { toSafeRecord } from '../../../common/utils/safeRecord';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed } from 'vue';

// Nuxt
import { useAsyncData, useState } from '#imports';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBrickImports } from '../../../common/composables/useBrickImports';
import { replaceModalsCache } from '../../core/composables/useModalOptions';

// Constants
import { LAYOUT_COMPONENTS } from '../../core/constants/layoutComponents';
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';
// #endregion

/**
 * Ограничивает ожидание манифеста на SSR.
 *
 * Дедлайн накрывает **только сам запрос**: страницу редактора ждёт `setup`
 * (`useBuilderPage`), а на сервере потолок транспорта инертен — относительный URL
 * уходит внутренним вызовом Nitro, который `AbortSignal` не слушает.
 * Оборачивать весь handler нельзя: в нём ещё импорт brick-модулей, и общий
 * дедлайн отдавал бы им остаток бюджета запроса — быстрый ответ ручки и медленные
 * импорты обнуляли бы библиотеку целиком, вместе с layout-компонентами (находка
 * ревью). Зависший импорт этим дедлайном не ограничен — на такое нужен свой
 * честно названный бюджет, которого пока нет.
 *
 * На клиенте потолок транспорта работает сам, дедлайн там не нужен.
 *
 * @param request - Промис запроса манифеста.
 * @returns Ответ ручки компонентов.
 */
function fetchManifestWithinDeadline(request: Promise<IBricksManifest>): Promise<IBricksManifest> {
    if (!import.meta.server) {
        return request;
    }

    return withPromiseDeadline(
        request,
        BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS,
        () => {
            // Имя `TimeoutError` — чтобы дедлайн классифицировался тем же
            // `isRequestTimeoutError`, что и обрыв запроса на клиенте
            const error = new Error('Bricks components manifest request timed out');
            error.name = 'TimeoutError';

            return error;
        }
    );
}

/**
 * Собирает записи модалок для селектора свойств из того же ответа манифеста.
 * Берутся до импорта brick-модулей: отказ импорта отдельного компонента не
 * должен убирать его из селектора — там нужны только имя и путь.
 *
 * @param bricks - Записи манифеста brick-компонентов.
 * @returns Записи модалок для кеша.
 */
function collectModalEntries(bricks: IBrickManifestEntry[]): TCachedModal[] {
    return bricks
        .filter((brick) => brick.category === 'Modal')
        .map((brick) => ({ name: brick.name, brickPath: brick.brickPath }));
}

/**
 * Загружает библиотеку компонентов: список bricks с бэкенда + метаданные
 * из `.brick.ts`-модулей (defaultProps, slots) + layout-компоненты.
 *
 * Этим же ответом наполняется кеш модалок панели свойств: манифест один, и
 * второй запрос за ним означал бы два независимых кеша одного ответа, каждый со
 * своей судьбой при отказе.
 *
 * Рядом со списком хранится хеш манифеста из ответа ручки. Потребителя у него
 * пока нет — это заготовка на будущее: когда метаданные бриков переедут в
 * манифест, обновление библиотеки в dev сведётся к сверке хешей. Про то, почему
 * `hash` и метаданные в `items` пока могут расходиться, — в
 * `IComponentLibraryData`.
 *
 * @returns Список компонентов, признак отказа загрузки и повтор.
 */
export async function useComponentLibrary(): Promise<IUseComponentLibraryReturn> {
    const { findImportModule } = useBrickImports();

    // Снимок последней успешной загрузки. Нужен из-за поведения `useAsyncData`:
    // при отказе он сбрасывает `data` в дефолт (`asyncData.js`: `data.value =
    // unref(options.default())`), то есть неудачный повтор забирал бы у
    // пользователя уже загруженные брики — вместе с возможностью работать дальше
    // тем, что и так работало.
    //
    // Состояние уровня приложения, а не локальный `ref`: кеш keyed-запроса
    // очищается при размонтировании последнего потребителя
    // (`purgeCachedData`), поэтому снимок в экземпляре страницы жил бы короче
    // кеша модалок из того же ответа — при повторном заходе с отказом ручки
    // селектор модалок показывал бы записи, которых уже нет в библиотеке.
    // Заводится до `await`: после него композабл вне Nuxt-контекста.
    const lastLoadedData = useState<IComponentLibraryData | null>(
        'bricks-components-last-loaded',
        () => null
    );

    const componentLibrary = await useAsyncData<IComponentLibraryData>(
        'bricks-components',
        async () => {
            const { apiFetcher } = useApiClient();
            const response = await fetchManifestWithinDeadline(
                apiFetcher<IBricksManifest>('/api/bricks/components')
            );
            const bricks = response?.bricks || [];

            const componentsWithMeta = await Promise.all(
                bricks.map(async (brick: IBrickManifestEntry) => {
                    try {
                        const moduleLoader = findImportModule(brick.brickPath);
                        if (!moduleLoader) {
                            console.error(`[BricksBuilder] No loader for ${brick.brickPath}`);
                            return null;
                        }

                        const module = await moduleLoader();
                        const brickData = module?.brick;
                        const values = brickData?.values || {};
                        const slots = extractBrickSlots(brickData);
                        // Имена пропов приходят из brick-файла: `acc['__proto__'] = …`
                        // подменял бы прототип аккумулятора вместо записи ключа,
                        // а own-ключ `__proto__` не пережил бы Nuxt payload
                        const defaultProps = toSafeRecord(
                            Object.entries(values).map(
                                ([key, val]: [string, IBrickValues]) =>
                                    [key, val.default] as [string, unknown]
                            )
                        );

                        return {
                            name: brick.name,
                            // Категория — из манифеста: сгенерированная запись
                            // всегда несёт непустое значение (дефолт `Common`),
                            // поэтому подстановка из brick-модуля была
                            // недостижима. Записи из чужого или правленого
                            // руками манифеста не поддерживаются: их формы не
                            // проверяет и читатель (`readBricksManifest`)
                            category: brick.category,
                            brickPath: brick.brickPath,
                            description: brickData?.description,
                            thumbnail: '',
                            defaultProps,
                            slots,
                        } as IComponentLibraryItem;
                    } catch (error) {
                        console.error(`[BricksBuilder] Failed loading ${brick.name}`, error);
                        return null;
                    }
                })
            );

            return {
                hash: response?.hash || '',
                modals: collectModalEntries(bricks),
                items: [
                    ...LAYOUT_COMPONENTS,
                    ...componentsWithMeta.filter(
                        (item): item is IComponentLibraryItem => item !== null
                    ),
                ],
            };
        }
    );

    /**
     * Фиксирует результат успешной загрузки: снимок ответа и кеш модалок панели
     * свойств. Кеш модалок обновляется здесь, а не только внутри handler'а: на
     * гидрации handler не исполняется вовсе (ответ приезжает готовым в payload),
     * и кеш остался бы пустым на клиенте — именно там, где селектор и открывают.
     * Снимок и кеш пишутся из одного значения, чтобы список и опции модалок не
     * могли разъехаться.
     */
    function commitLoadedData(): void {
        const data = componentLibrary.data.value;

        if (!data) {
            return;
        }

        lastLoadedData.value = data;
        replaceModalsCache(data.modals);
    }

    commitLoadedData();

    // Layout-блоки манифеста не требуют: отказ ручки не должен забирать у
    // пользователя ещё и их — иначе на канвас нельзя положить вообще ничего
    const componentLibraryList = computed<IComponentLibraryItem[]>(
        () => componentLibrary.data.value?.items ?? lastLoadedData.value?.items ?? LAYOUT_COMPONENTS
    );

    // Отказ отличается от «библиотека пуста»: список непуст и при отказе
    // (layout-блоки), поэтому признак нужен отдельным полем
    const isComponentLibraryLoadFailed = computed<boolean>(
        () => componentLibrary.error.value !== null
    );

    /**
     * Повторяет загрузку манифеста. Ни во время повтора, ни после неудачного
     * прежний список не исчезает: исчезновение карточек читалось бы как потеря
     * библиотеки, хотя работать с уже загруженной ничто не мешает.
     *
     * @returns Загрузка удалась.
     */
    async function refreshComponentLibrary(): Promise<boolean> {
        await componentLibrary.refresh();

        if (componentLibrary.error.value !== null) {
            return false;
        }

        commitLoadedData();

        return true;
    }

    return {
        componentLibraryList,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading: computed<boolean>(
            () => componentLibrary.status.value === 'pending'
        ),
        refreshComponentLibrary,
    };
}
