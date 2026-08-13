// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';

// Utils
import { deviceRanges } from '../../common/utils/bricks/devices';
// #endregion

/**
 * Собирает правила скрытия по устройствам для набора.
 *
 * `display: none !important` — осознанное исключение из запрета `!important`
 * (`.claude/rules/styles.md`): класс видимости конкурирует с ИНЛАЙНОВЫМ
 * `display` контейнерных блоков (Grid, Flex, Section ставят его в `style`
 * элемента при рендере), и без `!important` скрытие у них молча перестало бы
 * работать. Правило запрета писано для компонентных стилей; здесь —
 * генерируемый глобальный utility-CSS.
 *
 * @param devices - Резолвнутый набор устройств.
 * @returns CSS для инжекта в `<style>`.
 */
export function buildDeviceVisibilityCss(devices: TBricksResolvedDeviceSet): string {
    const canvasSelectors = devices
        .map(
            (device) =>
                `        .bricks-canvas[data-bricks-viewport="${device.key}"] .bricks-hide--${device.key}`
        )
        .join(',\n');

    const publishedRules = deviceRanges(devices)
        .map((range) => {
            const conditions = [
                range.min > 0 ? `(min-width: ${range.min}px)` : '',
                Number.isFinite(range.max) ? `(max-width: ${range.max}px)` : '',
            ].filter(Boolean);

            const query =
                conditions.length > 0 ? `@media ${conditions.join(' and ')}` : '@media all';

            return `        ${query} {
            .bricks-hide--${range.key}:not(.bricks-canvas *) { display: none !important; }
        }`;
        })
        .join('\n\n');

    return `
        /* ===== Device visibility: Builder (canvas viewport) ===== */
${canvasSelectors} {
            display: none !important;
        }

        /* ===== Device visibility: Published (real viewport) ===== */
        /* На опубликованной странице полностью скрываем компоненты по media queries. */
${publishedRules}
    `;
}
