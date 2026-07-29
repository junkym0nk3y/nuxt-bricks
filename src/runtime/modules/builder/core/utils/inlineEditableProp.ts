// #region Imports
import type { IBrickValues } from '../../../common/types/index';
import type {
    IInlineEditableProp,
    TInlineEditingPropType,
} from '../../../common/types/inlineEditing';
import type { ILayoutProperty } from '../../../common/types/layoutProperty';

// Utils
import { readOwnKey } from '../../../common/utils/safeRecord';
// #endregion

// Реэкспорт для обратной совместимости импортёров (useCanvasItemInlineEditing)
export type { IInlineEditableProp } from '../../../common/types/inlineEditing';

/** Inline-editable типы для layout-компонентов (без input — иначе ловит CSS-пропы в Media) */
const INLINE_EDITABLE_LAYOUT_TYPES = new Set<string>(['inline-content', 'textarea']);

/** Inline-editable типы для brick-компонентов (включая input для заголовков и т.д.) */
const INLINE_EDITABLE_BRICK_TYPES = new Set<string>(['inline-content', 'textarea', 'input']);

/**
 * Находит все inline-editable свойства среди layout properties.
 *
 * @param layoutProperties - Массив свойств layout-компонента.
 * @returns Массив editable свойств.
 */
export function findAllInlineEditableLayoutProps(
    layoutProperties: ILayoutProperty[]
): IInlineEditableProp[] {
    const result: IInlineEditableProp[] = [];

    for (const prop of layoutProperties) {
        if (INLINE_EDITABLE_LAYOUT_TYPES.has(prop.type)) {
            result.push({
                propName: prop.name,
                propType: prop.type as TInlineEditingPropType,
                label: prop.label,
            });
        }
    }

    return result;
}

/**
 * Переводит первую букву строки в верхний регистр.
 */
function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Проверяет, выполнено ли условие showWhen для свойства.
 *
 * Имя поля объявляет brick-файл, а пропсы приходят из схемы: `showWhen.field`
 * вида `toString` без own-ключа вернул бы метод прототипа, и сравнение с
 * `equals` было бы ложным при любой схеме — свойство молча пропадало бы из
 * inline-редактирования.
 *
 * @param propConfig - Конфиг свойства из brick.
 * @param componentProps - Текущие props компонента.
 * @returns true если условие выполнено или отсутствует.
 */
function isShowWhenSatisfied(
    propConfig: IBrickValues,
    componentProps: Record<string, unknown>
): boolean {
    if (!propConfig.showWhen) {
        return true;
    }

    return readOwnKey(componentProps, propConfig.showWhen.field) === propConfig.showWhen.equals;
}

/**
 * Находит все inline-editable свойства среди brick values.
 * Учитывает showWhen условия для фильтрации неактивных свойств.
 *
 * @param brickValues - Объект values из .brick.ts brick.
 * @param componentProps - Текущие props компонента для проверки showWhen.
 * @returns Массив editable свойств.
 */
export function findAllInlineEditableBrickProps(
    brickValues: Record<string, IBrickValues>,
    componentProps: Record<string, unknown> = {}
): IInlineEditableProp[] {
    const result: IInlineEditableProp[] = [];

    for (const [propName, propConfig] of Object.entries(brickValues)) {
        if (!INLINE_EDITABLE_BRICK_TYPES.has(propConfig.type)) {
            continue;
        }

        if (!isShowWhenSatisfied(propConfig, componentProps)) {
            continue;
        }

        // input маппится на textarea — TipTap справляется с plain text
        const propType: TInlineEditingPropType =
            propConfig.type === 'input' ? 'textarea' : (propConfig.type as TInlineEditingPropType);

        result.push({
            propName,
            propType,
            label: propConfig.desc || capitalize(propName),
        });
    }

    return result;
}
