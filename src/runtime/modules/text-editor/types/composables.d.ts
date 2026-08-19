/**
 * Типы композаблов домена text-editor.
 */

import type { Editor } from '@tiptap/vue-3';
import type { Component, ComputedRef, MaybeRefOrGetter, Ref, ShallowRef } from 'vue';

import type { TInlineEditingPropType } from '../../common/types/inlineEditing';
import type { IToolbarGroup, IToolbarStateRefs } from '../../ui/inputs/textEditorToolbar';

// #region useInlineEditor
/**
 * Опции composable useInlineEditor: редактируемое свойство компонента схемы.
 */
export interface IUseInlineEditorOptions {
    componentId: string;
    propName: string;
    propType: TInlineEditingPropType;
}

/**
 * Возвращаемое значение composable useInlineEditor.
 */
export interface IUseInlineEditorReturn {
    editor: ShallowRef<Editor | null>;
    editorContent: ShallowRef<Component | null>;
    isActive: ComputedRef<boolean>;
    initEditor: () => Promise<void>;
    saveAndStop: () => void;
    destroy: () => void;
}
// #endregion

// #region useTextEditorArea
/**
 * Возвращаемое значение composable useTextEditorArea.
 */
export interface ITextEditorArea {
    /** Текущее значение контента (HTML). */
    innerValue: Ref<string>;
    /** true после mount — редактор существует только на клиенте. */
    isClient: Ref<boolean>;
    /** Ошибка загрузки rich-редактора (fallback на textarea). */
    loadingError: Ref<unknown | null>;
    /** Режим просмотра HTML-кода вместо визуального редактора. */
    isCodeView: Ref<boolean>;
    /** Тёмный фон области ввода. */
    isDarkEditorBackground: Ref<boolean>;
    /** Экземпляр TipTap-редактора (null до инициализации). */
    editor: ShallowRef<Editor | null>;
    /** Компонент EditorContent из @tiptap/vue-3 (lazy). */
    EditorContentComponent: ShallowRef<Component | null>;
    /** Конфигурация групп тулбара. */
    toolbarGroups: ComputedRef<IToolbarGroup[]>;
    /** Переключает визуальный режим ↔ код. */
    toggleCodeView: () => void;
    /** Переключает фон редактора светлый ↔ тёмный. */
    toggleEditorBackground: () => void;
    /** Обновляет значение и эмитит update:value. */
    handleContentUpdate: (content: string) => void;
    /** Обрабатывает ввод в fallback textarea. */
    handleTextareaInput: (event: Event) => void;
    /** Обрабатывает обновление значения из модального редактора. */
    handleModalUpdate: (value: string) => void;
    /** Запрашивает медиа из MediaGallery и вставляет в редактор. */
    handleRequestImage: () => void;
    /** Состояние и операции модалки ссылки для этого редактора. */
    link: ITextEditorLink;
}
// #endregion

// #region useToolbarStateSync
/**
 * Опции composable useToolbarStateSync.
 */
export interface IToolbarStateSyncOptions {
    /** Дополнительное условие показа toolbar (false → пустой список групп). */
    isEnabled?: MaybeRefOrGetter<boolean>;
    /** Открывает модалку ссылки; без него кнопки ссылки в тулбаре нет. */
    onRequestLink?: () => void;
}

/**
 * Возвращаемое значение composable useToolbarStateSync.
 */
export interface IToolbarStateSync {
    /** Refs текущих значений шрифта/цвета/межстрочных для selects тулбара. */
    toolbarState: IToolbarStateRefs;
    /** Счётчик транзакций — реактивная зависимость для пересчёта toolbarGroups. */
    editorTransactionCount: Ref<number>;
    /** Конфигурация групп тулбара (пустая, если editor нет или isEnabled = false). */
    toolbarGroups: ComputedRef<IToolbarGroup[]>;
    /** Сбрасывает toolbar state к дефолтам (например, при смене редактируемого свойства). */
    resetToolbarState: () => void;
}
// #endregion

// #region useTextEditorLink
/**
 * Значение формы ссылки: адрес и признак открытия в новой вкладке.
 */
export interface ITextEditorLinkValue {
    href: string;
    openInNewTab: boolean;
}

/**
 * Возвращаемое значение composable useTextEditorLink.
 */
export interface ITextEditorLink {
    /** Открыта ли модалка ссылки. */
    isLinkModalOpen: Ref<boolean>;
    /** Начальное значение формы: адрес и вкладка текущей ссылки под курсором. */
    linkValue: Ref<ITextEditorLinkValue>;
    /** Есть ли ссылка в текущем выделении — от этого зависит кнопка «убрать». */
    hasLinkAtSelection: Ref<boolean>;
    /** Открывает модалку, подставляя атрибуты ссылки под курсором. */
    openLinkModal: () => void;
    /** Закрывает модалку, возвращая фокус в редактор. */
    closeLinkModal: () => void;
    /** Применяет ссылку к выделению (или вставляет адрес текстом). */
    applyLink: (value: ITextEditorLinkValue) => void;
    /** Снимает ссылку с выделения целиком. */
    removeLink: () => void;
}
// #endregion
