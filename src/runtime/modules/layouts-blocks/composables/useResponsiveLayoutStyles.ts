// #region Imports
// Nuxt
import { useHead } from 'nuxt/app';

// Utils
import { buildResponsiveLayoutCss } from '../utils/responsiveCss';

// Composables
import { useBricksConfig } from '../../common/composables/useBricksConfig';
// #endregion

/**
 * Инжектит глобальные CSS-правила для responsive layout-настроек через CSS variables.
 *
 * В схеме layout-компоненты хранят `props.responsive.{mobile|tablet|desktop}` с overrides.
 * Рендерер выставляет переменные вида `--bricks-grid-columns-mobile` и т.д.
 * Здесь мы только выбираем активные переменные (`--bricks-grid-columns`, `--bricks-flex-direction`, …)
 * в зависимости от текущего viewport (builder) или брейкпоинтов (published).
 *
 * Правила генерируются из `responsiveCssVars` definitions блоков (registry, шаг B6).
 * Реализация SSR-safe: никаких JS device detection, только CSS.
 */
export function useResponsiveLayoutStyles(): void {
    const config = useBricksConfig();
    const breakpoints = config.breakpoints;

    const tabletMin = Number(breakpoints.tablet ?? 768);
    const desktopMin = Number(breakpoints.desktop ?? 1600);

    useHead({
        style: [
            {
                key: 'bricks-responsive-layout',
                innerHTML: buildResponsiveLayoutCss({ tabletMin, desktopMin }),
            },
        ],
    });
}
