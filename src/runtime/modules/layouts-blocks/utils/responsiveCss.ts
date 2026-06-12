// #region Imports
// Types
import type { TBricksDeviceKey } from '../../common/types/brick';

// Registry
import { BLOCK_REGISTRY } from '../registry';
// #endregion

// #region Interfaces
/** Брейкпоинты published-страницы (px) для media queries. */
export interface IResponsiveCssBreakpoints {
    tabletMin: number;
    desktopMin: number;
}

/** Блок с responsiveCssVars: селектор + конфиг переменных из definition. */
interface IResponsiveCssBlock {
    selector: string;
    prefix: string;
    vars: string[];
}
// #endregion

const DEVICES: TBricksDeviceKey[] = ['mobile', 'tablet', 'desktop'];

/**
 * Собирает блоки registry, объявившие responsiveCssVars.
 * Селектор — `[data-bricks-layout="<name>"]`; prefix может шариться
 * (Media и Svg используют общие `--bricks-media-*`).
 *
 * @returns Массив блоков для генерации CSS-правил.
 */
function getResponsiveCssBlocks(): IResponsiveCssBlock[] {
    return Object.values(BLOCK_REGISTRY).flatMap((definition) =>
        definition.responsiveCssVars
            ? [
                  {
                      selector: `[data-bricks-layout="${definition.name.toLowerCase()}"]`,
                      prefix: definition.responsiveCssVars.prefix,
                      vars: definition.responsiveCssVars.vars,
                  },
              ]
            : []
    );
}

/**
 * Генерирует CSS-правило выбора per-device переменных блока:
 * `--bricks-<prefix>-<var>: var(--bricks-<prefix>-<var>-<device>);`.
 *
 * @param selector - CSS-селектор правила.
 * @param block - Блок с prefix/vars.
 * @param device - Активный device.
 * @param indent - Базовый отступ правила.
 * @returns Текст CSS-правила.
 */
function buildBlockRule(
    selector: string,
    block: IResponsiveCssBlock,
    device: TBricksDeviceKey,
    indent: string
): string {
    const lines = block.vars
        .map(
            (name) =>
                `${indent}    --bricks-${block.prefix}-${name}: var(--bricks-${block.prefix}-${name}-${device});`
        )
        .join('\n');

    return `${indent}${selector} {\n${lines}\n${indent}}`;
}

/**
 * Генерирует полный CSS выбора responsive-переменных layout-блоков из registry
 * по трём шаблонам: desktop-дефолты, builder-канвас (`data-bricks-viewport`)
 * и published media queries. Заменяет ручные CSS-блоки (шаг B6).
 *
 * @param breakpoints - Брейкпоинты published-страницы (px).
 * @returns CSS для инжекта в `<style>`.
 */
export function buildResponsiveLayoutCss(breakpoints: IResponsiveCssBreakpoints): string {
    const blocks = getResponsiveCssBlocks();

    const mobileMax = Math.max(0, breakpoints.tabletMin - 1);
    const tabletMax = Math.max(breakpoints.tabletMin, breakpoints.desktopMin - 1);

    const defaults = blocks
        .map((block) => buildBlockRule(block.selector, block, 'desktop', '        '))
        .join('\n\n');

    const builder = DEVICES.map((device) =>
        blocks
            .map((block) =>
                buildBlockRule(
                    `.bricks-canvas[data-bricks-viewport="${device}"] ${block.selector}`,
                    block,
                    device,
                    '        '
                )
            )
            .join('\n\n')
    ).join('\n\n');

    const publishedQueries: Array<[string, TBricksDeviceKey]> = [
        [`@media (max-width: ${mobileMax}px)`, 'mobile'],
        [
            `@media (min-width: ${breakpoints.tabletMin}px) and (max-width: ${tabletMax}px)`,
            'tablet',
        ],
        [`@media (min-width: ${breakpoints.desktopMin}px)`, 'desktop'],
    ];

    const published = publishedQueries
        .map(([query, device]) => {
            const rules = blocks
                .map((block) => buildBlockRule(block.selector, block, device, '            '))
                .join('\n\n');
            return `        ${query} {\n${rules}\n        }`;
        })
        .join('\n\n');

    return `
        /* ===== Responsive layout vars: Defaults (desktop) ===== */
${defaults}

        /* ===== Responsive layout vars: Builder (canvas viewport) ===== */
${builder}

        /* ===== Responsive layout vars: Published (real viewport) ===== */
${published}
    `;
}
