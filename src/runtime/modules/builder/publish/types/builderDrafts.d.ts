import type { IBricksSchema } from '../../../common/types/brick';
import type { TPublishFormState } from '../../../common/types/bricks-api';

export interface IBuilderDraftSnapshot {
    schema: IBricksSchema;
    formState: TPublishFormState;
}

/**
 * The owner of a draft inside the key of the storage: `database:<id>` for an account
 * of the database mode, `basic` for the single identity of Basic Auth.
 *
 * Without it the key was the address alone, that is one draft per browser: a second
 * editor on a shared machine was offered the unfinished work of the first, and their
 * autosave smeared over it. The identity comes from the same place as the role, and
 * the id rather than the name: two editors carry one role, and a name can be changed.
 */
export type TBuilderDraftPrincipal = 'basic' | `database:${number}`;

export type TBuilderDraftMode = 'new' | 'edit';

/**
 * The outcome of moving a draft to a new key.
 *
 * - `migrated` — the record was moved;
 * - `nothing-to-migrate` — there is nothing to move (the key is the same, or there
 *   is no draft);
 * - `target-taken` — another draft lies under the target key and was left alone;
 * - `storage-unavailable` — the storage refused, the outcome of the move is unknown.
 *
 * The last two are told apart for a reason: a taken key is an ordinary situation
 * (a session owns its key), while a refusal of the storage means the draft may
 * have stayed under the previous slug and may come back to life later.
 */
export type TBuilderDraftMigration =
    | 'migrated'
    | 'nothing-to-migrate'
    | 'target-taken'
    | 'storage-unavailable';

export interface IBuilderDraftEntry {
    pagename: string;
    /**
     * The prefix of the address of the page the draft belongs to (`null` — no
     * prefix). Together with `pagename` it gives the address: that is also the key
     * of the record, and by it a session tells its own draft from another one.
     */
    urlPrefix: string | null;
    updatedAt: string;
    mode: TBuilderDraftMode;
    pageId?: number;
    savedSnapshot?: IBuilderDraftSnapshot;
    draftSnapshot: IBuilderDraftSnapshot;
}
