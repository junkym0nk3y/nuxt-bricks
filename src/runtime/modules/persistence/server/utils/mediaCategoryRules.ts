/**
 * Правила продукта для категорий медиа: что существует и чем это проверяется.
 *
 * Живёт отдельно от `mediaPayloadValidation.ts` потому, что эти проверки
 * обращаются к хранилищу, а тот файл — чистая валидация DTO без зависимостей.
 * Зависимость передаётся узким Pick-контрактом, чтобы правила тестировались
 * юнитами без реального Postgres.
 */
import type { TMediaCategoryStorage } from '../../types/adapters';
import { BricksUnknownMediaCategoryError } from './storageErrors';

/**
 * Проверяет, что категория существует в медиатеке.
 *
 * Проверка серверная и обязательная: прежде сервер принимал любую строку, и
 * опечатка в категории создавала «призрачный» фильтр, под который не попадал
 * ни один файл, кроме этого. Гонку она не закрывает — категорию могут удалить
 * между проверкой и записью, и тогда отказ приходит от FK базы, — но экономит
 * самую дорогую часть загрузки (оптимизация изображения и заливка в бакет) на
 * заведомо непригодном вводе.
 *
 * Ошибка доменная, а не готовая HTTP: правило хранилища не обязано знать про
 * статусы, а ранний отказ и отказ от FK обязаны выглядеть для клиента одинаково
 * — маппит их одна точка (`toMediaHttpError`).
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

    throw new BricksUnknownMediaCategoryError(slug);
}
