// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import type { IBrickManifestEntry, IBricksManifest } from '../../../common/types/brickManifest';
import type { IComponentLibraryData, IUseComponentLibraryReturn } from '../types/composables';

// Utils
import { extractBrickSlots } from '../utils/brickSlots';
import { toSafeRecord } from '../../../common/utils/safeRecord';

// Vue
import { computed } from 'vue';

// Nuxt
import { useAsyncData } from '#imports';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBrickImports } from '../../../common/composables/useBrickImports';

// Constants
import { LAYOUT_COMPONENTS } from '../../core/constants/layoutComponents';
// #endregion

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
            const response = await apiFetcher<IBricksManifest>('/api/bricks/components');
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
