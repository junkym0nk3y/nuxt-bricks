// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { buildResponsiveLayoutCss } from '../../src/runtime/modules/layouts-blocks/utils/responsiveCss';

// Registry
import { BLOCK_REGISTRY } from '../../src/runtime/modules/layouts-blocks/registry';
// #endregion

const CSS = buildResponsiveLayoutCss({ tabletMin: 768, desktopMin: 1600 });

/**
 * Извлекает декларации правила по селектору (первое вхождение вне media query).
 *
 * @param css - Сгенерированный CSS.
 * @param selector - Точный селектор правила.
 * @returns Тело правила или null.
 */
function ruleBody(css: string, selector: string): string | null {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : null;
}

describe('buildResponsiveLayoutCss', () => {
    it('генерирует desktop-дефолты для всех блоков с responsiveCssVars', () => {
        const expected: Record<string, string[]> = {
            grid: ['columns', 'rows', 'auto-rows', 'gap', 'auto-flow', 'lead-left', 'lead-right'],
            flex: ['direction', 'justify', 'wrap', 'gap'],
            section: ['pt', 'pb', 'px', 'radius', 'min-h'],
            space: ['size', 'divider-mx'],
            media: ['width', 'height', 'radius'],
        };

        for (const [prefix, vars] of Object.entries(expected)) {
            const body = ruleBody(CSS, `[data-bricks-layout="${prefix}"]`);
            expect(body, `defaults for ${prefix}`).toBeTruthy();
            for (const name of vars) {
                expect(body).toContain(
                    `--bricks-${prefix}-${name}: var(--bricks-${prefix}-${name}-desktop);`
                );
            }
        }
    });

    it('Svg шарит media-переменные под собственным селектором', () => {
        const body = ruleBody(CSS, '[data-bricks-layout="svg"]');
        expect(body).toBeTruthy();
        expect(body).toContain('--bricks-media-width: var(--bricks-media-width-desktop);');
        expect(body).toContain('--bricks-media-radius: var(--bricks-media-radius-desktop);');
    });

    it('генерирует builder-правила для всех трёх viewport', () => {
        for (const device of ['mobile', 'tablet', 'desktop']) {
            const body = ruleBody(
                CSS,
                `.bricks-canvas[data-bricks-viewport="${device}"] [data-bricks-layout="flex"]`
            );
            expect(body, `builder flex ${device}`).toBeTruthy();
            expect(body).toContain(`--bricks-flex-gap: var(--bricks-flex-gap-${device});`);
        }
    });

    it('генерирует published media queries с корректными границами', () => {
        expect(CSS).toContain('@media (max-width: 767px)');
        expect(CSS).toContain('@media (min-width: 768px) and (max-width: 1599px)');
        expect(CSS).toContain('@media (min-width: 1600px)');
    });

    it('не генерирует правил для блоков без responsiveCssVars', () => {
        for (const name of ['slider', 'title', 'text', 'accordion']) {
            expect(CSS).not.toContain(`[data-bricks-layout="${name}"]`);
        }
    });

    it('покрывает все definitions с responsiveCssVars из registry', () => {
        const withVars = Object.values(BLOCK_REGISTRY).filter((def) => def.responsiveCssVars);
        expect(withVars.map((def) => def.name).sort()).toEqual([
            'Flex',
            'Grid',
            'Media',
            'Section',
            'Space',
            'Svg',
        ]);
        for (const def of withVars) {
            expect(CSS).toContain(`[data-bricks-layout="${def.name.toLowerCase()}"]`);
        }
    });
});
