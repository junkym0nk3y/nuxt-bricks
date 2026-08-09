/**
 * Подписи категорий медиа.
 *
 * Подпись — то, что ввёл пользователь: предустановленных категорий нет, а
 * переводить пользовательский ввод нечем. Утилита остаётся ради поиска по
 * slug'у — он приходит из `bricks_media.category`, а показывать нужно подпись.
 */

// Types
import type { IMediaCategory } from '../../../common/types/media';

/**
 * Ищет подпись категории по slug'у; для неизвестного slug'а возвращает сам slug.
 *
 * Slug вместо «—»: категория могла быть удалена в другой сессии, и показать её
 * машинное имя честнее, чем скрыть факт рассинхрона.
 *
 * @param slug - Slug категории.
 * @param categories - Известные категории.
 * @returns Подпись для показа пользователю.
 */
export function resolveMediaCategoryLabelBySlug(
    slug: string,
    categories: IMediaCategory[]
): string {
    const category = categories.find((item) => item.slug === slug);

    return category ? category.label : slug;
}
