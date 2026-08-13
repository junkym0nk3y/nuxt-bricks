// #region Imports
// Types
import type { IBricksComponent, IBricksSchema } from '../../../common/types/brick';

// Utils
import { hasOwnKey } from '../../../common/utils/safeRecord';
import {
    findRemovedDeviceKeys,
    stripDeviceKeysFromSchema,
} from '../../core/utils/deviceKeyCleanup';
// #endregion

/**
 * Считает переопределения свойств блоков, привязанные к устройству.
 *
 * Считаются именно переопределения, а не блоки: подтверждение из макета
 * обещает удалить «переопределения свойств... сейчас их N», и число блоков
 * назвало бы пользователю не ту величину. Флаг видимости — тоже
 * переопределение устройства: он исчезнет вместе с ключом.
 *
 * @param components - Компоненты схемы страницы.
 * @param deviceKey - Ключ удаляемого устройства.
 * @returns Число значений, которые исчезнут.
 */
export function countDeviceOverrides(
    components: ReadonlyArray<IBricksComponent>,
    deviceKey: string
): number {
    return components.reduce((total, component) => {
        const responsive = (component.props as Record<string, unknown> | undefined)?.responsive;
        const overrides =
            responsive && typeof responsive === 'object' && hasOwnKey(responsive, deviceKey)
                ? (responsive as Record<string, unknown>)[deviceKey]
                : undefined;

        const propsCount =
            overrides && typeof overrides === 'object'
                ? Object.keys(overrides as Record<string, unknown>).length
                : 0;

        const visibilityCount =
            component.deviceVisibility && hasOwnKey(component.deviceVisibility, deviceKey) ? 1 : 0;

        return total + propsCount + visibilityCount;
    }, 0);
}

/**
 * Описывает, какому устройству достанется диапазон удаляемого.
 *
 * Диапазон никуда не девается — его забирает сосед слева (у самого узкого
 * соседа нет, но крайние устройства и не удаляются). Пользователю важно
 * увидеть именно это: раскладка удаляемой ступени не исчезает, а сливается
 * с соседней.
 *
 * @param devices - Набор, отсортированный по возрастанию ширины.
 * @param deviceKey - Ключ удаляемого устройства.
 * @returns Подпись устройства-приёмника и переходящий диапазон.
 */
export function describeAbsorbedRange(
    devices: ReadonlyArray<{ key: string; label: string; width: number }>,
    deviceKey: string
): { label: string; range: string } {
    const index = devices.findIndex((device) => device.key === deviceKey);

    if (index <= 0) {
        return { label: '', range: '' };
    }

    const next = devices[index + 1];
    const upper = next ? next.width - 1 : null;

    return {
        label: devices[index - 1].label,
        range: upper === null ? `${devices[index].width}+` : `${devices[index].width}–${upper}`,
    };
}

/**
 * Приводит схему к новому набору устройств: убирает ключи тех, что исчезли.
 *
 * Нужна там, где схема ещё не в сторе билдера, а лежит в форме создания
 * страницы: watcher composition root чистит только открытую страницу, а
 * подтверждение удаления обещает удалить переопределения устройства и в момент
 * создания тоже. Без этого страница создавалась бы ровно с тем, что обещали
 * удалить.
 *
 * Схема возвращается той же ссылкой, если удалять нечего — вызывающему не нужно
 * гадать, менялось ли что-то.
 *
 * @param schema - Схема, которая уедет в создаваемую страницу.
 * @param previousKeys - Ключи набора до правки.
 * @param nextKeys - Ключи набора после правки.
 * @returns Схема без ключей исчезнувших устройств.
 */
export function applyDeviceSetToSchema(
    schema: IBricksSchema,
    previousKeys: ReadonlyArray<string>,
    nextKeys: ReadonlyArray<string>
): IBricksSchema {
    const removed = findRemovedDeviceKeys(previousKeys, nextKeys);

    return removed.size > 0 ? stripDeviceKeysFromSchema(schema, removed) : schema;
}

/**
 * Собирает ключи устройств, которые встречаются в схеме, но в наборе отсутствуют.
 *
 * Такие переопределения не удаляются — молчаливой потери данных быть не должно, —
 * но и не применяются: правил CSS для них не генерируется. Пользователю об этом
 * говорят прямо, потому что иначе расхождение раскладки выглядит как баг рендера.
 *
 * Сопоставить чужой ключ со своим устройством автоматически неоткуда: `watch` или
 * `screen-2` могут значить что угодно, поэтому remap не делается.
 *
 * Считать нужно против ФАКТИЧЕСКОГО набора цели, а не набора файла: файл может о
 * наборе вообще молчать, и тогда ступени задаёт страница, в которую импортируют.
 *
 * @param components - Компоненты схемы.
 * @param deviceKeys - Ключи устройств набора, который будет действовать.
 * @returns Отсортированные уникальные ключи-сироты.
 */
export function collectOrphanDeviceKeys(
    components: ReadonlyArray<IBricksComponent>,
    deviceKeys: ReadonlyArray<string>
): string[] {
    const known = new Set(deviceKeys);
    const orphans = new Set<string>();

    for (const component of components) {
        const responsive = (component.props as Record<string, unknown> | undefined)?.responsive;

        if (responsive && typeof responsive === 'object') {
            for (const key of Object.keys(responsive)) {
                if (!known.has(key)) {
                    orphans.add(key);
                }
            }
        }

        for (const key of Object.keys(component.deviceVisibility ?? {})) {
            if (!known.has(key)) {
                orphans.add(key);
            }
        }
    }

    return [...orphans].sort();
}
