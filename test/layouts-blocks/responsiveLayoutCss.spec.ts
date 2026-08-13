// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TBricksResolvedDeviceSet } from '../../src/runtime/modules/common/types/devices';

// Constants
import { DEFAULT_BRICKS_DEVICES } from '../../src/runtime/modules/common/constants/devices';

// Utils
import { resolveDeviceSet } from '../../src/runtime/modules/common/utils/bricks/devices';
import { buildResponsiveLayoutCss } from '../../src/runtime/modules/layouts-blocks/utils/responsiveCss';

// Registry
import { BLOCK_REGISTRY } from '../../src/runtime/modules/layouts-blocks/registry';
// #endregion

const TRIO: TBricksResolvedDeviceSet = resolveDeviceSet(null, DEFAULT_BRICKS_DEVICES).devices;

/** Набор с четвёртой ступенью: ноутбук закрывает диапазон 1280–1599. */
const QUARTET: TBricksResolvedDeviceSet = resolveDeviceSet(
    [
        { key: 'mobile', label: 'Мобильный', icon: 'device-mobile', width: 375, aside: 0.4 },
        { key: 'tablet', label: 'Планшет', icon: 'device-tablet', width: 768, aside: 0.8 },
        { key: 'laptop', label: 'Ноутбук', icon: 'device-laptop', width: 1280, aside: 1.2 },
        { key: 'desktop', label: 'Десктоп', icon: 'device-desktop', width: 1600, aside: 2 },
    ],
    DEFAULT_BRICKS_DEVICES
).devices;

const CSS = buildResponsiveLayoutCss(TRIO);

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
    it('дефолты читают базовое значение напрямую: база лежит в обычных пропах блока', () => {
        const expected: Record<string, string[]> = {
            grid: ['columns', 'rows', 'auto-rows', 'gap', 'auto-flow', 'lead-left', 'lead-right'],
            flex: ['direction', 'justify', 'wrap', 'gap'],
            section: ['pt', 'pb', 'px', 'radius', 'min-h'],
            space: ['size', 'divider-mx'],
            media: ['width', 'height', 'radius'],
            text: ['font-size'],
            slider: ['spv'],
        };

        for (const [prefix, vars] of Object.entries(expected)) {
            const body = ruleBody(CSS, `[data-bricks-layout="${prefix}"]`);
            expect(body, `defaults for ${prefix}`).toBeTruthy();
            for (const name of vars) {
                expect(body).toContain(
                    `--bricks-${prefix}-${name}: var(--bricks-${prefix}-${name}-base);`
                );
            }
        }
    });

    it('Svg шарит media-переменные под собственным селектором', () => {
        const body = ruleBody(CSS, '[data-bricks-layout="svg"]');
        expect(body).toBeTruthy();
        expect(body).toContain('--bricks-media-width: var(--bricks-media-width-base);');
        expect(body).toContain('--bricks-media-radius: var(--bricks-media-radius-base);');
    });

    it('правило устройства гасит свою переменную на элементе перед чтением', () => {
        // Custom properties наследуются: без сброса вложенный блок без своего
        // переопределения взял бы значение родителя того же типа, а fallback на
        // `-base` не сработал бы вовсе
        const body = ruleBody(
            CSS,
            '.bricks-canvas[data-bricks-viewport="mobile"] [data-bricks-layout="grid"]'
        );
        expect(body).toContain('--bricks-grid-columns-mobile: initial;');
        expect(body).toContain(
            '--bricks-grid-columns: var(--bricks-grid-columns-mobile, var(--bricks-grid-columns-base));'
        );
    });

    it('базовое устройство сброса не получает: у него своей переменной нет', () => {
        const body = ruleBody(
            CSS,
            '.bricks-canvas[data-bricks-viewport="desktop"] [data-bricks-layout="grid"]'
        );
        expect(body).toContain('--bricks-grid-columns: var(--bricks-grid-columns-base);');
        expect(body).not.toContain('--bricks-grid-columns-desktop');
    });

    it('генерирует builder-правила для каждого устройства набора', () => {
        for (const device of TRIO) {
            const body = ruleBody(
                CSS,
                `.bricks-canvas[data-bricks-viewport="${device.key}"] [data-bricks-layout="flex"]`
            );
            expect(body, `builder flex ${device.key}`).toBeTruthy();
        }
    });

    it('published media queries покрывают 0..∞ без дыр', () => {
        expect(CSS).toContain('@media (max-width: 767px)');
        expect(CSS).toContain('@media (min-width: 768px) and (max-width: 1599px)');
        expect(CSS).toContain('@media (min-width: 1600px)');
    });

    it('четвёртое устройство разрезает планшетный диапазон, а не добавляется поверх', () => {
        const css = buildResponsiveLayoutCss(QUARTET);

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('@media (min-width: 768px) and (max-width: 1279px)');
        expect(css).toContain('@media (min-width: 1280px) and (max-width: 1599px)');
        expect(css).toContain('@media (min-width: 1600px)');
        // Прежний планшетный диапазон до 1599 исчез: его хвост забрал ноутбук
        expect(css).not.toContain('@media (min-width: 768px) and (max-width: 1599px)');
    });

    it('произвольный ключ устройства попадает и в канвас, и в media query', () => {
        const css = buildResponsiveLayoutCss(QUARTET);

        expect(css).toContain('.bricks-canvas[data-bricks-viewport="laptop"]');
        expect(css).toContain(
            '--bricks-grid-columns: var(--bricks-grid-columns-laptop, var(--bricks-grid-columns-base));'
        );
    });

    it('не генерирует правил для блоков без responsiveCssVars', () => {
        for (const name of ['title', 'accordion']) {
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
            'Slider',
            'Space',
            'Svg',
            'Text',
        ]);
        for (const def of withVars) {
            expect(CSS).toContain(`[data-bricks-layout="${def.name.toLowerCase()}"]`);
        }
    });
});
