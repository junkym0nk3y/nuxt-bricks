// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import type { IBrickManifestEntry, IBricksManifest } from '../../../common/types/brickManifest';

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
 */
export async function useComponentLibrary() {
    const { findImportModule } = useBrickImports();

    const componentLibrary = await useAsyncData<(IComponentLibraryItem | null)[] | null>(
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

            return [...LAYOUT_COMPONENTS, ...componentsWithMeta.filter(Boolean)];
        }
    );

    const componentLibraryList = computed<IComponentLibraryItem[]>(() => {
        const list = componentLibrary.data.value;
        return (Array.isArray(list) ? list : []).filter(Boolean) as IComponentLibraryItem[];
    });

    return { componentLibraryList };
}
