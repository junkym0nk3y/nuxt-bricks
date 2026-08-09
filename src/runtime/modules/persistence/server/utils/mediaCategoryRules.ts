/**
 * Правила продукта для категорий медиа: что существует и чем это проверяется.
 *
 * Живёт отдельно от `mediaPayloadValidation.ts` потому, что эти проверки
 * обращаются к хранилищу, а тот файл — чистая валидация DTO без зависимостей.
 * Зависимость передаётся узким Pick-контрактом, чтобы правила тестировались
 * юнитами без реального Postgres.
 */
import { createError } from 'h3';
import type { TMediaCategoryStorage } from '../../types/adapters';

/**
 * Проверяет, что категория существует в медиатеке.
 *
 * Проверка серверная и обязательная: прежде сервер принимал любую строку, и
 * опечатка в категории создавала «призрачный» фильтр, под который не попадал
 * ни один файл, кроме этого. FK базы отклонит её и сам, но 23503 превратился бы
 * в 500 вместо внятного 400.
 *
 * @param storage - Хранилище с доступом к списку категорий.
 * @param slug - Проверяемый slug.
 */
export async function assertKnownMediaCategory(
    storage: TMediaCategoryStorage,
    slug: string
): Promise<void> {
    const categories = await storage.listMediaCategories();

    if (categories.some((category) => category.slug === slug)) {
        return;
    }

    throw createError({
        statusCode: 400,
        message: `Unknown media category: ${slug}`,
    });
}
