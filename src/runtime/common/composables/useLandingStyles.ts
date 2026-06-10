// #region Imports
// Types
import type { ILandingBreakpointConfig } from '../types/config';

// Nuxt
import { useHead } from 'nuxt/app';

// Composables
import { useLandingConfig } from './useLandingConfig';

// Utils
import { convertPxToRem } from '../utils/main';
// #endregion

/**
 * Возвращает CSS-свойства контейнера для breakpoint.
 */
function buildContainerProps(
    bp: ILandingBreakpointConfig,
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
 * Генерирует CSS для переопределения .container на published-странице.
 * Применяется только для breakpoints с overrideContainer: true.
 * Использует media queries на основе device breakpoints.
 */
function buildContainerOverrideCss(
    cbp: {
        mobile: ILandingBreakpointConfig;
        tablet: ILandingBreakpointConfig;
        desktop: ILandingBreakpointConfig;
    },
    deviceBreakpoints: { mobile: number; tablet: number; desktop: number }
): string {
    const hasOverride =
        cbp.desktop.overrideContainer ||
        cbp.tablet.overrideContainer ||
        cbp.mobile.overrideContainer;

    if (!hasOverride) {
        return '';
    }

    let css = `
        /* Override .container на published-странице */
        .container[data-bricks-container] {
            width: 100%;
            margin: 0 auto;
        }`;

    if (cbp.desktop.overrideContainer) {
        const aside = cbp.desktop.aside ?? '2rem';
        const { maxWidth, minWidth } = cbp.desktop;
        css += `

        @media (min-width: ${deviceBreakpoints.desktop}px) {
            .container[data-bricks-container] {
                padding: 0 ${aside};${maxWidth ? `\n                max-width: ${maxWidth};` : ''}${minWidth ? `\n                min-width: ${minWidth};` : ''}
            }
        }`;
    }

    if (cbp.tablet.overrideContainer) {
        const aside = cbp.tablet.aside ?? '0.8rem';
        const { maxWidth, minWidth } = cbp.tablet;
        css += `

        @media (min-width: ${deviceBreakpoints.tablet}px) and (max-width: ${deviceBreakpoints.desktop - 1}px) {
            .container[data-bricks-container] {
                padding: 0 ${aside};${maxWidth ? `\n                max-width: ${maxWidth};` : ''}${minWidth ? `\n                min-width: ${minWidth};` : ''}
            }
        }`;
    }

    if (cbp.mobile.overrideContainer) {
        const aside = cbp.mobile.aside ?? '0.4rem';
        const { maxWidth, minWidth } = cbp.mobile;
        css += `

        @media (max-width: ${deviceBreakpoints.tablet - 1}px) {
            .container[data-bricks-container] {
                padding: 0 ${aside};${maxWidth ? `\n                max-width: ${maxWidth};` : ''}${minWidth ? `\n                min-width: ${minWidth};` : ''}
            }
        }`;
    }

    return css;
}

/**
 * Composable для инъекции динамических стилей лендинга в <head>
 *
 * Генерирует CSS с Container Queries на основе конфигурации canvas breakpoints:
 * - desktop (1920px) - maxWidth: 1600px (или настраиваемый), aside: 2rem
 * - tablet (768px) - maxWidth: 768px (или настраиваемый), aside: 0.8rem
 * - mobile (375px) - maxWidth: 375px (или настраиваемый), aside: 0.4rem
 *
 * Container queries применяются к .landing-canvas элементу, что позволяет
 * компонентам внутри канваса адаптироваться к размеру viewport без медиа-запросов.
 *
 * Класс .container получает:
 * - max-width для ограничения ширины контента
 * - padding (aside) для боковых отступов
 *
 * При наличии overrideContainer: true в breakpoint, дополнительно генерирует
 * CSS с media queries для переопределения проектного .container на published-странице
 * через селектор .container[data-bricks-container].
 *
 * @example
 * // В компоненте или странице
 * useLandingStyles();
 *
 * // В HTML
 * <div class="landing-canvas" data-landing-viewport="desktop">
 *   <div class="container">
 *     Контент ограничен max-width и имеет боковые отступы
 *   </div>
 * </div>
 */
export function useLandingStyles() {
    const config = useLandingConfig();
    const cbp = config.canvasBreakpoints;

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

    /**
     * CSS контент с Container Queries для адаптивных стилей
     *
     * Настройка:
     * 1. .landing-canvas - определяет контейнер для Container Queries (inline-size)
     * 2. .container - базовые стили для контейнера контента (width: 100%, margin: auto)
     * 3. [data-landing-viewport="desktop/tablet/mobile"] .container - применяет
     *    max-width и padding в зависимости от выбранного viewport
     *
     * Container Queries вместо Media Queries позволяют компонентам адаптироваться
     * к размеру канваса, а не размеру окна браузера, что критично для превью в билдере.
     */
    let styleContent = `
        /* Канвас как контейнер для Container Queries */
        .landing-canvas {
            container-type: inline-size;
            container-name: landing;
        }

        .landing-canvas .container {
            width: 100%;
            margin: 0 auto;
        }

        .landing-canvas[data-landing-viewport="desktop"] .container {
            ${desktopContainerProps}
        }

        .landing-canvas[data-landing-viewport="tablet"] .container {
            ${tabletContainerProps}
        }

        .landing-canvas[data-landing-viewport="mobile"] .container {
            ${mobileContainerProps}
        }`;

    // Добавляем override CSS для published-страницы если задан overrideContainer
    styleContent += buildContainerOverrideCss(cbp, config.breakpoints);

    // Инъекция сгенерированных стилей в <head> через useHead
    useHead({
        style: [
            {
                innerHTML: styleContent,
            },
        ],
    });
}
