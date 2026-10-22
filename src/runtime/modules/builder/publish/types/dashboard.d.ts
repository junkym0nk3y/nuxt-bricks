/**
 * Pages Manager dashboard types.
 */

import type { IBricksResolvedDevice, TBricksPageDeviceSet } from '../../../common/types/devices';
import type { TBricksModalLayer } from '../../../ui/base/modal/types';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksComponent, IBricksSchema } from '../../../common/types/brick';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IParsedSchemaFile } from './composables';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ComputedRef, Ref } from 'vue';

export type TPublishDashboardSection = 'pages' | 'templates' | 'users' | 'media';

// #region usePublishDashboardSections
/**
 * Options of `usePublishDashboardSections`.
 */
export interface IUsePublishDashboardSectionsOptions {
    /**
     * The search string of the pages. Arrives from the outside instead of being
     * started here: it is owned by `usePublishDashboard` — the same place the
     * filters and the filtered list live.
     */
    pagesSearchQuery: Ref<string>;
    /** Whether the accounts section is available: the rights plus answering endpoints */
    isUsersSectionVisible: ComputedRef<boolean>;
    /** The media library was left: close the session of working with it */
    onLeaveMedia: () => void;
    /** The media library was entered: send for the file list unless a snapshot is in */
    onEnterMedia: () => void;
}

/**
 * The return value of `usePublishDashboardSections`.
 */
export interface IUsePublishDashboardSectionsReturn {
    activeSection: Ref<TPublishDashboardSection>;
    usersSearchQuery: Ref<string>;
    templatesSearchQuery: Ref<string>;
    mediaSearchQuery: Ref<string>;
    /** The query of the open section — what the field in the header shows */
    activeSearchQuery: ComputedRef<string>;
    selectSection: (section: TPublishDashboardSection) => void;
    setSearchQuery: (value: string) => void;
}
// #endregion

export type TPublishPagesFilter = 'all' | 'published' | 'drafts';

export interface IPublishPagesFilterCounts {
    all: number;
    published: number;
    drafts: number;
}

export interface IPublishDashboardProps {
    activeSection: TPublishDashboardSection;
    searchQuery: string;
    pagesCount: number;
    /**
     * Counts for the rail, `null` while the list has not been read yet. Why the
     * three of them are nullable at all and zero is not enough is decided by the
     * rail itself — see `sectionCounters` in `BuilderPublishDashboardNav`.
     */
    templatesCount: number | null;
    usersCount: number | null;
    mediaCount: number | null;
    /**
     * Whether to show the "Users" section. It adds up out of two different things
     * — the right to manage accounts and whether the endpoints answer at all (in
     * an installation without them there is no section) — which is why the host
     * decides rather than the rail itself: the right the rail would read on its
     * own, but a loading state is not a right.
     */
    isUsersSectionVisible: boolean;
    isDarkMode: boolean;
}

export interface IPublishDashboardEmits {
    'update:searchQuery': [value: string];
    'select-section': [section: TPublishDashboardSection];
    'create-page': [];
    /** The primary button of the header in the "Users" section */
    'create-user': [];
    'open-docs': [];
    'toggle-dark-mode': [];
    'toggle-locale': [];
    /** The profile menu in the corner of the header: open the profile modal */
    'open-profile': [];
    logout: [];
}

export interface IPublishDashboardNavProps {
    activeSection: TPublishDashboardSection;
    pagesCount: number;
    /** Counts; `null` — not read yet, and the counter is not drawn */
    templatesCount: number | null;
    usersCount: number | null;
    mediaCount: number | null;
    /** The "Users" section is available: the rights are there and the endpoints answer */
    isUsersSectionVisible: boolean;
    locale: string;
    isDarkMode: boolean;
}

export interface IPublishDashboardNavEmits {
    'select-section': [section: TPublishDashboardSection];
    'open-docs': [];
    'toggle-dark-mode': [];
    'toggle-locale': [];
}

/** An item of the dashboard rail: which section it opens, its glyph and its caption */
export interface IPublishDashboardNavSection {
    key: TPublishDashboardSection;
    icon: string;
    /** The locale key of the caption — the rail translates it itself */
    labelKey: string;
}

export interface IPublishPagesListProps {
    pages: TPublishedPageSummary[];
    activeFilter: TPublishPagesFilter;
    counts: IPublishPagesFilterCounts;
    isLoading: boolean;
    /**
     * A re-read on request is running. Apart from `isLoading`: the rows stay on
     * screen and only the control reports the waiting — a person asked whether
     * anything had changed, not to have the list replaced by a spinner.
     */
    isRefreshing: boolean;
    hasAnyPages: boolean;
    /** The pages being copied right now; the row asks about itself */
    duplicatingPageIds: Set<string>;
    /**
     * The page whose schema is being read to save a template; `null` — every row
     * is free. The row waits meanwhile: a list summary carries no schema, and
     * until it is read there is no template form to show.
     */
    templateSourcePageId: string | null;
    selectedPageId: string | null;
}

export interface IPublishPagesListEmits {
    'update:activeFilter': [filter: TPublishPagesFilter];
    'create-page': [];
    /** Re-read the list: pages created by another editor are picked up by it */
    refresh: [];
    'preview-thumbnail': [page: TPublishedPageSummary];
    select: [page: TPublishedPageSummary];
    edit: [page: TPublishedPageSummary];
    preview: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    /** Save the page as a template: the host reads the schema and opens the form */
    'save-as-template': [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
}

export interface IPublishPagesListRowProps {
    page: TPublishedPageSummary;
    isDuplicating?: boolean;
    /** A template is being prepared out of this page (its schema is being read) */
    isPreparingTemplate?: boolean;
    isSelected?: boolean;
}

export interface IPublishPagesListRowEmits {
    'preview-thumbnail': [page: TPublishedPageSummary];
    select: [page: TPublishedPageSummary];
    edit: [page: TPublishedPageSummary];
    preview: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    'save-as-template': [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
}

/**
 * The values of the meta form of the details panel. `layout`/`backgroundColor` are
 * not edited by the panel but are part of the values — the shared validation
 * schema demands them.
 */
export interface IPublishPageFormValues {
    pagename: string;
    title: string;
    description: string;
    keywords: string;
    socialImage: string;
    urlPrefix: string;
    subdomain: string;
    layout: string;
    backgroundColor: string;
    headCode: string;
    bodyEndCode: string;
    noindex: boolean;
}

export interface IPublishPageFormOptions {
    onSaveSuccess: () => void;
    onSaveError: (message: string) => void;
}

export interface IPublishCreatePageFormOptions {
    /**
     * The created page, as an address rather than a name alone: the caller takes
     * the person into its editor, and the editor address includes the prefix. By
     * the name alone the navigation would open `<builderPrefix>/<pagename>` —
     * either another page carrying that name, or the empty form of a new one.
     */
    onCreated: (address: IBricksPageAddress) => void;
    /**
     * Hands over the schema of the new page: a blank canvas, or a parsed JSON file
     * run through the image resolver. `null` — the creation was canceled (the
     * resolver was closed) and the POST does not go out.
     */
    resolveSchema: () => Promise<IBricksSchema | null>;
    /**
     * Hands over the device set of the new page: the edit made in the "Devices"
     * group, or the set out of an imported envelope. `null` — the page inherits
     * the set of the project.
     *
     * A callback of its own rather than a field of the form: the set is edited by
     * a modal of its own, and its state lives next to that modal rather than in
     * the validation schema of the meta fields.
     */
    resolveViewportConfig?: () => TBricksPageDeviceSet | null;
    /**
     * Hands over the appearance of the new page (the layout and the background) —
     * what the chosen template fills the form with. `null` — the default
     * appearance.
     *
     * Apart from the device set: the set is edited by a modal of its own and lives
     * in the form no matter where the content comes from, while the layout and the
     * background arrive from a template only and are not edited in the form at all.
     */
    resolveAppearance?: () => IPublishCreatePageAppearance | null;
}

/** The appearance of a page arriving from a template into the creation form */
export interface IPublishCreatePageAppearance {
    layout: string | null;
    backgroundColor: string | null;
}

/**
 * Running a schema through the image resolver of the dashboard. `null` — the
 * import was canceled.
 *
 * As a function prop rather than as an instance of the resolver inside the modal:
 * there is one resolver for the whole dashboard, otherwise two of its modals would
 * open on top of each other and edit one state of the media library in parallel.
 */
export type TResolveImportedSchema = (schema: IBricksSchema) => Promise<IBricksSchema | null>;

export interface IPublishCreatePageModalProps {
    isOpen: boolean;
    /**
     * The template picked as the source in advance (a template card opened the
     * form); `null` — the source is picked in the form itself. Optional: the
     * builder opens the same form with no templates section next to it, so it has
     * nothing to pre-pick with.
     */
    initialTemplate?: TBricksTemplateSummary | null;
    resolveImportedSchema: TResolveImportedSchema;
}

export interface IPublishCreatePageModalEmits {
    close: [];
    created: [address: IBricksPageAddress];
}

export interface IPublishDetailsPanelProps {
    page: TPublishedPageSummary;
    isDuplicating?: boolean;
    /**
     * The publication flag of this page is being written. The switch is closed off
     * for the duration: the guard in the controller keeps the second PATCH from
     * going out anyway, but without `disabled` the switch would answer a click by
     * doing nothing visible at all.
     */
    isTogglingPublished?: boolean;
    /** A schema import is running (its coordinator lives in the dashboard controller) */
    isImporting?: boolean;
}

export interface IPublishDetailsPanelEmits {
    close: [];
    edit: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
    'toggle-published': [page: TPublishedPageSummary, published: boolean];
    'open-media': [];
    'restore-version': [page: TPublishedPageSummary, version: IPageVersionSummary];
    /**
     * A schema file was picked and parsed; the confirmation and the write belong to
     * the controller.
     */
    'import-schema-file': [page: TPublishedPageSummary, file: IParsedSchemaFile];
    notify: [message: string, variant: 'success' | 'error'];
}

/** Per-field validation errors of the meta form (the vee-validate `errors`) */
export type TPublishFormErrors = Partial<Record<keyof IPublishPageFormValues, string>>;

export interface IPublishDetailsPanelOgImageProps {
    socialImage: string;
    error?: string;
    /**
     * The control over picking an image is closed. There are two reasons and they
     * are of different natures: a save is running (temporary) and the role has no
     * right to edit (permanent), which is why the prop is named after the
     * consequence rather than after one of the reasons: the name `isSaving` would
     * promise a temporary state, and the spinner natural for it would fall to a
     * viewer forever.
     */
    isDisabled: boolean;
}

export interface IPublishDetailsPanelOgImageEmits {
    'open-media': [];
    clear: [];
}

export interface IPublishDetailsPanelRoutingProps {
    page: TPublishedPageSummary;
    urlPrefix: string;
    subdomain: string;
    errors: TPublishFormErrors;
    /** The fields are closed for input: a save is running, or the role may not edit */
    isDisabled: boolean;
}

export interface IPublishDetailsPanelRoutingEmits {
    'update:urlPrefix': [value: string];
    'update:subdomain': [value: string];
}

export interface IPublishDetailsPanelVersionsProps {
    page: TPublishedPageSummary;
}

export interface IPublishDetailsPanelVersionsEmits {
    restore: [version: IPageVersionSummary];
    notify: [message: string, variant: 'success' | 'error'];
}

export interface IPublishDetailsPanelSchemaProps {
    page: TPublishedPageSummary;
    /** A schema import of this page is running (the dashboard coordinator owns it) */
    isImporting: boolean;
    /** The meta form is being saved — a schema write is not started in that window */
    isSaving: boolean;
}

export interface IPublishDetailsPanelSchemaEmits {
    /**
     * The file is parsed and ready to be applied; the controller asks for the
     * confirmation. The page travels as a snapshot taken at the moment the file
     * was picked rather than being read out of a prop by the receiver: reading a
     * file outlives a change of the selected page.
     */
    'import-file': [page: TPublishedPageSummary, file: IParsedSchemaFile];
}

/** The source of the content of a new page in the creation modal */
export type TPublishCreatePageSource = 'blank' | 'template' | 'file';

export interface IPublishCreatePageStartOptionsProps {
    source: TPublishCreatePageSource;
    /** The parsed JSON file picked as the source (waiting for the submit) */
    selectedFile: IParsedSchemaFile | null;
    /** The template picked as the source; `null` — none is picked */
    selectedTemplate: TBricksTemplateSummary | null;
    error: string;
    isSubmitting: boolean;
}

export interface IPublishCreatePageStartOptionsEmits {
    'select-blank': [];
    'pick-file': [];
    'clear-file': [];
    /** A click on the "From a template" card: open the template picker */
    'pick-template': [];
    /** Drop the picked template — the source goes back to a blank page */
    'clear-template': [];
}

/**
 * A card of the version gallery. `version === null` is the current state of the
 * page: it does not lie in the list of versions (a version is a snapshot of the
 * state a save displaced), but without it the gallery has nothing to compare the
 * history against. The current card carries no actions: there is nothing to
 * restore, the page is in that state already.
 */
export interface IPublishVersionCard {
    key: string;
    version: IPageVersionSummary | null;
    thumbnailUrl: string | null;
    date: string;
}

/**
 * Props of the "Page devices" modal.
 *
 * The set arrives as a value instead of being read out of the store: the modal
 * opens both from the settings of a saved page and from the form of a page not
 * created yet — and the second one has no store holding its set at all.
 */
export interface IPublishDevicesModalProps {
    isOpen: boolean;
    /** The set of the page; `null` — inherits the set of the project */
    viewportConfig: TBricksPageDeviceSet | null;
    /** The resolved set of the project — what the switch shows when turned off */
    projectDevices: IBricksResolvedDevice[];
    /** The key of the device open on the canvas (the highlight of the scale segment) */
    activeDeviceKey: string;
    /**
     * Components of the schema: the number of the overrides lost, shown in the
     * removal confirmation, is counted over them. For a page not created yet these
     * are the components of the picked source — an imported file or a template — and
     * the list is empty only for a blank canvas.
     */
    schemaComponents: IBricksComponent[];
    /** `nested` — the modal is open on top of another one (the page creation form) */
    layer?: TBricksModalLayer;
}

export interface IPublishDevicesModalEmits {
    close: [];
    /**
     * The set is confirmed: it travels into the state of the host — the editor or the
     * creation form — rather than to the server.
     */
    save: [viewportConfig: TBricksPageDeviceSet | null];
}
