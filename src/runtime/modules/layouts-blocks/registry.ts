// #region Imports
// Types
import type { IComponentLibraryItem, TBricksDeviceKey } from '../common/types/brick';
import type { ILayoutProperty } from '../common/types/layoutProperty';
import type { IBlockCanvasContext, IBlockDefinition } from './types/registry';

// Definitions
import { blockGridDefinition } from './components/blockGrid.definition';
import { blockFlexDefinition } from './components/blockFlex.definition';
import { blockSectionDefinition } from './components/blockSection.definition';
import { blockSpaceDefinition } from './components/blockSpace.definition';
import { blockSliderDefinition } from './components/blockSlider.definition';
import { blockTextDefinition } from './components/blockText.definition';
import { blockMediaDefinition } from './components/blockMedia.definition';
import { blockAccordionDefinition } from './components/blockAccordion.definition';
import { blockSvgDefinition } from './components/blockSvg.definition';

// Utils
import { readOwnKey } from '../common/utils/safeRecord';
// #endregion

/**
 * Registry layout-блоков. Bundle firewall: definitions контейнеров (Grid/Flex/Section/Space)
 * НЕ импортируют свои `.vue` — их published-рендер это `h('div')`, а канвас-мапа лежит
 * отдельно в canvasBlockComponents.ts. Leaf-definitions импортируют свои компоненты
 * для `renderPublished` — ровно сегодняшний состав published-бандла.
 * Порядок ключей = порядок блоков в библиотеке компонентов.
 */
export const BLOCK_REGISTRY: Record<string, IBlockDefinition> = {
    Grid: blockGridDefinition,
    Flex: blockFlexDefinition,
    Section: blockSectionDefinition,
    Space: blockSpaceDefinition,
    Slider: blockSliderDefinition,
    Text: blockTextDefinition,
    Media: blockMediaDefinition,
    Accordion: blockAccordionDefinition,
    Svg: blockSvgDefinition,
};

/**
 * Возвращает definition блока по componentName схемы.
 * Регистронезависимо: канвас оперирует lowercase-именами ('grid'), схема — 'Grid'.
 * `componentName` приходит из схемы и проверяется контрактом лишь как непустая
 * строка, поэтому lookup — только по own-ключу.
 *
 * @param name - Имя блока ('Grid' или 'grid').
 * @returns Definition или undefined для неизвестного блока.
 */
export function getBlockDefinition(name: string): IBlockDefinition | undefined {
    const direct = readOwnKey(BLOCK_REGISTRY, name);

    if (direct) {
        return direct;
    }

    const lowered = name.toLowerCase();
    return Object.values(BLOCK_REGISTRY).find((def) => def.name.toLowerCase() === lowered);
}

/**
 * Возвращает свойства панели редактора для блока.
 *
 * @param name - Имя блока.
 * @returns Массив определений свойств (пустой для неизвестного блока).
 */
export function getBlockProperties(name: string): ILayoutProperty[] {
    const definition = getBlockDefinition(name);
    return definition ? definition.properties : [];
}

/**
 * Derive defaultProps блока: дефолты свойств панели + extraDefaults.
 *
 * @param definition - Definition блока.
 * @returns Объект дефолтных пропсов для создания компонента.
 */
function deriveDefaultProps(definition: IBlockDefinition): Record<string, unknown> {
    const defaults = getBlockProperties(definition.name).reduce<Record<string, unknown>>(
        (acc, property) => {
            acc[property.name] = property.default;
            return acc;
        },
        {}
    );

    return { ...defaults, ...definition.extraDefaults };
}

/**
 * Возвращает элементы библиотеки компонентов для всех layout-блоков
 * (замена руками собранного LAYOUT_COMPONENTS, шаг B3).
 *
 * @returns Массив элементов библиотеки с derived defaultProps.
 */
export function getLayoutLibraryItems(): IComponentLibraryItem[] {
    return Object.values(BLOCK_REGISTRY).map((definition) => ({
        name: definition.name,
        category: 'Layout',
        brickPath: `layout/${definition.name.toLowerCase()}`,
        description: definition.description,
        thumbnail: definition.thumbnail,
        ...(definition.isInteractive ? { isInteractive: true } : {}),
        defaultProps: deriveDefaultProps(definition),
    }));
}

/**
 * Применяет коэрцию значения по определению свойства.
 *
 * @param value - Сырое значение из props.
 * @param property - Определение свойства.
 * @returns Нормализованное значение.
 */
function coercePropValue(value: unknown, property: ILayoutProperty): unknown {
    if (property.type === 'number') {
        let numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            numeric = Number(property.default) || 0;
        }
        if (property.min !== undefined) {
            numeric = Math.max(property.min, numeric);
        }
        if (property.max !== undefined) {
            numeric = Math.min(property.max, numeric);
        }
        return numeric;
    }

    if (property.type === 'boolean') {
        return Boolean(value);
    }

    if (property.type === 'select' && property.options) {
        const isValid = property.options.some((option) => option.value === value);
        return isValid ? value : property.default;
    }

    return value;
}

/**
 * Резолвит пропсы блока под viewport: generic merge `props.responsive[viewport]`
 * (при responsiveMode === 'all') + коэрция по определениям свойств.
 * Воспроизводит normalizeGridRowHeight и justify/align-guards старого
 * useCanvasItemLayout (валидация select по options).
 *
 * @param name - Имя блока.
 * @param baseProps - Пропсы компонента из схемы.
 * @param viewport - Активный viewport.
 * @returns Resolved-пропсы для биндинга на канвасе.
 */
export function resolveBlockProps(
    name: string,
    baseProps: Record<string, unknown>,
    viewport: TBricksDeviceKey
): Record<string, unknown> {
    const definition = getBlockDefinition(name);
    if (!definition) {
        return { ...baseProps };
    }

    const resolved: Record<string, unknown> = { ...baseProps };

    if (definition.responsiveMode === 'all' && viewport !== 'desktop') {
        const responsive = baseProps.responsive;
        if (responsive && typeof responsive === 'object') {
            const overrides = (responsive as Record<string, unknown>)[viewport];
            if (overrides && typeof overrides === 'object') {
                Object.assign(resolved, overrides as Record<string, unknown>);
            }
        }
    }

    for (const property of definition.properties) {
        if (property.name in resolved) {
            resolved[property.name] = coercePropValue(resolved[property.name], property);
        }
    }

    return resolved;
}

/**
 * Возвращает канвас-биндинг блока: кастомный canvasBind из definition либо
 * generic-биндинг (контейнер — layoutProps + layoutId + data-bricks-layout,
 * leaf — только layoutProps).
 *
 * @param definition - Definition блока.
 * @param ctx - Контекст биндинга канваса.
 * @returns Пропсы для канвасного компонента блока.
 */
export function resolveCanvasBind(
    definition: IBlockDefinition,
    ctx: IBlockCanvasContext
): Record<string, unknown> {
    if (definition.canvasBind) {
        return definition.canvasBind(ctx);
    }

    if (definition.hasChildren) {
        return {
            layoutProps: ctx.layoutProps,
            layoutId: ctx.component.id,
            'data-bricks-layout': definition.name.toLowerCase(),
        };
    }

    return { layoutProps: ctx.layoutProps };
}
