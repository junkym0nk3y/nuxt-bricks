// #region Imports
// Types
import type { IBricksComponent, IBricksSchema } from '../../../common/types/brick';

// #endregion

/**
 * Убирает переопределения и флаги видимости удалённых устройств из компонента.
 *
 * @param component - Компонент схемы.
 * @param removedKeys - Ключи устройств, которых в наборе больше нет.
 * @returns Компонент без ключей удалённых устройств.
 */
function cleanComponent(component: IBricksComponent, removedKeys: Set<string>): IBricksComponent {
    const props = component.props as Record<string, unknown>;
    const responsive = props.responsive;

    let nextProps = props;

    if (responsive && typeof responsive === 'object') {
        const kept = Object.fromEntries(
            Object.entries(responsive as Record<string, unknown>).filter(
                ([key]) => !removedKeys.has(key)
            )
        );

        // Пустой `responsive` не оставляем ключом-пустышкой: сериализованная
        // схема иначе копит `responsive: {}` у каждого тронутого блока
        const { responsive: _dropped, ...withoutResponsive } = props;
        nextProps =
            Object.keys(kept).length > 0
                ? { ...withoutResponsive, responsive: kept }
                : withoutResponsive;
    }

    const visibility = component.deviceVisibility;
    const nextVisibility =
        visibility && Object.keys(visibility).some((key) => removedKeys.has(key))
            ? Object.fromEntries(
                  Object.entries(visibility).filter(([key]) => !removedKeys.has(key))
              )
            : visibility;

    const cleaned: IBricksComponent = { ...component, props: nextProps };

    if (nextVisibility && Object.keys(nextVisibility).length > 0) {
        cleaned.deviceVisibility = nextVisibility;
    } else {
        delete cleaned.deviceVisibility;
    }

    return cleaned;
}

/**
 * Вычищает из схемы всё, что относилось к исчезнувшим устройствам.
 *
 * Применяется и к текущей схеме, и к каждому снимку истории: иначе undo вернул
 * бы состояние, где переопределения ссылаются на ступень, которой у страницы
 * больше нет, а повторное добавление устройства с тем же ключом воскресило бы
 * удалённые значения.
 *
 * @param schema - Схема страницы.
 * @param removedKeys - Ключи устройств, которых в наборе больше нет.
 * @returns Схема без ключей удалённых устройств.
 */
export function stripDeviceKeysFromSchema(
    schema: IBricksSchema,
    removedKeys: ReadonlySet<string>
): IBricksSchema {
    if (removedKeys.size === 0) {
        return schema;
    }

    const keys = new Set(removedKeys);

    return {
        ...schema,
        components: schema.components.map((component) => cleanComponent(component, keys)),
    };
}

/**
 * Считает ключи устройств, исчезнувшие при смене набора.
 *
 * @param previous - Ключи прежнего набора.
 * @param next - Ключи нового набора.
 * @returns Множество исчезнувших ключей.
 */
export function findRemovedDeviceKeys(
    previous: ReadonlyArray<string>,
    next: ReadonlyArray<string>
): Set<string> {
    const kept = new Set(next);

    return new Set(previous.filter((key) => !kept.has(key)));
}
