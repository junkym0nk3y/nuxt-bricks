// #region Imports
// Node
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Sass
import { compileString } from 'sass';
// #endregion

const PUBLIC_SCSS_DIR = dirname(
    fileURLToPath(new URL('../../src/runtime/assets/scss/public/mixins.scss', import.meta.url))
);

/**
 * Компилирует SCSS с подключёнными миксинами пакета.
 *
 * Настоящая компиляция, а не сравнение строк: миксин раскрывается в две ветки,
 * и ошибку в границах диапазона видно только в готовом CSS.
 *
 * @param body - Тело таблицы стилей.
 * @param devices - Карта устройств проекта.
 * @returns Скомпилированный CSS.
 */
function compile(body: string, devices = '(mobile: 375, tablet: 768, desktop: 1600)'): string {
    return compileString(`@use 'mixins' as bricks with ($devices: ${devices});\n${body}`, {
        loadPaths: [PUBLIC_SCSS_DIR],
    }).css;
}

describe('SCSS-миксины адаптива', () => {
    it('bricks-up даёт обе ветки: окно и лист канваса', () => {
        const css = compile('.A { @include bricks.bricks-up(tablet) { color: red; } }');

        // Ветка окна огорожена: без guard'а правило протекло бы в канвас, где
        // ширина окна к раскладке листа отношения не имеет
        expect(css).toContain('@media (min-width: 768px)');
        expect(css).toContain('.A:where(:not([class~=bricks-canvas] *))');
        // Ветка канваса: `transform: scale()` на размер контейнера не влияет,
        // поэтому лист отдаёт честную ширину
        expect(css).toContain('@container bricks (min-width: 768px)');
    });

    it('bricks-down не включает саму границу', () => {
        const css = compile('.A { @include bricks.bricks-down(tablet) { color: red; } }');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('@container bricks (max-width: 767px)');
    });

    it('bricks-only считает верхнюю границу по следующему устройству', () => {
        const css = compile(
            '.A { @include bricks.bricks-only(laptop) { color: red; } }',
            '(mobile: 375, tablet: 768, laptop: 1280, desktop: 1600)'
        );

        expect(css).toContain('@media (min-width: 1280px) and (max-width: 1599px)');
        expect(css).toContain('@container bricks (min-width: 1280px) and (max-width: 1599px)');
    });

    it('bricks-only у самого узкого устройства нижней границы не ставит', () => {
        // Ступень самого узкого устройства начинается от нуля — так её считает
        // `deviceRanges` в рантайме. С `min-width: 375px` окно 360 на published
        // осталось бы без правила, хотя лист 375 в билдере его получал
        const css = compile('.A { @include bricks.bricks-only(mobile) { color: red; } }');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('@container bricks (max-width: 767px)');
        expect(css).not.toContain('min-width');
    });

    it('bricks-hide-only у самого узкого устройства скрывает и на 320', () => {
        const css = compile('.A { @include bricks.bricks-hide-only(mobile); }');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).not.toContain('min-width');
    });

    it('bricks-only у самого широкого устройства верхней границы не ставит', () => {
        const css = compile('.A { @include bricks.bricks-only(desktop) { color: red; } }');

        expect(css).toContain('@media (min-width: 1600px)');
        expect(css).not.toContain('max-width');
    });

    it('карта проекта перекрывает дефолт: границы считаются по ней', () => {
        const css = compile(
            '.A { @include bricks.bricks-up(tablet) { color: red; } }',
            '(mobile: 375, tablet: 900, desktop: 1600)'
        );

        expect(css).toContain('@media (min-width: 900px)');
        expect(css).not.toContain('768px');
    });

    it('неизвестный ключ устройства валит сборку, а не пропускается молча', () => {
        expect(() => compile('.A { @include bricks.bricks-up(watch) { color: red; } }')).toThrow(
            /unknown device "watch"/
        );
    });

    it('guard окна не содержит класса, который CSS Modules переписал бы', () => {
        // Миксин раскрывается в блоке стилей потребителя, а там обычно
        // `<style module>`: голый `.bricks-canvas` в guard'е превращался в
        // `._bricks-canvas_<hash>` и не совпадал ни с чем. Оконная ветка
        // переставала отсекаться, и брик на узком листе получал раскладку по
        // ширине окна — ровно то, ради чего миксины и заведены
        const css = compile('.A { @include bricks.bricks-up(tablet) { color: red; } }');

        expect(css).not.toMatch(/\.bricks-canvas/);
    });

    it('хелперы видимости раскрываются в те же две ветки', () => {
        const css = compile('.A { @include bricks.bricks-hide-down(tablet); }');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('@container bricks (max-width: 767px)');
        expect(css).toContain('display: none');
    });
});
