/**
 * Контракт inline editing — разрывает циклический type-импорт
 * builder/core/utils/inlineEditableProp ↔ editor/stores/inlineEditing.
 */
import type { TBrickPropValue } from './brick';

/**
 * Тип редактируемого свойства для inline editing.
 */
export type TInlineEditingPropType = 'inline-content' | 'textarea';

export interface IInlineEditableProp {
    propName: string;
    propType: TInlineEditingPropType;
    label: string;
}

/**
 * Порт text-editor'а к состоянию билдера (чтение/запись пропов + история).
 * Провайдится канвасом через INLINE_EDITOR_HOST_KEY — text-editor не импортирует
 * builder/core (иначе граф builder-сторов утекает в published-бандл через BlockText).
 */
export interface IInlineEditorHost {
    getPropValue(componentId: string, propName: string): unknown;
    updateProp(componentId: string, propName: string, value: TBrickPropValue): void;
    commitHistory(): void;
}
