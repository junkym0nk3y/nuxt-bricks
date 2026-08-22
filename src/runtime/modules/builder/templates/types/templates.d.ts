/**
 * Types of the dashboard's "Templates" section: the state of the list, the forms and
 * the component contracts.
 *
 * The template itself is described in `common/types/templates`
 * (`TBricksTemplateSummary`, `IBricksTemplateRow`) — the shape of the endpoint response
 * is one for the server and the client, and a second declaration here would silently
 * diverge from the server one.
 */
import type { ComputedRef, Ref } from 'vue';
import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IBricksTemplatePageMeta,
    IBricksTemplateRow,
    TBricksTemplateSummary,
} from '../../../common/types/templates';
import type { TBricksToastVariant } from '../../../ui/feedback/types';

/**
 * The loading state of the section.
 *
 * There is no `unavailable` here, unlike the accounts: the template endpoints arrive
 * together with the module and are switched off neither by a flag nor by the mode of
 * authorization, so every refusal of a read is a temporary breakage — the kind a retry
 * button makes sense for.
 */
export type TTemplatesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The shared state of the section: the list of summaries and whether it has been read.
 *
 * It lives in `useState` — the rail counter is drawn in the first frame, together with
 * the section item itself — and that also isolates it per request: a module-global
 * `ref` would mix the lists of different requests inside one server process.
 */
export interface ITemplatesState {
    templates: TBricksTemplateSummary[];
    status: TTemplatesStatus;
}

/** The response of `GET /api/bricks/templates` */
export interface ITemplatesListResponse {
    templates: TBricksTemplateSummary[];
}

export interface IUseTemplatesDataReturn {
    templates: ComputedRef<TBricksTemplateSummary[]>;
    status: ComputedRef<TTemplatesStatus>;
    /**
     * The number of templates for the rail counter; `null` — the list has not been read
     * yet. Zero is a legitimate value here, unlike the accounts (there may be no
     * templates at all), which is why `null` is what tells a pending read from an empty
     * list.
     */
    templatesCount: ComputedRef<number | null>;
    /** The date the freshest template was created; `null` — the list is empty */
    lastSavedAt: ComputedRef<string | null>;
    /** Loads the list unless it has been read already; repeat calls await the first */
    ensureTemplates: () => Promise<void>;
    /** Forces a re-read of the list (a retry after a refusal) */
    refreshTemplates: () => Promise<void>;
    /** Puts a template into the list: a new one at the start, a known one in its place */
    upsertTemplate: (template: TBricksTemplateSummary) => void;
    /** Takes a template out of the list after a deletion */
    removeTemplate: (templateId: number) => void;
}

export interface IUseTemplatesListReturn {
    /** The templates that passed the search of the header of the dashboard */
    filteredTemplates: ComputedRef<TBricksTemplateSummary[]>;
    /** A search is set and matched nothing — the "nothing found" state */
    isSearchEmpty: ComputedRef<boolean>;
}

/**
 * The contents of the template to be, plus what describes its source in the modal.
 *
 * The source is assembled by the CALLER, not by the modal: there are two entry points
 * and they bring different things — a row of the list of pages hands over the schema
 * saved in the database along with a ready frame, the builder hands over the current
 * canvas with the edits that have not been saved. The modal is the same for both, and
 * it needs to know nothing about pages at all.
 */
export interface ITemplateSaveSource {
    /** The name proposed for the template (the title of the page) */
    suggestedName: string;
    /** The description proposed for the template (the description of the page) */
    suggestedDescription: string;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    /**
     * The frame of the page the server copies the preview of the template from. With
     * `null` the page has never been saved, and the template stays without a picture.
     */
    thumbnailSourceUrl: string | null;
    /** The caption of the source in the modal: what the page is recognized by */
    pageLabel: string;
    /** Address of the source page (`/blog/post`); empty — the page is not saved yet */
    pageAddressPath: string;
    /** The number of blocks in the schema — the card of the template shows the same */
    blocksCount: number;
    /**
     * The date the page was last saved; `null` — the page is not in the database yet,
     * and what travels into the template is only what is on the canvas right now.
     */
    pageUpdatedAt: string | null;
}

/** The values of the form of a template — the same for saving and for renaming */
export interface ITemplateFormValues {
    name: string;
    description: string;
}

export interface IUseTemplateSaveFormOptions {
    /** Source of the contents; `null` — the modal is closed, the form is not sent */
    source: Ref<ITemplateSaveSource | null> | ComputedRef<ITemplateSaveSource | null>;
    /** The template is saved: the toast and the closing are up to the caller */
    onSaved: (template: TBricksTemplateSummary) => void;
}

export interface IUseTemplateRenameFormOptions {
    /** The template whose caption is being edited; `null` — the modal is closed */
    template: Ref<TBricksTemplateSummary | null> | ComputedRef<TBricksTemplateSummary | null>;
    /** The caption is saved */
    onSaved: (template: TBricksTemplateSummary) => void;
}

export interface IUseTemplateActionsOptions {
    onNotify: (message: string, variant: TBricksToastVariant) => void;
}

export interface IUseTemplateActionsReturn {
    /** The template an operation is running over; `null` — all of them are free */
    pendingTemplateId: ComputedRef<number | null>;
    isDeleteConfirmOpen: ComputedRef<boolean>;
    deleteConfirmDescription: ComputedRef<string>;
    isDeleting: ComputedRef<boolean>;
    /** Asks for a confirmation of the deletion of a template */
    requestDelete: (template: TBricksTemplateSummary) => void;
    /** Closes the confirmation without deleting */
    closeDeleteConfirm: () => void;
    /** Deletes the template whose deletion has been confirmed */
    confirmDelete: () => Promise<void>;
}

export interface ITemplatesSectionProps {
    /** The query from the search field of the dashboard's shared header */
    searchQuery: string;
}

export interface ITemplatesSectionEmits {
    notify: [message: string, variant: TBricksToastVariant];
    /** An empty section leads to the list of pages: a template is born from a page */
    'go-to-pages': [];
    /** Create a page from a template — the host of the dashboard opens the form */
    'create-page': [template: TBricksTemplateSummary];
    /** Open the preview of a template in the lightbox (it lives on the dashboard) */
    'preview-thumbnail': [template: TBricksTemplateSummary];
}

export interface ITemplatesGridProps {
    templates: TBricksTemplateSummary[];
    isLoading: boolean;
    /** The list is empty by itself, not because of the search — two empty states */
    hasAnyTemplates: boolean;
    /** The search matched nothing */
    isSearchEmpty: boolean;
    /** The template an operation is running over: its card is busy */
    pendingTemplateId: number | null;
}

export interface ITemplatesGridEmits {
    'create-page': [template: TBricksTemplateSummary];
    'preview-thumbnail': [template: TBricksTemplateSummary];
    rename: [template: TBricksTemplateSummary];
    delete: [template: TBricksTemplateSummary];
    'go-to-pages': [];
}

export interface ITemplatesCardProps {
    template: TBricksTemplateSummary;
    /** An operation is running over the template — the actions of the card are shut */
    isPending?: boolean;
}

export interface ITemplatesCardEmits {
    'create-page': [template: TBricksTemplateSummary];
    'preview-thumbnail': [template: TBricksTemplateSummary];
    rename: [template: TBricksTemplateSummary];
    delete: [template: TBricksTemplateSummary];
}

export interface ITemplatesSaveModalProps {
    isOpen: boolean;
    /** Source of the contents; `null` — the modal has not been filled in yet */
    source: ITemplateSaveSource | null;
}

export interface ITemplatesSaveModalEmits {
    close: [];
    saved: [template: TBricksTemplateSummary];
}

export interface ITemplatesRenameModalProps {
    isOpen: boolean;
    template: TBricksTemplateSummary | null;
}

export interface ITemplatesRenameModalEmits {
    close: [];
    saved: [template: TBricksTemplateSummary];
}

export interface ITemplatesPickerListProps {
    templates: TBricksTemplateSummary[];
    isLoading: boolean;
    /** Key of the chosen template; `null` — none of them is chosen */
    selectedTemplateId: number | null;
}

export interface ITemplatesPickerListEmits {
    select: [template: TBricksTemplateSummary];
}

/**
 * The whole template as read by a point lookup: the contents and the styling a page is
 * created from.
 */
export type TTemplateContent = IBricksTemplateRow;
