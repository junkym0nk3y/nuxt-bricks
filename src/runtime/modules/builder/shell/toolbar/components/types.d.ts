/**
 * Toolbar component types
 */

import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';

export interface IToolbarProps {
    isEditingExistingPage: boolean;
    isSubmittingPublish: boolean;
    hasSelectedComponent: boolean;
    isPublishSettingsComplete: boolean;
    /**
     * Сессия открыта до согласованного состояния. Пока нет — заблокированы
     * сохранение, превью и медиагалерея: сохранять нельзя, потому что
     * `startEditingPage` уже заполнил форму и `editingPageId`, а схемы на канвасе
     * ещё нет — запись затёрла бы страницу в БД пустым холстом; выбор картинки в
     * галерее уехал бы в `socialImage` и потерялся вместе с остальными правками
     * до готовности; превью показало бы гибрид старого канваса и новой формы
     *.
     */
    isSessionReady: boolean;
    sidebarOffset?: string;
    pageTitle?: string;
    isPublished?: boolean;
    /** Сохранённые страницы для селектора в заголовке. */
    pages?: TPublishedPageSummary[];
    /** Идентичность открытой страницы: у неё в списке стоит отметка. */
    currentPageId?: string | number | null;
    /** Список уже приезжал с сервера — пустота настоящая, а не «ещё не загрузили». */
    isPagesLoaded?: boolean;
    isPagesLoading?: boolean;
    /** Идёт запись: создание новой страницы на это время закрыто. */
    isSubmittingPage?: boolean;
}

export interface IToolbarEmits {
    openPagesManager: [];
    openMediaGallery: [];
    saveAsCopy: [];
    saveDraft: [];
    preview: [];
    clear: [];
    openPageSelector: [];
    selectPage: [page: TPublishedPageSummary];
    createPage: [];
    /** Меню профиля в углу: открыть модалку профиля. */
    openProfile: [];
    /** Меню профиля в углу: выйти из сессии. */
    logout: [];
}

/**
 * Пропсы селектора страниц в заголовке тулбара.
 */
export interface IToolbarPageSelectorProps {
    /** Заголовок открытой страницы — то, что видно на триггере. */
    pageTitle?: string;
    pages: TPublishedPageSummary[];
    currentPageId?: string | number | null;
    /** Полный список уже получен: пустой результат можно показывать честно. */
    isLoaded?: boolean;
    isLoading?: boolean;
    disabled?: boolean;
    isCreateDisabled?: boolean;
}

export interface IToolbarPageSelectorEmits {
    /** Попап открыли — момент ленивой догрузки и освежения списка. */
    open: [];
    select: [page: TPublishedPageSummary];
    allPages: [];
    createPage: [];
}

/**
 * Пустое состояние списка страниц: ключи i18n для заголовка и пояснения.
 * Разметка у всех пустых состояний одна, расходятся только тексты.
 */
export interface IToolbarPageSelectorEmptyState {
    title: string;
    description: string;
}
