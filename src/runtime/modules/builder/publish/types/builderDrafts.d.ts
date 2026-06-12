import type { BricksSchema } from '../../../common/types/brick';
import type { TPublishFormState } from '../../../common/types/bricks-api';

export interface IBuilderDraftSnapshot {
    schema: BricksSchema;
    formState: TPublishFormState;
}

export type TBuilderDraftMode = 'new' | 'edit';

export interface IBuilderDraftEntry {
    pagename: string;
    updatedAt: string;
    mode: TBuilderDraftMode;
    pageId?: number;
    savedSnapshot?: IBuilderDraftSnapshot;
    draftSnapshot: IBuilderDraftSnapshot;
}
