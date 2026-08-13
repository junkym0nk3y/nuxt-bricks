// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';
import type { IResponsiveCssBlock } from '../types/responsiveCss';

// Constants
import { BASE_DEVICE_KEY, BASE_VAR_SUFFIX } from '../../common/constants/devices';

// Utils
import { deviceRanges } from '../../common/utils/bricks/devices';

// Registry
import { BLOCK_REGISTRY } from '../registry';
// #endregion

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
 * Генерирует правило выбора активных переменных блока для устройства.
 *
 * Переменные устройства эмитятся разрежённо — только там, где переопределение
 * реально есть, — поэтому активное правило СНАЧАЛА гасит переменную устройства
 * на самом элементе, и лишь потом читает её с fallback'ом на базовое значение.
 *
 * Сброс обязателен: custom properties наследуются, и без него вложенный блок
 * без собственного переопределения прочитал бы значение родителя того же типа
 * (вложенный Grid взял бы колонки внешнего Grid), а fallback не сработал бы
 * вовсе. Инлайновое значение самого элемента сброс не задевает — объявление в
 * `style` перебивает объявление из стилевого правила.
 *
 * @param selector - CSS-селектор правила.
 * @param block - Блок с prefix/vars.
 * @param deviceKey - Ключ активного устройства.
 * @param indent - Базовый отступ правила.
 * @returns Текст CSS-правила.
 */
function buildBlockRule(
    selector: string,
    block: IResponsiveCssBlock,
    deviceKey: string,
    indent: string
): string {
    const isBase = deviceKey === BASE_DEVICE_KEY;

    const lines = block.vars.flatMap((name) => {
        const varName = `--bricks-${block.prefix}-${name}`;
        const baseVar = `${varName}-${BASE_VAR_SUFFIX}`;

        // База лежит в обычных пропах блока и эмитится всегда — читаем напрямую
        if (isBase) {
            return [`${indent}    ${varName}: var(${baseVar});`];
        }

        const deviceVar = `${varName}-${deviceKey}`;
        return [
            `${indent}    ${deviceVar}: initial;`,
            `${indent}    ${varName}: var(${deviceVar}, var(${baseVar}));`,
        ];
    });

    return `${indent}${selector} {\n${lines.join('\n')}\n${indent}}`;
}

/**
 * Генерирует полный CSS выбора responsive-переменных layout-блоков из registry
 * по трём шаблонам: дефолты базового устройства, builder-канвас
 * (`data-bricks-viewport`) и published media queries по диапазонам набора.
 *
 * @param devices - Резолвнутый набор устройств страницы.
 * @returns CSS для инжекта в `<style>`.
 */
export function buildResponsiveLayoutCss(devices: TBricksResolvedDeviceSet): string {
    const blocks = getResponsiveCssBlocks();

    const defaults = blocks
        .map((block) => buildBlockRule(block.selector, block, BASE_DEVICE_KEY, '        '))
        .join('\n\n');

    const builder = devices
        .map((device) =>
            blocks
                .map((block) =>
                    buildBlockRule(
                        `.bricks-canvas[data-bricks-viewport="${device.key}"] ${block.selector}`,
                        block,
                        device.key,
                        '        '
                    )
                )
                .join('\n\n')
        )
        .join('\n\n');

    const published = deviceRanges(devices)
        .map((range) => {
            const conditions = [
                range.min > 0 ? `(min-width: ${range.min}px)` : '',
                Number.isFinite(range.max) ? `(max-width: ${range.max}px)` : '',
            ].filter(Boolean);

            const query =
                conditions.length > 0 ? `@media ${conditions.join(' and ')}` : '@media all';

            const rules = blocks
                .map((block) => buildBlockRule(block.selector, block, range.key, '            '))
                .join('\n\n');

            return `        ${query} {\n${rules}\n        }`;
        })
        .join('\n\n');

    return `
        /* ===== Responsive layout vars: Defaults (base device) ===== */
${defaults}

        /* ===== Responsive layout vars: Builder (canvas viewport) ===== */
${builder}

        /* ===== Responsive layout vars: Published (real viewport) ===== */
${published}
    `;
}
