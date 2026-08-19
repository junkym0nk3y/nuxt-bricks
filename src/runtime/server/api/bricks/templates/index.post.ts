import { defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toTemplateHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    BricksStorageWriteRejectedError,
    BricksTemplateNameConflictError,
} from '../../../../modules/persistence/server/utils/storageErrors';
import { validateCreateTemplatePayload } from '../../../../modules/persistence/server/utils/templatePayloadValidation';
import {
    copyThumbnailForTemplate,
    discardTemplateThumbnail,
} from '../../../../modules/persistence/server/utils/templateThumbnails';

/**
 * Отвергнута ли запись шаблона ГАРАНТИРОВАННО — только тогда скопированный файл
 * превью можно удалить.
 *
 * Занятое имя означает нарушение unique-ограничения, то есть строки нет;
 * маркер отвергнутой записи адаптер ставит там, где знает то же про свою
 * операцию. Всё остальное (обрыв соединения, таймаут, 5xx внешнего backend'а) —
 * неизвестный исход: ответ мог потеряться уже после коммита, и удаление файла
 * оставило бы созданный шаблон с битой картинкой.
 *
 * @param error - Пойманная ошибка записи.
 * @returns Можно ли убирать скопированный файл.
 */
function isRejectedTemplateWrite(error: unknown): boolean {
    return (
        error instanceof BricksTemplateNameConflictError ||
        error instanceof BricksStorageWriteRejectedError
    );
}

/**
 * POST /api/bricks/templates — сохраняет страницу как шаблон.
 *
 * Тело несёт содержимое и оформление, а не идентификатор страницы: точек входа
 * две, и приносят они разное. Строка списка страниц отправляет сохранённую схему
 * из базы, билдер — то, что сейчас на канвасе, вместе с несохранёнными правками.
 * Ручка, читающая страницу сама, второй сценарий обслужить не смогла бы вовсе.
 *
 * Превью копируется в СВОЙ файл шаблона (`copyThumbnailForTemplate`), а ссылка
 * на кадр страницы не сохраняется: кадры страницы живут по её keep-list'у, и
 * первое же сохранение оставило бы шаблон с битой картинкой. Копия best-effort —
 * шаблон без превью законен, карточка рисует плейсхолдер.
 *
 * Занятое имя — 409 `TEMPLATE_NAME_CONFLICT`: форма подставляет подсказку под
 * поле имени, а не показывает англоязычный текст статуса.
 */
export default defineEventHandler(async (event) => {
    const publishAdapter = useBricksPublishAdapter();
    let thumbnailUrl: string | null = null;

    try {
        const payload = validateCreateTemplatePayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        thumbnailUrl = await copyThumbnailForTemplate(publishAdapter, payload.thumbnailSourceUrl);

        return await useBricksStorageAdapter().createTemplate({
            name: payload.name,
            description: payload.description,
            schema: payload.schema,
            pageMeta: payload.pageMeta,
            thumbnailUrl,
        });
    } catch (error: unknown) {
        // Ожидание уборки обязательно (не fire-and-forget): ответ ручки
        // завершает запрос, а в serverless-окружении процесс может закончиться
        // вместе с ним — начатое удаление не доехало бы до хранилища
        if (isRejectedTemplateWrite(error)) {
            await discardTemplateThumbnail(publishAdapter, thumbnailUrl);
        } else if (thumbnailUrl) {
            console.warn(
                '[Templates] Template write outcome is unknown, keeping the copied thumbnail:',
                thumbnailUrl
            );
        }

        toTemplateHttpError(error, 'Failed to save template');
    }
});
