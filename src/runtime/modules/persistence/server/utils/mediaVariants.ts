/**
 * Политика имён уменьшенных вариантов растра (постепенная загрузка).
 *
 * Варианты живут рядом с полным файлом под тем же uuid и отличаются суффиксом:
 * `<uuid>.<ext>` / `<uuid>-preview.<ext>` / `<uuid>-mock.<ext>`. Имена держатся
 * в одном месте потому, что их читают три независимых потребителя: генерация при
 * загрузке, удаление файла (варианты нужно снести вместе с полным) и импорт из
 * бакета (варианты не должны стать отдельными записями медиатеки).
 */

// Types
import type { TMediaVariant } from '../../types/media';

/** Суффикс имени файла для каждого варианта. */
const MEDIA_VARIANT_SUFFIXES: Record<TMediaVariant, string> = {
    preview: '-preview',
    mock: '-mock',
};

/**
 * Параметры генерации вариантов.
 *
 * `preview` — то, что пользователь видит вместо полного файла почти сразу:
 * 480px хватает, чтобы кадр читался в любом блоке страницы. `mock` — размытая
 * заглушка первого кадра, её задача только в том, чтобы место не было пустым,
 * поэтому 32px и предельно низкое качество (единицы килобайт).
 */
export const MEDIA_VARIANT_PRESETS: Record<TMediaVariant, { maxWidth: number; quality: number }> = {
    preview: { maxWidth: 480, quality: 40 },
    mock: { maxWidth: 32, quality: 20 },
};

/**
 * Строит имя файла варианта из имени полного файла.
 *
 * @param storedFilename - Имя полного файла (`<uuid>.<ext>`).
 * @param variant - Требуемый вариант.
 * @param extension - Расширение варианта (варианты держатся в web-safe формате
 *   независимо от формата полного файла).
 * @returns Имя файла варианта.
 */
export function buildMediaVariantFilename(
    storedFilename: string,
    variant: TMediaVariant,
    extension: string
): string {
    const lastDotIndex = storedFilename.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? storedFilename.slice(0, lastDotIndex) : storedFilename;

    return `${baseName}${MEDIA_VARIANT_SUFFIXES[variant]}.${extension}`;
}

/**
 * Является ли имя файла (или S3-ключ) уменьшенным вариантом.
 *
 * Сверяется имя без расширения: суффикс стоит перед точкой, и проверка по
 * подстроке дала бы ложное срабатывание на честном имени вида
 * `hero-preview-final.webp`, загруженном пользователем.
 *
 * @param filenameOrKey - Имя файла или полный S3-ключ.
 * @returns true — файл является вариантом.
 */
export function isMediaVariantFilename(filenameOrKey: string): boolean {
    const filename = filenameOrKey.split('/').pop() ?? filenameOrKey;
    const lastDotIndex = filename.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;

    return Object.values(MEDIA_VARIANT_SUFFIXES).some((suffix) => baseName.endsWith(suffix));
}
