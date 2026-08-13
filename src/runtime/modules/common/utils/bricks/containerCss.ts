// #region Imports
// Types
import type { IBricksResolvedDevice, TBricksResolvedDeviceSet } from '../../types/devices';

// Utils
import { deviceRanges } from './devices';
// #endregion

/**
 * Возвращает CSS-свойства контейнера для устройства.
 *
 * @param device - Резолвнутое устройство набора.
 * @param indent - Базовый отступ правила.
 * @returns Тело правила `.bricks-container`.
 */
function buildContainerProps(device: IBricksResolvedDevice, indent: string): string {
    // Ширина устройства в px — это лист канваса; контейнерные величины хранятся
    // в rem числами, чтобы в генерируемый CSS не попадала строка из БД
    const maxWidth = device.maxWidth ?? device.width / 10;
    const lines = [`max-width: ${maxWidth}rem;`, `padding: 0 ${device.aside}rem;`];

    if (device.minWidth !== undefined) {
        lines.push(`min-width: ${device.minWidth}rem;`);
    }

    return lines.map((line) => `${indent}${line}`).join('\n');
}

/**
 * Собирает CSS контейнера контента по набору устройств.
 *
 * Канвас адресуется атрибутом `data-bricks-viewport`, published — media query
 * по диапазонам набора. Диапазоны считаются из ширин самих устройств, поэтому
 * ступень не может «объявиться, но не участвовать в генерации», как это было с
 * прежним отдельным списком порогов.
 *
 * @param devices - Резолвнутый набор устройств.
 * @returns CSS для инжекта в `<style>`.
 */
export function buildBricksContainerCss(devices: TBricksResolvedDeviceSet): string {
    const ranges = deviceRanges(devices);

    const canvasRules = devices
        .map(
            (
                device
            ) => `        .bricks-canvas[data-bricks-viewport="${device.key}"] .bricks-container {
${buildContainerProps(device, '            ')}
        }`
        )
        .join('\n\n');

    const publishedRules = devices
        .map((device, index) => {
            const range = ranges[index];
            const conditions = [
                range.min > 0 ? `(min-width: ${range.min}px)` : '',
                Number.isFinite(range.max) ? `(max-width: ${range.max}px)` : '',
            ].filter(Boolean);

            // У самого узкого устройства нижней границы нет, у самого широкого —
            // верхней; условий может не остаться вовсе, если устройство одно
            const query =
                conditions.length > 0 ? `@media ${conditions.join(' and ')}` : '@media all';

            return `        ${query} {
            .bricks-container:where(:not(.bricks-canvas *)) {
${buildContainerProps(device, '                ')}
            }
        }`;
        })
        .join('\n\n');

    return `
        /* Канвас как контейнер для Container Queries */
        .bricks-canvas {
            container-type: inline-size;
            container-name: bricks;
        }

        /* Базовые стили контейнера контента (канвас и published-страница).
           box-sizing задаётся явно: модуль не полагается на глобальный reset хост-проекта,
           иначе width: 100% + padding (aside) выталкивает контейнер за пределы канваса */
        .bricks-container {
            box-sizing: border-box;
            width: 100%;
            margin: 0 auto;
        }

        /* Канвас: стили по выбранному устройству набора */
${canvasRules}

        /* Published-страница: те же значения по диапазонам набора */
${publishedRules}`;
}
