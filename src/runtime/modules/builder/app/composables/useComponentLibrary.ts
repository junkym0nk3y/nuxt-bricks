// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import type { IBrickManifestEntry, IBricksManifest } from '../../../common/types/brickManifest';
import type { TCachedModal } from '../../core/types/modals';
import type { ISkippedBrick } from '../../core/types/componentLibrary';
import type { IComponentLibraryData, IUseComponentLibraryReturn } from '../types/composables';

// Utils
import { extractBrickSlots } from '../utils/brickSlots';
import {
    createComponentManifestDeadlineError,
    isComponentManifestDeadlineError,
} from '../utils/componentLibraryPolicy';
import { toSafeRecord } from '../../../common/utils/safeRecord';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed, onScopeDispose } from 'vue';

// Nuxt
import { onNuxtReady, useAsyncData, useState } from '#imports';

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

    const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

    return withPromiseDeadline(request, deadlineMs, () =>
        createComponentManifestDeadlineError(deadlineMs)
    );
}

/**
 * Отличает пропущенный brick от собранного элемента библиотеки: разбор одной
 * записи манифеста заканчивается либо тем, либо другим.
 *
 * @param entry - Результат разбора записи манифеста.
 * @returns Является ли результат пропуском.
 */
function isSkippedBrick(entry: IComponentLibraryItem | ISkippedBrick): entry is ISkippedBrick {
    return 'reason' in entry;
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
 * Неудачный SSR-прогон восстанавливается одним запросом с клиента: без него
 * отказ на сервере оставлял бы сайдбар пустым до полной перезагрузки страницы, а
 * перезагрузка снова уходила бы в тот же SSR.
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

    // Промис `useAsyncData` намеренно не await'ится здесь: до await нужно
    // синхронно зарегистрировать восстановление после SSR-отказа, а после него
    // активный scope потерян (то же ограничение, из-за которого вся проводка
    // `useBuilderPage` идёт до его единственного await)
    const componentLibrary = useAsyncData<IComponentLibraryData>('bricks-components', async () => {
        const { apiFetcher } = useApiClient();
        let response: IBricksManifest;

        try {
            response = await fetchManifestWithinDeadline(
                apiFetcher<IBricksManifest>('/api/bricks/components')
            );
        } catch (error: unknown) {
            // Прочие отказы уходят наружу: `error` нужен интерфейсу как
            // признак отказа, а повтор их чинит не всегда
            if (!isComponentManifestDeadlineError(error)) {
                throw error;
            }

            console.warn(
                '[BricksBuilder] Components manifest deadline exceeded — layout blocks only',
                error
            );

            // Отклонять загрузку нельзя: ошибка легла бы в `payload._errors`,
            // а при гидрации с ошибкой Nuxt пропускает первый запрос — сайдбар
            // остался бы пустым до полной перезагрузки, и та снова ушла бы в
            // SSR и снова прождала бы дедлайн. Маркер неполноты — чтобы
            // деградированный ответ не осел в payload как полный
            return {
                hash: '',
                isPartial: true,
                modals: [],
                items: [...LAYOUT_COMPONENTS],
                skippedBricks: [],
            };
        }

        const bricks = response?.bricks || [];

        const componentsWithMeta = await Promise.all(
            bricks.map(async (brick: IBrickManifestEntry) => {
                try {
                    const moduleLoader = findImportModule(brick.brickPath);
                    if (!moduleLoader) {
                        console.error(`[BricksBuilder] No loader for ${brick.brickPath}`);

                        return {
                            name: brick.name,
                            brickPath: brick.brickPath,
                            reason: 'loader-missing',
                        } as ISkippedBrick;
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

                    return {
                        name: brick.name,
                        brickPath: brick.brickPath,
                        reason: 'import-failed',
                    } as ISkippedBrick;
                }
            })
        );

        return {
            hash: response?.hash || '',
            isPartial: false,
            modals: collectModalEntries(bricks),
            items: [
                ...LAYOUT_COMPONENTS,
                ...componentsWithMeta.filter(
                    (entry): entry is IComponentLibraryItem => !isSkippedBrick(entry)
                ),
            ],
            skippedBricks: componentsWithMeta.filter(isSkippedBrick),
        };
    });

    /**
     * Фиксирует результат успешной загрузки: снимок ответа и кеш модалок панели
     * свойств. Кеш модалок обновляется здесь, а не только внутри handler'а: на
     * гидрации handler не исполняется вовсе (ответ приезжает готовым в payload),
     * и кеш остался бы пустым на клиенте — именно там, где селектор и открывают.
     * Снимок и кеш пишутся из одного значения, чтобы список и опции модалок не
     * могли разъехаться.
     *
     * Деградированный ответ не фиксируется: снимок «последней успешной загрузки»
     * стал бы списком из одних layout-блоков, а `replaceModalsCache([])` обнулил
     * бы опции модалок, пришедшие с прошлой удачной загрузки.
     */
    function commitLoadedData(): void {
        const data = componentLibrary.data.value;

        if (!data || data.isPartial) {
            return;
        }

        lastLoadedData.value = data;
        replaceModalsCache(data.modals);
    }

    // Ответ, по которому живёт интерфейс: свежий полный, иначе снимок последней
    // удачной загрузки, иначе деградированный.
    //
    // Деградированный ответ уступает снимку: в нём только layout-блоки, и он
    // иначе перекрыл бы полный список, загруженный до ухода из билдера. Обратный
    // порядок («снимок всегда важнее») неверен — тогда снимок перекрывал бы
    // свежий полный ответ.
    //
    // Один источник и для списка, и для пропусков: иначе на экране оказались бы
    // компоненты одной загрузки и предупреждение от другой
    const effectiveLibraryData = computed<IComponentLibraryData | null>(() => {
        const data = componentLibrary.data.value;

        if (data && !data.isPartial) {
            return data;
        }

        return lastLoadedData.value ?? data ?? null;
    });

    // Layout-блоки манифеста не требуют: отказ ручки не должен забирать у
    // пользователя ещё и их — иначе на канвас нельзя положить вообще ничего
    const componentLibraryList = computed<IComponentLibraryItem[]>(
        () => effectiveLibraryData.value?.items ?? LAYOUT_COMPONENTS
    );

    // Пропуск brick-модуля отказом загрузки не считается: ответ ручки дошёл и
    // разобран, повтор такой пропуск не исправит (лоадеров в готовой сборке не
    // прибавится). Поэтому — отдельный признак, живущий рядом с отказом, а не
    // вместо него: в сайдбаре они могут быть видны одновременно
    const skippedBricks = computed<ISkippedBrick[]>(
        () => effectiveLibraryData.value?.skippedBricks ?? []
    );

    // Отказ отличается от «библиотека пуста»: список непуст и при отказе
    // (layout-блоки), поэтому признак нужен отдельным полем. Деградация — тоже
    // отказ для интерфейса: тост и блок повтора в сайдбаре нужны и тогда, когда
    // манифест не дошёл за дедлайн. Признак снимется сам, если восстановление
    // ниже успеет донести библиотеку
    const isComponentLibraryLoadFailed = computed<boolean>(
        () =>
            componentLibrary.error.value !== null || componentLibrary.data.value?.isPartial === true
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

    // Страница ещё смонтирована на момент запуска восстановления. Проверка не
    // отменяет уже улетевший запрос — только не начинает новый: пользователь
    // успевает уйти, пока восстановление ждёт конца гидрации. Начатый же запрос
    // после ухода вернётся в очищенный кеш (`purgeCachedData` при размонтировании
    // не удаляет промис из `_asyncDataPromises`, поэтому Nuxt его результат
    // применит и заведёт запись заново) — вреда нет, но и смысла тоже
    let isPageAlive = true;
    let isRecoveryStarted = false;

    /**
     * Восстанавливает библиотеку после неудачного SSR-прогона: один запрос с
     * клиента, где ни SSR-дедлайна, ни инертного потолка транспорта уже нет.
     *
     * Повторяются два исхода: деградация по дедлайну и обычный отказ ручки. Для
     * второго повтор — единственный шанс: ошибка SSR лежит в `payload._errors`, а
     * при гидрации с ошибкой Nuxt первый запрос пропускает, то есть сайдбар
     * остался бы пустым до полной перезагрузки страницы.
     *
     * Ровно одна попытка. Сегодня к этому обязывает только договорённость:
     * `onNuxtReady` зовёт колбэк единожды, поэтому цикла нет и без флага. Флаг
     * защищает от второго вызывающего — а он появится, как только повтор
     * захочется повесить ещё и на возврат сети или на смену видимости вкладки.
     * Дальше повтор только руками, кнопкой сайдбара.
     */
    function recoverFailedLibrary(): void {
        const isRecoverable =
            componentLibrary.data.value?.isPartial === true ||
            componentLibrary.error.value !== null;

        if (!isPageAlive || isRecoveryStarted || !isRecoverable) {
            return;
        }

        isRecoveryStarted = true;

        // Отпускаем: результат ждать некому, а исход виден по состоянию
        // библиотеки. `void` не пишем — правило `no-void` в oxlint
        refreshComponentLibrary().catch((error: unknown) => {
            console.warn('[BricksBuilder] Components library recovery failed:', error);
        });
    }

    // `onScopeDispose` вместо `onUnmounted`: со вторым аргументом он молчит вне
    // компонента, поэтому композабл остаётся вызываемым в unit-тестах без
    // предупреждения Vue о потерянном хуке
    onScopeDispose(() => {
        isPageAlive = false;
    }, true);

    // Не `onMounted`: mounted-хуки успевают отработать до того, как Nuxt снимет
    // `isHydrating`, а пока гидрация идёт, `refresh()` возвращает тот же ответ из
    // payload, не обращаясь к ручке (`getDefaultCachedData`). `onNuxtReady`
    // привязан к `app:suspense:resolve`, то есть к моменту, когда повтор реально
    // уйдёт в сеть. На сервере он не делает ничего.
    //
    // Цена: колбэк идёт через `requestIdleCallback` без потолка ожидания, поэтому
    // под непрерывной нагрузкой восстановление отложится. Это принято: библиотека уже
    // показывает layout-блоки, и её догрузка — работа фоновая, а не срочная
    onNuxtReady(recoverFailedLibrary);

    await componentLibrary;

    commitLoadedData();

    return {
        componentLibraryList,
        skippedBricks,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading: computed<boolean>(
            () => componentLibrary.status.value === 'pending'
        ),
        refreshComponentLibrary,
    };
}
