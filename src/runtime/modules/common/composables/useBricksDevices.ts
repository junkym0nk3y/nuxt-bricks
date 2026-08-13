// #region Imports
// Types
import type { IUseBricksDevicesReturn } from '../types/composables';
import type { TBricksProjectDeviceSet, TBricksResolvedDeviceSet } from '../types/devices';

// Nuxt
import { useRuntimeConfig } from 'nuxt/app';

// Constants
import { DEFAULT_BRICKS_DEVICES } from '../constants/devices';

// Utils
import { deviceRanges, resolveDeviceSet, validateDeviceSet } from '../utils/bricks/devices';
// #endregion

/**
 * Предупреждение о подмене набора печатается один раз за загрузку приложения:
 * резолвер зовётся из `computed`, и на каждый пересчёт вывод превратился бы в
 * поток. Диагностика нужна как факт, а не как счётчик.
 */
let hasWarnedInvalidPageDevices = false;

/**
 * Набор устройств проекта и резолвер набора страницы.
 *
 * Набор проекта фиксируется на сборке (опция модуля `bricks.devices` поверх
 * константы) и приезжает в `runtimeConfig.public`: те же числа уходят в
 * SCSS-карту миксинов, поэтому канвас, контейнеры, пороги published и media
 * query авторов бриков считаются по одному источнику.
 *
 * Набор страницы этот композабл не читает — страницу знает только тот, кто её
 * загрузил, и он передаёт конфиг в `resolvePageDevices` сам.
 */
export function useBricksDevices(): IUseBricksDevicesReturn {
    const runtimeConfig = useRuntimeConfig();
    const raw = runtimeConfig.public?.bricksDevices;

    // Опция валидируется fail-fast на сборке модуля; здесь проверка нужна на
    // случай, если runtimeConfig переопределили в обход неё
    const validation = validateDeviceSet(raw, 'project');
    const projectDevices: TBricksProjectDeviceSet = validation.ok
        ? (raw as TBricksProjectDeviceSet)
        : DEFAULT_BRICKS_DEVICES;

    const project = resolveDeviceSet(null, projectDevices);

    /**
     * Резолвит набор конкретной страницы поверх проектного.
     *
     * @param pageConfig - `viewport_config` страницы либо `null` (наследование).
     * @returns Резолвнутый набор устройств.
     */
    function resolvePageDevices(pageConfig: unknown): TBricksResolvedDeviceSet {
        const resolved = resolveDeviceSet(pageConfig, projectDevices);

        // Молча отдавать проектный набор вместо повреждённого нельзя: страница
        // покажется в чужой раскладке, и единственный след останется в строке БД.
        // Сырое значение в лог не пишем — это данные страницы
        if (resolved.usedFallback && !hasWarnedInvalidPageDevices) {
            hasWarnedInvalidPageDevices = true;
            console.warn(
                '[Bricks] Набор устройств страницы не проходит контракт — страница отрисована набором проекта. Проверьте bricks_pages.viewport_config.'
            );
        }

        return resolved.devices;
    }

    return {
        projectDevices: project.devices,
        resolvePageDevices,
        deviceRanges,
    };
}
