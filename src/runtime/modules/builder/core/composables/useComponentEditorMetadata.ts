// #region Imports
// Types
import type { IBricksComponent } from '../../../common/types/brick';
import type {
    IComponentEditorMetadata,
    IUseComponentEditorMetadataReturn,
} from '../types/componentLibrary';

// Composables
import { useBrickMetadata } from './useBrickMetadata';
import { useComponentProperties } from './useComponentProperties';

// Utils
import { getLayoutProperties } from '../utils/layoutProperties';

// Constants
import { LAYOUT_COMPONENTS } from '../constants/layoutComponents';
// #endregion

/**
 * Данные панели свойств по компоненту канваса.
 *
 * Один резолвер на оба пути выбора — клик по компоненту и клик в дереве схемы:
 * раньше каждый собирал свойства сам, и правка одного молча расходилась с
 * другим.
 *
 * @returns Функция сборки данных панели свойств.
 */
export function useComponentEditorMetadata(): IUseComponentEditorMetadataReturn {
    const { readBrickMetadata } = useBrickMetadata();
    const { brickValuesToProperties } = useComponentProperties();

    /**
     * Собирает описание и определения свойств компонента.
     *
     * Пустой результат у brick-компонента означает, что манифест ещё не дошёл:
     * отката на импорт brick-модуля нет намеренно — второй источник тех же
     * данных расходился бы с первым. Библиотека в этот момент показывает отказ и
     * предлагает повтор, а он наполняет уже открытую панель.
     *
     * @param component - Компонент со схемы страницы.
     * @returns Свойства и описание для панели.
     */
    function resolveComponentEditorMetadata(component: IBricksComponent): IComponentEditorMetadata {
        if (component.type === 'layout') {
            return {
                properties: getLayoutProperties(component.componentName.toLowerCase()),
                description: LAYOUT_COMPONENTS.find(
                    (item) => item.brickPath === component.brickPath
                )?.description,
            };
        }

        const metadata = readBrickMetadata(component.brickPath);

        return {
            properties: metadata ? brickValuesToProperties(metadata.values) : [],
            description: metadata?.description,
        };
    }

    return {
        resolveComponentEditorMetadata,
    };
}
