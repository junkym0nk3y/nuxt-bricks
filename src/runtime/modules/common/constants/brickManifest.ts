/**
 * Транспорт манифеста brick-компонентов. Константы общие для build-time
 * генератора (`src/bricks-manifest.ts`) и серверного читателя
 * (`server/utils/bricksComponents.ts`) — обе стороны обязаны сходиться в
 * baseName Nitro server asset и имени файла.
 */

/**
 * Подкаталог манифеста внутри `nuxt.options.buildDir`.
 *
 * Имя совпадает с namespace осознанно: nitro сканирует каталог рекурсивно и
 * без фильтра по имени, поэтому любой чужой файл, попавший сюда, стал бы ключом
 * нашего server asset — вплоть до подмены `manifest.json`. `buildDir` общий для
 * Nuxt и всех модулей, так что каталог, как и namespace, держим за именем пакета.
 */
export const BRICKS_MANIFEST_DIR = 'nuxt-bricks-manifest';

/**
 * baseName Nitro server asset — ключ storage `assets:<baseName>`.
 * В dev каталог монтируется fs-драйвером (манифест перечитывается с диска),
 * в prod содержимое запекается в серверный бандл.
 *
 * Namespace квалифицирован именем пакета, потому что он общий для всего
 * приложения: `serverAssets` — плоский список, и при совпадении baseName с
 * записью потребителя или другого модуля dev и prod расходятся в поведении.
 * В dev nitro монтирует каждую запись отдельно, а `mount` unstorage на занятой
 * базе бросает `already mounted at ${base}` (двоеточие в сообщении — часть
 * нормализованной базы) — причём на верхнем уровне модуля Nitro, так что
 * **любой** запрос отдаёт 500 (проверено). В prod ключи `baseName + '/' + file`
 * сливаются пофайлово, и коллизия проходит незамеченной. Совпадение на общем
 * слове `bricks` слишком вероятно; имя пакета его исключает, хотя занять ровно
 * `nuxt-bricks-manifest` потребителю никто не мешает.
 */
export const BRICKS_MANIFEST_ASSET_BASE = 'nuxt-bricks-manifest';

/** Имя файла манифеста внутри каталога. */
export const BRICKS_MANIFEST_FILENAME = 'manifest.json';
