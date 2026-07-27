import { createError } from 'h3';
import { useStorage } from 'nitropack/runtime';
import {
    BRICKS_MANIFEST_ASSET_BASE,
    BRICKS_MANIFEST_FILENAME,
} from '../../modules/common/constants/brickManifest';
import type { IBrickCategory, IBricksManifest } from '../../modules/common/types/brickManifest';

const EMPTY_MANIFEST: IBricksManifest = { bricks: [], hash: '' };

/**
 * Читает манифест brick-компонентов из Nitro server assets: в dev каталог
 * манифеста смонтирован fs-драйвером (перечитывается с диска после каждой
 * правки brick-файла), в prod содержимое запечено в серверный бандл — работает
 * из `.output` без опоры на process.cwd().
 *
 * @returns Манифест или пустой список, если генератор ещё не отработал.
 */
async function readBricksManifest(): Promise<IBricksManifest> {
    const storage = useStorage(`assets:${BRICKS_MANIFEST_ASSET_BASE}`);
    const manifest = await storage.getItem<IBricksManifest>(BRICKS_MANIFEST_FILENAME);

    if (!manifest?.bricks) {
        console.warn('[bricks] манифест компонентов не сгенерирован — библиотека будет пустой');
        return EMPTY_MANIFEST;
    }

    return manifest;
}

/**
 * Группирует записи манифеста по категориям.
 *
 * @param manifest - Прочитанный манифест.
 * @returns Словарь «категория → компоненты».
 */
function groupByCategory(manifest: IBricksManifest): Record<string, IBrickCategory> {
    return manifest.bricks.reduce<Record<string, IBrickCategory>>((categories, brick) => {
        const category = (categories[brick.category] ||= { components: [] });
        category.components.push({ name: brick.name, brickPath: brick.brickPath });

        return categories;
    }, {});
}

/**
 * Возвращает манифест целиком или компоненты одной категории.
 * Бросает 404, если запрошенной категории в манифесте нет.
 *
 * @param category - Название категории из запроса (регистр не важен).
 * @returns Манифест либо список компонентов категории.
 */
export async function resolveBricksComponents(
    category?: string
): Promise<IBricksManifest | IBrickCategory['components']> {
    const manifest = await readBricksManifest();

    if (!category) {
        return manifest;
    }

    const categories = groupByCategory(manifest);
    const match = Object.keys(categories).find(
        (key) => key.toLowerCase() === category.toLowerCase()
    );

    if (!match) {
        throw createError({
            statusMessage: 'Components category not found!',
            statusCode: 404,
            data: {
                description: 'Убедитесь, что brick-файлы этой категории существуют в components/',
            },
        });
    }

    return categories[match].components;
}
