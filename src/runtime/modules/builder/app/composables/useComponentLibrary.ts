// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import type { IBrickManifestEntry, IBricksManifest } from '../../../common/types/brickManifest';
import type { IComponentLibraryData, IUseComponentLibraryReturn } from '../types/composables';

// Utils
import { extractBrickSlots } from '../utils/brickSlots';
import { toSafeRecord } from '../../../common/utils/safeRecord';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed } from 'vue';

// Nuxt
import { useAsyncData } from '#imports';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBrickImports } from '../../../common/composables/useBrickImports';

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
 * уходит внутренним вызовом Nitro, который `AbortSignal` не слушает (BM-27).
 * Оборачивать весь handler нельзя: в нём ещё импорт brick-модулей, и общий
 * дедлайн отдавал бы им остаток бюджета запроса — быстрый ответ ручки и медленные
 * импорты обнуляли бы библиотеку целиком, вместе с layout-компонентами (находка
 * ревью). Зависший импорт этим не ограничивается — на такое нужен свой честно
 * названный бюджет, и в объём BM-27 он не входит.
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
 * Загружает библиотеку компонентов: список bricks с бэкенда + метаданные
 * из `.brick.ts`-модулей (defaultProps, slots) + layout-компоненты.
 *
 * Рядом со списком хранится хеш манифеста из ответа ручки. Потребителя у него
 * пока нет — это заготовка под BM-19: когда метаданные бриков переедут в
 * манифест, обновление библиотеки в dev сведётся к сверке хешей. Про то, почему
 * `hash` и метаданные в `items` до BM-19 могут расходиться, — в
 * `IComponentLibraryData`.
 *
 * @returns Список компонентов библиотеки.
 */
export async function useComponentLibrary(): Promise<IUseComponentLibraryReturn> {
    const { findImportModule } = useBrickImports();

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
                        // а own-ключ `__proto__` не пережил бы Nuxt payload (BM-14)
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
                items: [
                    ...LAYOUT_COMPONENTS,
                    ...componentsWithMeta.filter(
                        (item): item is IComponentLibraryItem => item !== null
                    ),
                ],
            };
        }
    );

    const componentLibraryList = computed<IComponentLibraryItem[]>(
        () => componentLibrary.data.value?.items ?? []
    );

    return { componentLibraryList };
}
