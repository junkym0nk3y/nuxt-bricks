/**
 * Шаблоны страниц: строка хранилища, сводка списка и payload'ы записи.
 *
 * Живут рядом с типами страниц (`bricks-api.d.ts`), а не в домене билдера:
 * контракт один на три стороны — Postgres-адаптер, Nitro-ручки
 * `/api/bricks/templates/**` и раздел «Шаблоны» дашборда.
 */
import type { IBricksSchema } from './brick';
import type { TBricksPageDeviceSet } from './devices';

/**
 * Оформление страницы, уезжающее в шаблон вместе со схемой.
 *
 * Ровно три поля: раскладка, фон и набор устройств. Адрес, SEO и статус
 * публикации в шаблон не попадают — две страницы из одного шаблона иначе
 * родились бы с одним адресом, то есть отказом уникального индекса.
 *
 * `viewportConfig: null` — страница-источник наследовала набор проекта, и
 * созданная из шаблона унаследует его же (то есть ТЕКУЩИЙ набор проекта, а не
 * тот, что действовал на момент сохранения шаблона).
 */
export interface IBricksTemplatePageMeta {
    layout: string | null;
    backgroundColor: string | null;
    viewportConfig: TBricksPageDeviceSet | null;
}

/**
 * Полная строка шаблона (`bricks_templates`) — со схемой и оформлением.
 * Отдаётся только point-lookup'ом `GET /api/bricks/templates/:id`.
 */
export interface IBricksTemplateRow {
    id: number;
    name: string;
    description: string | null;
    /** Свой файл превью шаблона; `null` — снимка нет, UI рисует плейсхолдер. */
    thumbnailUrl: string | null;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    createdAt: string;
    updatedAt: string;
}

/**
 * Сводка шаблона для сетки раздела и выбора источника новой страницы: без
 * `schema` и `pageMeta`, зато с числом блоков.
 *
 * Число блоков считает хранилище (`jsonb_array_length`), а не клиент: схема в
 * сводку не входит, а карточка обязана показать объём шаблона — иначе выбирать
 * пришлось бы по одному имени.
 */
export type TBricksTemplateSummary = Omit<IBricksTemplateRow, 'schema' | 'pageMeta'> & {
    blocksCount: number;
};

/**
 * Данные создания шаблона на уровне хранилища.
 *
 * `thumbnailUrl` здесь — УЖЕ собственный файл шаблона: копию кадра страницы
 * делает ручка до вызова адаптера (`copyThumbnailForTemplate`), потому что
 * ссылка на кадр страницы не переживает её следующего сохранения.
 */
export interface ICreateTemplatePayload {
    name: string;
    description: string | null;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    thumbnailUrl?: string | null;
}

/**
 * Частичное обновление шаблона: правится только подпись (имя и описание).
 *
 * Содержимое шаблона не обновляется намеренно: шаблон — отпечаток момента, и
 * «обновить его текущей страницей» означало бы вторую сущность (источник
 * наследования) с версиями и разрешением конфликтов.
 */
export interface IUpdateTemplatePayload {
    name?: string;
    description?: string | null;
}
