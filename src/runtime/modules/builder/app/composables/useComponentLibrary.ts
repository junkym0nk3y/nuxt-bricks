// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickManifestEntry, IBricksManifest } from '../../../common/types/brickManifest';
import type { ISkippedBrick } from '../../core/types/componentLibrary';
import type { TCachedModal } from '../../core/types/modals';
import type { IComponentLibraryData, IUseComponentLibraryReturn } from '../types/composables';

// Utils
import { toComponentLibraryItem } from '../utils/componentLibraryItems';
import {
    createComponentManifestDeadlineError,
    isComponentManifestDeadlineError,
} from '../utils/componentLibraryPolicy';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed, onScopeDispose } from 'vue';

// Nuxt
import { onNuxtReady, useAsyncData, useState } from '#imports';

// Pinia
import { useComponentsStore } from '../../core/stores/components';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBrickImports } from '../../../common/composables/useBrickImports';
import { useBrickMetadata } from '../../core/composables/useBrickMetadata';
import { useComponentEditorMetadata } from '../../core/composables/useComponentEditorMetadata';
import { replaceModalsCache } from '../../core/composables/useModalOptions';

// Constants
import { LAYOUT_COMPONENTS } from '../../core/constants/layoutComponents';
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';
// #endregion

/** Категория бриков, попадающих в селектор модалок панели свойств. */
const MODAL_CATEGORY = 'Modal';

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
 * Собирает записи модалок для селектора свойств из того же ответа манифеста.
 * Отсутствие лоадера здесь не отсеивается: селектору нужны только имя и путь, а
 * рассинхрон сборки и манифеста показывает библиотека.
 *
 * @param bricks - Записи манифеста brick-компонентов.
 * @returns Записи модалок для кеша.
 */
function collectModalEntries(bricks: IBrickManifestEntry[]): TCachedModal[] {
    return bricks
        .filter((brick) => brick.category === MODAL_CATEGORY)
        .map((brick) => ({ name: brick.name, brickPath: brick.brickPath }));
}

/**
 * Загружает библиотеку компонентов: записи манифеста с бэкенда (метаданные в
 * них уже разобраны на build-time) + layout-компоненты.
 *
 * Этим же ответом наполняются кеш модалок панели свойств и индекс метаданных,
 * из которого живут панель свойств, слоты и inline-редактирование: манифест
 * один, и второй запрос за ним означал бы два независимых кеша одного ответа,
 * каждый со своей судьбой при отказе.
 *
 * Рядом с записями хранится хеш манифеста из ответа ручки. Потребителя у него
 * пока нет: правка brick-файла в dev перезагружает страницу целиком, потому что
 * тот же файл лежит в графе Vite и после первого превью компонента.
 *
 * Неудачный SSR-прогон восстанавливается одним запросом с клиента: без него
 * отказ на сервере оставлял бы сайдбар пустым до полной перезагрузки страницы, а
 * перезагрузка снова уходила бы в тот же SSR.
 *
 * @returns Список компонентов, признак отказа загрузки и повтор.
 */
export async function useComponentLibrary(): Promise<IUseComponentLibraryReturn> {
    const { hasBrickModule } = useBrickImports();
    const { replaceBrickMetadata } = useBrickMetadata();
    const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
    const componentsStore = useComponentsStore();

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
                bricks: [],
            };
        }

        return {
            hash: response?.hash || '',
            isPartial: false,
            bricks: response?.bricks || [],
        };
    });

    /**
     * Фиксирует результат успешной загрузки: снимок ответа, кеш модалок панели
     * свойств и индекс метаданных. Оба кеша обновляются здесь, а не внутри
     * handler'а: на гидрации handler не исполняется вовсе (ответ приезжает
     * готовым в payload), и они остались бы пустыми на клиенте — именно там, где
     * ими и пользуются. Пишутся из одного значения, чтобы список, опции модалок
     * и свойства выбранного компонента не могли разъехаться.
     *
     * Деградированный ответ не фиксируется: снимок «последней успешной загрузки»
     * стал бы списком из одних layout-блоков, а обнулённые кеши забрали бы опции
     * модалок и свойства, пришедшие с прошлой удачной загрузки.
     */
    function commitLoadedData(): void {
        const data = componentLibrary.data.value;

        if (!data || data.isPartial) {
            return;
        }

        lastLoadedData.value = data;
        // Раньше метаданных: опции модалок читает `brickValuesToProperties`,
        // которым панель свойств наполняется из того же индекса
        replaceModalsCache(collectModalEntries(data.bricks));
        replaceBrickMetadata(data.bricks);
        refreshSelectedComponentMetadata();
    }

    /**
     * Пересобирает свойства уже выбранного компонента.
     *
     * Панель свойств наполняется в момент выбора, а метаданные приезжают
     * манифестом: если он не дошёл, панель осталась пустой, и без этого шага
     * удачный повтор ничего бы в ней не изменил — пользователю пришлось бы
     * выбрать компонент заново. Обратная сторона того же шага: брик, исчезнувший
     * из манифеста, очищает панель, а не оставляет свойства от прошлой загрузки.
     */
    function refreshSelectedComponentMetadata(): void {
        const selected = componentsStore.selectedComponentData;

        if (!selected) {
            return;
        }

        const { properties, description } = resolveComponentEditorMetadata(selected.component);

        componentsStore.setSelectedComponentMetadata(selected.id, properties, description);
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

    // Записи, под которые в сборке есть лоадер. Проверяется на клиенте, а не в
    // handler'е: карта загрузчиков разворачивается в бандл, и авторитетна
    // именно та, что попала в текущую сборку
    const loadableBricks = computed<IBrickManifestEntry[]>(() =>
        (effectiveLibraryData.value?.bricks ?? []).filter((brick) =>
            hasBrickModule(brick.brickPath)
        )
    );

    // Layout-блоки манифеста не требуют: отказ ручки не должен забирать у
    // пользователя ещё и их — иначе на канвас нельзя положить вообще ничего
    const componentLibraryList = computed<IComponentLibraryItem[]>(() => [
        ...LAYOUT_COMPONENTS,
        ...loadableBricks.value.map(toComponentLibraryItem),
    ]);

    // Пропуск брика отказом загрузки не считается: ответ ручки дошёл и разобран,
    // повтор такой пропуск не исправит (лоадеров в готовой сборке не
    // прибавится). Поэтому — отдельный признак, живущий рядом с отказом, а не
    // вместо него: в сайдбаре они могут быть видны одновременно
    const skippedBricks = computed<ISkippedBrick[]>(() =>
        (effectiveLibraryData.value?.bricks ?? [])
            .filter((brick) => !hasBrickModule(brick.brickPath))
            .map((brick) => ({ name: brick.name, brickPath: brick.brickPath }))
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
