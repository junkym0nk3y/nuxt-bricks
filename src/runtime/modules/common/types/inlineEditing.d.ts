/**
 * Контракт inline editing — разрывает циклический type-импорт
 * builder/core/utils/inlineEditableProp ↔ editor/stores/inlineEditing.
 */

/**
 * Тип редактируемого свойства для inline editing.
 */
export type TInlineEditingPropType = 'inline-content' | 'textarea';

export interface IInlineEditableProp {
    propName: string;
    propType: TInlineEditingPropType;
    label: string;
}
