import type { IBricksSchema } from '../../../common/types/brick';
import type { TPublishFormState } from '../../../common/types/bricks-api';

export interface IBuilderDraftSnapshot {
    schema: IBricksSchema;
    formState: TPublishFormState;
}

export type TBuilderDraftMode = 'new' | 'edit';

/**
 * Исход переноса черновика на новый ключ.
 *
 * - `migrated` — запись перенесена;
 * - `nothing-to-migrate` — переносить нечего (ключ тот же или черновика нет);
 * - `target-taken` — под целевым ключом лежит чужой черновик, он не тронут;
 * - `storage-unavailable` — хранилище отказало, исход переноса неизвестен.
 *
 * Последние два различаются не для красоты: занятый ключ — обычная ситуация
 * (сессия владеет своим ключом), а отказ хранилища означает, что черновик мог
 * остаться под прежним слагом и позже воскреснуть.
 */
export type TBuilderDraftMigration =
    | 'migrated'
    | 'nothing-to-migrate'
    | 'target-taken'
    | 'storage-unavailable';

export interface IBuilderDraftEntry {
    pagename: string;
    /**
     * Префикс адреса страницы, которой принадлежит черновик (`null` — без
     * префикса). Вместе с `pagename` даёт адрес: он же ключ записи, и по нему
     * сессия отличает свой черновик от чужого.
     */
    urlPrefix: string | null;
    updatedAt: string;
    mode: TBuilderDraftMode;
    pageId?: number;
    savedSnapshot?: IBuilderDraftSnapshot;
    draftSnapshot: IBuilderDraftSnapshot;
}
