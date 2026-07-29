/**
 * Toolbar component types
 */

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
}

export interface IToolbarEmits {
    openPagesManager: [];
    openMediaGallery: [];
    saveAsCopy: [];
    saveDraft: [];
    preview: [];
    clear: [];
}
