// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TBricksResolvedDeviceSet } from '../../src/runtime/modules/common/types/devices';

// Constants
import { DEFAULT_BRICKS_DEVICES } from '../../src/runtime/modules/common/constants/devices';

// Utils
import { resolveDeviceSet } from '../../src/runtime/modules/common/utils/bricks/devices';
import { buildBricksContainerCss } from '../../src/runtime/modules/common/utils/bricks/containerCss';
import { buildDeviceVisibilityCss } from '../../src/runtime/modules/layouts-blocks/utils/deviceVisibilityCss';
// #endregion

const TRIO: TBricksResolvedDeviceSet = resolveDeviceSet(null, DEFAULT_BRICKS_DEVICES).devices;

/** Набор с ноутбуком: он забирает хвост планшетного диапазона. */
const QUARTET: TBricksResolvedDeviceSet = resolveDeviceSet(
    [
        { key: 'mobile', label: 'Мобильный', icon: 'device-mobile', width: 375, aside: 0.4 },
        { key: 'tablet', label: 'Планшет', icon: 'device-tablet', width: 768, aside: 0.8 },
        { key: 'laptop', label: 'Ноутбук', icon: 'device-laptop', width: 1280, aside: 1.2 },
        {
            key: 'desktop',
            label: 'Десктоп',
            icon: 'device-desktop',
            width: 1600,
            aside: 2,
            maxWidth: 192,
        },
    ],
    DEFAULT_BRICKS_DEVICES
).devices;

describe('buildBricksContainerCss', () => {
    it('канвас адресуется атрибутом устройства, published — диапазоном', () => {
        const css = buildBricksContainerCss(TRIO);

        expect(css).toContain('.bricks-canvas[data-bricks-viewport="mobile"] .bricks-container');
        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('.bricks-container:where(:not(.bricks-canvas *))');
    });

    it('published-правила огорожены от канваса', () => {
        // Без guard'а media-query по ширине ОКНА перетирала бы раскладку листа:
        // канвас — лист фиксированной ширины внутри окна другой ширины
        const canvasRules = buildBricksContainerCss(TRIO).split('@media').slice(1).join('@media');

        expect(canvasRules).not.toContain('.bricks-canvas[data-bricks-viewport');
    });

    it('rem-величины пишутся числом из набора, а не строкой из БД', () => {
        const css = buildBricksContainerCss(TRIO);

        expect(css).toContain('padding: 0 0.4rem;');
        expect(css).toContain('padding: 0 2rem;');
        expect(css).toContain('max-width: 192rem;');
    });

    it('без maxWidth ширина контейнера выводится из ширины устройства', () => {
        // 768px листа → 76.8rem: при rem-базе 10px это та же ширина
        expect(buildBricksContainerCss(TRIO)).toContain('max-width: 76.8rem;');
    });

    it('четвёртое устройство режет диапазон, а не добавляется поверх', () => {
        const css = buildBricksContainerCss(QUARTET);

        expect(css).toContain('@media (min-width: 768px) and (max-width: 1279px)');
        expect(css).toContain('@media (min-width: 1280px) and (max-width: 1599px)');
        expect(css).not.toContain('@media (min-width: 768px) and (max-width: 1599px)');
    });
});

describe('buildDeviceVisibilityCss', () => {
    it('строит классы по ключам набора для обеих поверхностей', () => {
        const css = buildDeviceVisibilityCss(QUARTET);

        expect(css).toContain('.bricks-canvas[data-bricks-viewport="laptop"] .bricks-hide--laptop');
        expect(css).toContain('.bricks-hide--laptop:not(.bricks-canvas *)');
    });

    it('скрытие остаётся !important: класс конкурирует с инлайновым display блоков', () => {
        // Grid, Flex и Section ставят `display` в `style` элемента при рендере —
        // без !important скрытие у них молча перестало бы работать
        expect(buildDeviceVisibilityCss(TRIO)).toContain('display: none !important');
    });

    it('у самого узкого устройства нет нижней границы, у широкого — верхней', () => {
        const css = buildDeviceVisibilityCss(TRIO);

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('@media (min-width: 1600px)');
    });
});
