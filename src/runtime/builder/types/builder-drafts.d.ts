import type { LandingSchema } from '../../types/landing';
import type { TPublishFormState } from '../../types/landing-api';

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
