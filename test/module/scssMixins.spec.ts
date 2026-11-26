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
    it('bricks-up спрашивает ступень по имени, а окно огораживает от канваса и страницы', () => {
        const css = compile('.A { @include bricks.bricks-up(tablet) { color: red; } }');

        // The container branch carries no px: which names are active is decided by
        // the device set of the page, so the project numbers do not leak into it
        expect(css).toContain('@container bricks-up-tablet (min-width: 0)');
        expect(css).not.toMatch(/@container[^{]*768/);
        // The window branch is for a consumer page only: the canvas sheet and the
        // module page root answer by names
        expect(css).toContain('@media (min-width: 768px)');
        expect(css).toContain('.A:where(:not([class~=bricks-canvas] *, [data-bricks-page] *))');
    });

    it('bricks-down не включает саму границу', () => {
        const css = compile('.A { @include bricks.bricks-down(tablet) { color: red; } }');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('@container bricks-down-tablet (min-width: 0)');
    });

    it('bricks-between вкладывает два именованных контейнера', () => {
        const css = compile(
            '.A { @include bricks.bricks-between(tablet, desktop) { color: red; } }'
        );

        expect(css).toMatch(
            /@container bricks-up-tablet \(min-width: 0\) \{\s*@container bricks-down-desktop \(min-width: 0\) \{\s*\.A \{/
        );
        expect(css).toContain('@media (min-width: 768px) and (max-width: 1599px)');
    });

    it('bricks-only считает верхнюю границу по следующему устройству', () => {
        const css = compile(
            '.A { @include bricks.bricks-only(laptop) { color: red; } }',
            '(mobile: 375, tablet: 768, laptop: 1280, desktop: 1600)'
        );

        expect(css).toContain('@media (min-width: 1280px) and (max-width: 1599px)');
        expect(css).toContain('@container bricks-only-laptop (min-width: 0)');
    });

    it('ключ каталога вне карты проекта — ступень нулевой ширины в ветке окна', () => {
        // The default project has no laptop, while a page set may: the mixin compiles,
        // and its window branch puts the boundary on the next project device
        const up = compile('.A { @include bricks.bricks-up(laptop) { color: red; } }');
        const only = compile('.A { @include bricks.bricks-only(laptop) { color: red; } }');

        expect(up).toContain('@media (min-width: 1600px)');
        expect(up).toContain('@container bricks-up-laptop (min-width: 0)');
        expect(only).not.toContain('@media');
        expect(only).toContain('@container bricks-only-laptop (min-width: 0)');
    });

    it('bricks-only у самого узкого устройства нижней границы не ставит', () => {
        // Ступень самого узкого устройства начинается от нуля — так её считает
        // `deviceRanges` в рантайме. С `min-width: 375px` окно 360 на published
        // осталось бы без правила, хотя лист 375 в билдере его получал
        const css = compile('.A { @include bricks.bricks-only(mobile) { color: red; } }');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toContain('@container bricks-only-mobile (min-width: 0)');
        expect(css).not.toMatch(/@media[^{]*min-width/);
    });

    it('bricks-hide-only у самого узкого устройства скрывает и на 320', () => {
        const css = compile('.A { @include bricks.bricks-hide-only(mobile); }');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).not.toMatch(/@media[^{]*min-width/);
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
        expect(css).toContain('@container bricks-down-tablet (min-width: 0)');
        expect(css).toContain('display: none');
    });
});
