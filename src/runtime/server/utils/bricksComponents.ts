import { createError } from 'h3';
import { useStorage } from 'nitropack/runtime';
import {
    BRICKS_MANIFEST_ASSET_BASE,
    BRICKS_MANIFEST_FILENAME,
} from '../../modules/common/constants/brickManifest';
import type { IBricksManifest, TBrickManifestRef } from '../../modules/common/types/brickManifest';

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
 * Возвращает манифест целиком или компоненты одной категории.
 * Бросает 404, если запрошенной категории в манифесте нет.
 *
 * Отбор — прямая фильтрация, а не группировка всего манифеста: наружу уходит
 * ровно одна категория, корзины остальных строить незачем. Заодно категория,
 * пришедшая из brick-файла, не становится ключом объекта — строки `__proto__`
 * и `constructor` валидны как категории, но у объекта читаются как члены
 * `Object.prototype` и роняли обработчик.
 *
 * Сравнение регистронезависимое в обе стороны, поэтому `Marketing` и
 * `marketing` считаются одной категорией: иначе поиск отдавал бы компоненты
 * только той из них, что встретилась первой.
 *
 * @param category - Название категории из запроса (регистр не важен).
 * @returns Манифест либо список компонентов категории.
 */
export async function resolveBricksComponents(
    category?: string
): Promise<IBricksManifest | TBrickManifestRef[]> {
    const manifest = await readBricksManifest();

    if (!category) {
        return manifest;
    }

    const wanted = category.toLowerCase();
    const components = manifest.bricks
        .filter((brick) => brick.category.toLowerCase() === wanted)
        .map(({ name, brickPath }) => ({ name, brickPath }));

    if (components.length === 0) {
        throw createError({
            statusMessage: 'Components category not found!',
            statusCode: 404,
            data: {
                description: 'Убедитесь, что brick-файлы этой категории существуют в components/',
            },
        });
    }

    return components;
}
