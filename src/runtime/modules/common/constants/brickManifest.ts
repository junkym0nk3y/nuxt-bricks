/**
 * Транспорт манифеста brick-компонентов. Константы общие для build-time
 * генератора (`src/bricks-manifest.ts`) и серверного читателя
 * (`server/utils/bricksComponents.ts`) — обе стороны обязаны сходиться в
 * baseName Nitro server asset и имени файла.
 */

/** Подкаталог манифеста внутри `nuxt.options.buildDir`. */
export const BRICKS_MANIFEST_DIR = 'bricks';

/**
 * baseName Nitro server asset — ключ storage `assets:<baseName>`.
 * В dev каталог монтируется fs-драйвером (манифест перечитывается с диска),
 * в prod содержимое запекается в серверный бандл.
 */
export const BRICKS_MANIFEST_ASSET_BASE = 'bricks';

/** Имя файла манифеста внутри каталога. */
export const BRICKS_MANIFEST_FILENAME = 'manifest.json';
