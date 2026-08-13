// Types
import type { IBlockCanvasContext, IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Constants
import { BLOCK_TEXT_BASE_FONT_SIZE, BLOCK_TEXT_LEGACY_FONT_SIZES } from '../constants/blockText';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { hasOwnKey } from '../../common/utils/safeRecord';
import {
    getOverriddenDeviceKeys,
    getResponsiveOverrides,
    gridPlacementStyle,
} from '../utils/responsiveVars';

// Components
// Async-импорт (паттерн blockSlider): registry импортируется плагином bricks-styles
// на каждой странице, статический импорт .vue утащил бы компонент (и санитайзер xss)
// в entry-бандл всех страниц потребителя. Канвас использует eager-версию из
// canvasBlockComponents.ts.
const BlockText = defineAsyncComponent(() => import('./BlockText.vue'));

/**
 * Published-рендер Text: канвасный компонент без editor chrome — рендерим напрямую.
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode Text.
 */
function renderTextPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const componentProps = component.props as Record<string, unknown>;
    const style: Record<string, string> = {
        ...gridPlacementStyle(component),
        ...buildTextFontSizeVars(componentProps),
    };

    return h(BlockText, {
        ...componentProps,
        key: component.id,
        id: component.htmlId || undefined,
        class: [styles.bricksText, ...extraClasses],
        style,
        // Атрибут обязателен: по нему сматчится сгенерированное правило выбора
        // per-device размера шрифта (`[data-bricks-layout="text"]`)
        'data-bricks-layout': 'text',
        ...extraAttrs,
    });
}

/**
 * Считает per-device переменные размера шрифта Text.
 *
 * Свойства `fontSize` у старых схем нет вовсе, а размер им задавали
 * `@container`-запросы в SFC: 1.4rem до 768, 1.6rem до 1024 и 1.8rem дальше.
 * Просто взять базовое значение нельзя — весь существующий текст на узких
 * устройствах стал бы крупнее. Поэтому у схемы без своего `fontSize`
 * подставляются прежние размеры по каноническим ключам, а всё, чего в той
 * таблице нет (новое промежуточное устройство), наследует базовый размер.
 *
 * @param props - Пропсы блока.
 * @returns CSS-переменные размера шрифта.
 */
function buildTextFontSizeVars(props: Record<string, unknown>): Record<string, string> {
    const hasOwnFontSize = props.fontSize !== undefined;
    const base = Number(props.fontSize) || BLOCK_TEXT_BASE_FONT_SIZE;

    const vars: Record<string, string> = { '--bricks-text-font-size-base': `${base}rem` };

    if (!hasOwnFontSize) {
        for (const [key, size] of Object.entries(BLOCK_TEXT_LEGACY_FONT_SIZES)) {
            vars[`--bricks-text-font-size-${key}`] = `${size}rem`;
        }

        return vars;
    }

    for (const device of getOverriddenDeviceKeys(props)) {
        const overrides = getResponsiveOverrides(props, device);

        // Только явные переопределения: устройство, у которого переопределено
        // что-то другое, должно наследовать базовый размер через fallback в CSS,
        // а не получать копию базового значения своей переменной
        if (!hasOwnKey(overrides, 'fontSize')) {
            continue;
        }

        const value = Number(overrides.fontSize);

        if (Number.isFinite(value) && value > 0) {
            vars[`--bricks-text-font-size-${device}`] = `${value}rem`;
        }
    }

    return vars;
}

/**
 * Канвас-биндинг Text: пропсы блока плюс те же per-device переменные, что у
 * published-рендера.
 *
 * Переменные нужны и на канвасе: размер выбирает сгенерированное правило по
 * `data-bricks-viewport`, а не проп. Иначе легаси-схема без своего `fontSize`
 * показывала бы на канвасе базовый размер, хотя раньше на узком листе была
 * мельче, — билдер снова разошёлся бы с published, только в другую сторону.
 *
 * @param ctx - Контекст биндинга канваса.
 * @returns Пропсы канвасного компонента.
 */
function bindTextCanvas(ctx: IBlockCanvasContext): Record<string, unknown> {
    return {
        ...bindBoundPropsWithComponentId(ctx),
        style: buildTextFontSizeVars(ctx.component.props as Record<string, unknown>),
        'data-bricks-layout': 'text',
    };
}

/**
 * Definition блока Text: HTML-текст.
 * Дефолт content — RU-строка по поведению создания (сверка дефолтов, Часть B).
 */
export const blockTextDefinition: IBlockDefinition = {
    name: 'Text',
    description: 'bricks.blocks.text.description',
    thumbnail: 'images/layouts/text.svg',
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'text',
        vars: ['font-size'],
    },
    canvasBind: bindTextCanvas,
    renderPublished: renderTextPublished,
    properties: [
        {
            name: 'content',
            type: 'textarea',
            label: 'bricks.blocks.text.props.content.label',
            default: '<p>Введите текст</p>',
        },
        {
            name: 'fontSize',
            type: 'number',
            label: 'bricks.blocks.text.props.fontSize.label',
            default: BLOCK_TEXT_BASE_FONT_SIZE,
            min: 0.8,
            step: 0.2,
            unit: 'rem',
            responsive: true,
        },
        {
            name: 'marginTop',
            type: 'number',
            label: 'bricks.blocks.text.props.marginTop.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'bricks.blocks.text.props.marginBottom.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
    ],
};
