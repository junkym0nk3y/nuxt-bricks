// #region Imports
// Utils
import { readOwnKey } from '../../../../common/utils/safeRecord';
// #endregion

/**
 * Снимок значений forceRender-пропов для сравнения между рендерами.
 *
 * Сериализуется парами, а не объектом: имена пропов объявлены в brick-файле,
 * и проп `__proto__` в обычном объекте own-ключа не создаёт — его правка не
 * меняла бы снимок и принудительный перерендер не срабатывал бы. Значения
 * читаются по own-ключу, иначе проп с именем `toString` подставил бы метод
 * прототипа вместо значения из схемы.
 *
 * @param propNames - Имена пропов с `forceRender: true` из brick-файла.
 * @param componentProps - Пропсы компонента из схемы страницы.
 * @returns Стабильная строка снимка (пустая, если forceRender-пропов нет).
 */
export function buildForceRenderSnapshot(
    propNames: string[],
    componentProps: Record<string, unknown>
): string {
    if (propNames.length === 0) {
        return '';
    }

    return JSON.stringify(
        propNames.map((propName) => [propName, readOwnKey(componentProps, propName)])
    );
}
