// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import {
    getResponsiveOverrides,
    gridPlacementStyle,
    makeResponsiveVars,
    toRem,
} from '../utils/responsiveVars';

/**
 * Нормализует значение отступа в rem.
 * Числа интерпретируются как rem (например, 2.4 → "2.4rem").
 * Строки с px конвертируются в rem.
 *
 * @param size - Значение отступа (число в rem или строка).
 * @returns Нормализованное значение в rem.
 */
function normalizeSpacingSize(size: string | number): string {
    // Числа уже в rem - просто добавляем единицу измерения
    if (typeof size === 'number') {
        return `${size}rem`;
    }

    // Строка с px - конвертируем в rem
    if (size.endsWith('px')) {
        const numericValue = Number(size.replace('px', ''));
        return convertPxToRem(Number.isFinite(numericValue) ? numericValue : 0);
    }

    // Остальные строки возвращаем как есть (уже с единицей измерения)
    return size;
}

/**
 * Рендерит линию-разделитель внутри Space.
 *
 * @param spaceProps - Пропсы Space-компонента.
 * @param isVertical - Вертикальное ли направление отступа.
 * @returns VNode разделителя.
 */
function renderSpaceDivider(spaceProps: Record<string, any>, isVertical: boolean): VNode {
    const color = spaceProps.dividerColor || 'var(--bricks-base-200)';
    const borderWidth = `${Math.max(1, Number(spaceProps.dividerWidth) || 1)}px`;
    const lineStyle = spaceProps.dividerStyle || 'solid';
    const mx = Math.round(Math.max(0, Number(spaceProps.dividerMarginX) || 0) * 10) / 10;

    const hrStyle: Record<string, string> = {
        border: 'none',
        flexShrink: '0',
    };

    if (isVertical) {
        hrStyle.height = '0';
        hrStyle.borderTop = `${borderWidth} ${lineStyle} ${color}`;
        hrStyle.width = mx > 0 ? `calc(100% - ${mx * 2}rem)` : '100%';
    } else {
        hrStyle.width = '0';
        hrStyle.borderLeft = `${borderWidth} ${lineStyle} ${color}`;
        hrStyle.height = mx > 0 ? `calc(100% - ${mx * 2}rem)` : '100%';
    }

    return h('hr', { style: hrStyle });
}

/**
 * Published-рендер Space: `h('div')` с per-device CSS-переменными и опциональным разделителем.
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode spacer-компонента.
 */
function renderSpacePublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const currentProps = component.props as Record<string, any>;
    const mOv = getResponsiveOverrides(currentProps, 'mobile');
    const tOv = getResponsiveOverrides(currentProps, 'tablet');

    const toSize = (v: unknown): string => normalizeSpacingSize((v || '2.4rem') as string | number);

    const style: Record<string, string> = {
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        ...makeResponsiveVars('--bricks-space-size', currentProps.size, tOv, mOv, 'size', toSize),
        ...makeResponsiveVars(
            '--bricks-space-divider-mx',
            currentProps.dividerMarginX,
            tOv,
            mOv,
            'dividerMarginX',
            toRem
        ),
    };

    if (currentProps.direction === 'vertical' || currentProps.direction === 'both') {
        style.height = 'var(--bricks-space-size)';
    }

    if (currentProps.direction === 'horizontal' || currentProps.direction === 'both') {
        style.width = 'var(--bricks-space-size)';
    }

    if (currentProps.showDivider) {
        style.display = 'flex';
        style.alignItems = 'flex-end';
        style.justifyContent = 'center';
    }

    Object.assign(style, gridPlacementStyle(component));

    const isVertical = currentProps.direction === 'vertical' || currentProps.direction === 'both';
    const dividerChildren = currentProps.showDivider
        ? [renderSpaceDivider(currentProps, isVertical)]
        : undefined;

    return h(
        'div',
        {
            id: component.htmlId || undefined,
            style,
            class: [styles.bricksSpace, ...extraClasses],
            'data-bricks-layout': 'space',
            ...extraAttrs,
        },
        dividerChildren
    );
}

/**
 * Definition блока Space: отступ (spacer), без children.
 */
export const blockSpaceDefinition: IBlockDefinition = {
    name: 'Space',
    description: 'Отступ (spacer) между блоками по вертикали или горизонтали.',
    thumbnail: '/images/layouts/space.svg',
    responsiveMode: 'all',
    renderPublished: renderSpacePublished,
    properties: [
        {
            name: 'size',
            type: 'number',
            label: 'Размер (rem)',
            default: 2.4,
            min: 0,
            step: 0.2,
            description: 'Величина отступа в rem',
            responsive: true,
        },
        {
            name: 'direction',
            type: 'select',
            label: 'Направление',
            default: 'vertical',
            description: 'В каком направлении применяется отступ',
            options: [
                { label: 'Вертикально', value: 'vertical' },
                { label: 'Горизонтально', value: 'horizontal' },
                { label: 'Оба направления', value: 'both' },
            ],
        },
        {
            name: 'showDivider',
            type: 'boolean',
            label: 'Показать разделитель',
            default: false,
            description: 'Отображать линию-разделитель',
            group: 'Разделитель',
        },
        {
            name: 'dividerColor',
            type: 'color',
            label: 'Цвет разделителя',
            default: '',
            description: 'Пустое значение = var(--bricks-base-200)',
            group: 'Разделитель',
        },
        {
            name: 'dividerWidth',
            type: 'number',
            label: 'Толщина разделителя (px)',
            default: 1,
            min: 1,
            max: 10,
            group: 'Разделитель',
        },
        {
            name: 'dividerStyle',
            type: 'select',
            label: 'Стиль разделителя',
            default: 'solid',
            options: [
                { label: 'Сплошная', value: 'solid' },
                { label: 'Пунктирная', value: 'dashed' },
                { label: 'Точечная', value: 'dotted' },
            ],
            group: 'Разделитель',
        },
        {
            name: 'dividerMarginX',
            type: 'number',
            label: 'Отступы разделителя по бокам (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Горизонтальные отступы разделителя от краёв в rem',
            group: 'Разделитель',
            responsive: true,
        },
    ],
};
