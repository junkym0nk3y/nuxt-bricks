/**
 * Приведение полной строки шаблона к сводке списка.
 *
 * Нужно потому, что ручки записи (POST/PATCH) отдают шаблон ЦЕЛИКОМ — со схемой
 * и оформлением, — а список держит сводки: положить в него полную строку значило
 * бы хранить схему в состоянии приложения ради одной карточки и разойтись формой
 * с тем, что приедет следующим чтением.
 *
 * Число блоков считается здесь, а не берётся из ответа: в полной строке его нет
 * (сводку с ним собирает SQL), зато есть сама схема — источник того же числа.
 */
import type { IBricksTemplateRow, TBricksTemplateSummary } from '../../../common/types/templates';

/**
 * Собирает сводку шаблона из полной строки.
 *
 * @param template - Полная строка шаблона из ответа ручки записи.
 * @returns Сводка для списка раздела.
 */
export function toTemplateSummary(template: IBricksTemplateRow): TBricksTemplateSummary {
    return {
        id: template.id,
        name: template.name,
        description: template.description,
        thumbnailUrl: template.thumbnailUrl,
        blocksCount: template.schema?.components?.length ?? 0,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
    };
}
