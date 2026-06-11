/**
 * Контракт inline editing — разрывает циклический type-импорт
 * builder/utils/inlineEditableProp ↔ editor/stores/inlineEditing.
 */

/**
 * Тип редактируемого свойства для inline editing.
 */
export type InlineEditingPropType = 'inline-content' | 'textarea';

export interface IInlineEditableProp {
    propName: string;
    propType: InlineEditingPropType;
    label: string;
}
