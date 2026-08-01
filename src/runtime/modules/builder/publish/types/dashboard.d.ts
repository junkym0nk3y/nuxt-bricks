/**
 * Pages Manager dashboard types.
 */

import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';

export type TPublishDashboardSection = 'pages' | 'templates';

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
    isDarkMode: boolean;
    /** Показывать кнопку «Выйти» (database-auth режим). */
    isLogoutVisible?: boolean;
}

export interface IPublishDashboardEmits {
    'update:searchQuery': [value: string];
    'select-section': [section: TPublishDashboardSection];
    'create-page': [];
    'open-media': [];
    'open-docs': [];
    'toggle-dark-mode': [];
    'toggle-locale': [];
    logout: [];
}

export interface IPublishDashboardNavProps {
    activeSection: TPublishDashboardSection;
    pagesCount: number;
    locale: string;
    isDarkMode: boolean;
    /** Показывать кнопку «Выйти» (database-auth режим). */
    isLogoutVisible?: boolean;
}

export interface IPublishDashboardNavEmits {
    'select-section': [section: TPublishDashboardSection];
    'open-media': [];
    'open-docs': [];
    'toggle-dark-mode': [];
    'toggle-locale': [];
    logout: [];
}

export interface IPublishPagesListProps {
    pages: TPublishedPageSummary[];
    activeFilter: TPublishPagesFilter;
    counts: IPublishPagesFilterCounts;
    isLoading: boolean;
    hasAnyPages: boolean;
    duplicatingPageId: string | null;
    selectedPageId: string | null;
}

export interface IPublishPagesListEmits {
    'update:activeFilter': [filter: TPublishPagesFilter];
    'create-page': [];
    'preview-thumbnail': [page: TPublishedPageSummary];
    select: [page: TPublishedPageSummary];
    edit: [page: TPublishedPageSummary];
    preview: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
}

export interface IPublishPagesListRowProps {
    page: TPublishedPageSummary;
    isDuplicating?: boolean;
    isSelected?: boolean;
}

export interface IPublishPagesListRowEmits {
    'preview-thumbnail': [page: TPublishedPageSummary];
    select: [page: TPublishedPageSummary];
    edit: [page: TPublishedPageSummary];
    preview: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
}

/**
 * Значения формы meta панели деталей. `layout`/`backgroundColor` не редактируются
 * панелью, но входят в значения — их требует общая схема валидации.
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
}

export interface IPublishPageFormOptions {
    onSaveSuccess: () => void;
    onSaveError: (message: string) => void;
}

export interface IPublishCreatePageFormOptions {
    onCreated: (pagename: string) => void;
}

export interface IPublishCreatePageModalProps {
    isOpen: boolean;
}

export interface IPublishCreatePageModalEmits {
    close: [];
    created: [pagename: string];
}

export interface IPublishDetailsPanelProps {
    page: TPublishedPageSummary;
    isDuplicating?: boolean;
}

export interface IPublishDetailsPanelEmits {
    close: [];
    edit: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
    'toggle-published': [page: TPublishedPageSummary, published: boolean];
    'open-media': [];
    'restore-version': [page: TPublishedPageSummary, version: IPageVersionSummary];
    notify: [message: string, variant: 'success' | 'error'];
}

/** Ошибки валидации формы meta по полям (vee-validate `errors`). */
export type TPublishFormErrors = Partial<Record<keyof IPublishPageFormValues, string>>;

export interface IPublishDetailsPanelSeoFieldsProps {
    title: string;
    pagename: string;
    description: string;
    keywords: string;
    errors: TPublishFormErrors;
    isSaving: boolean;
}

export interface IPublishDetailsPanelSeoFieldsEmits {
    'update:title': [value: string];
    'update:pagename': [value: string];
    'update:description': [value: string];
    'update:keywords': [value: string];
}

export interface IPublishDetailsPanelOgImageProps {
    socialImage: string;
    error?: string;
    isSaving: boolean;
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
    isSaving: boolean;
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

/**
 * Карточка галереи версий. `version === null` — текущее состояние страницы:
 * оно в списке версий не лежит (версия — снимок состояния, которое сохранение
 * вытеснило), но без него галерее не с чем сравнивать историю.
 * У текущей карточки нет действий: восстанавливать нечего, страница уже в этом
 * состоянии.
 */
export interface IPublishVersionCard {
    key: string;
    version: IPageVersionSummary | null;
    thumbnailUrl: string | null;
    date: string;
}
