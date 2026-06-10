import type { LandingSchema } from '../../common/types/landing';
import type { TPublishFormState } from '../../common/types/landing-api';

export interface IBuilderDraftSnapshot {
    schema: LandingSchema;
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
