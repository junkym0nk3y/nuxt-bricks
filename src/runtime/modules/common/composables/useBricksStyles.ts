// #region Imports
// Types
import type { IBricksBreakpointConfig } from '../types/config';

// Nuxt
import { useHead } from 'nuxt/app';

// Composables
import { useBricksConfig } from './useBricksConfig';

// Utils
import { convertPxToRem } from '../utils/main';
// #endregion

/**
 * Возвращает CSS-свойства контейнера для breakpoint.
 */
function buildContainerProps(
    bp: IBricksBreakpointConfig,
    fallbackMaxWidth: string,
    fallbackAside: string
): string {
    const maxWidth = bp.maxWidth ?? fallbackMaxWidth;
    const aside = bp.aside ?? fallbackAside;
    let css = `max-width: ${maxWidth};\n            padding: 0 ${aside};`;

    if (bp.minWidth) {
        css += `\n            min-width: ${bp.minWidth};`;
    }

    return css;
}

/**
 * Composable для инъекции динамических стилей лендинга в <head>
 *
 * Билдер полностью владеет контейнером контента (.bricks-container) — и на канвасе,
 * и на published-странице. Источник значений один: canvas breakpoints из конфига
 * (aside / maxWidth / minWidth, fallback'и от width).
 *
 * Канвас: Container Queries + [data-bricks-viewport] на .bricks-canvas — компоненты
 * адаптируются к размеру канваса, а не окна браузера (критично для превью в билдере).
 *
 * Published-страница: media queries по device breakpoints применяют те же значения
 * к .bricks-container. Селектор обёрнут в :where(:not(.bricks-canvas *)), чтобы
 * media-query-правила не протекали в канвас (там действуют только viewport-правила).
 *
 * @example
 * // В компоненте или странице
 * useBricksStyles();
 *
 * // В HTML
 * <div class="bricks-canvas" data-bricks-viewport="desktop">
 *   <div class="bricks-container">
 *     Контент ограничен max-width и имеет боковые отступы
 *   </div>
 * </div>
 */
export function useBricksStyles(): void {
    const config = useBricksConfig();
    const cbp = config.canvasBreakpoints;
    const dbp = config.breakpoints;

    const desktopContainerProps = buildContainerProps(
        cbp.desktop,
        convertPxToRem(cbp.desktop.width ?? 1600),
        '2rem'
    );
    const tabletContainerProps = buildContainerProps(
        cbp.tablet,
        convertPxToRem(cbp.tablet.width ?? 768),
        '0.8rem'
    );
    const mobileContainerProps = buildContainerProps(
        cbp.mobile,
        convertPxToRem(cbp.mobile.width ?? 375),
        '0.4rem'
    );

    const styleContent = `
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

        /* Канвас: стили по выбранному viewport */
        .bricks-canvas[data-bricks-viewport="desktop"] .bricks-container {
            ${desktopContainerProps}
        }

        .bricks-canvas[data-bricks-viewport="tablet"] .bricks-container {
            ${tabletContainerProps}
        }

        .bricks-canvas[data-bricks-viewport="mobile"] .bricks-container {
            ${mobileContainerProps}
        }

        /* Published-страница: те же значения через media queries по device breakpoints */
        @media (min-width: ${dbp.desktop}px) {
            .bricks-container:where(:not(.bricks-canvas *)) {
                ${desktopContainerProps}
            }
        }

        @media (min-width: ${dbp.tablet}px) and (max-width: ${dbp.desktop - 1}px) {
            .bricks-container:where(:not(.bricks-canvas *)) {
                ${tabletContainerProps}
            }
        }

        @media (max-width: ${dbp.tablet - 1}px) {
            .bricks-container:where(:not(.bricks-canvas *)) {
                ${mobileContainerProps}
            }
        }`;

    // Инъекция сгенерированных стилей в <head> через useHead
    useHead({
        style: [
            {
                innerHTML: styleContent,
            },
        ],
    });
}
