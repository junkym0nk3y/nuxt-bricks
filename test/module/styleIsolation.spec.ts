// #region Imports
// Node
import { fileURLToPath } from 'node:url';

// Sass
import { compile } from 'sass';

// Vitest
import { describe, expect, it } from 'vitest';
// #endregion

const SCSS_DIR = fileURLToPath(new URL('../../src/runtime/assets/scss/', import.meta.url));

/**
 * Компилирует scss-entry модуля (та же тройка, что module.ts пушит в nuxt.options.css).
 *
 * @param entry - Путь entry относительно assets/scss.
 * @returns Скомпилированный CSS.
 */
function compileStylesheet(entry: string): string {
    return compile(`${SCSS_DIR}${entry}`, { loadPaths: [SCSS_DIR] }).css;
}

interface ICssRule {
    selector: string;
    body: string;
}

/**
 * Разбивает список селекторов по top-level запятым (запятые внутри
 * `:where(...)`/`:is(...)` не считаются разделителями).
 *
 * @param selectorList - Полный selector list правила.
 * @returns Отдельные селекторы.
 */
function splitSelectorList(selectorList: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let buffer = '';

    for (const char of selectorList) {
        if (char === '(') {
            depth += 1;
        }

        if (char === ')') {
            depth -= 1;
        }

        if (char === ',' && depth === 0) {
            result.push(buffer.trim());
            buffer = '';
        } else {
            buffer += char;
        }
    }

    if (buffer.trim()) {
        result.push(buffer.trim());
    }

    return result;
}

/**
 * Извлекает все style-правила из CSS (включая вложенные в @layer/@media),
 * раскрывая comma-списки в отдельные селекторы.
 *
 * @param css - Скомпилированный CSS.
 * @returns Правила с селектором и телом деклараций.
 */
function extractRules(css: string): ICssRule[] {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules: ICssRule[] = [];
    const preludeStack: string[] = [];
    let buffer = '';
    let bodyBuffer = '';
    let collectingBody = false;

    for (const char of withoutComments) {
        if (char === '{') {
            const prelude = buffer.trim();
            preludeStack.push(prelude);
            buffer = '';
            collectingBody = !prelude.startsWith('@');
            bodyBuffer = '';
        } else if (char === '}') {
            const prelude = preludeStack.pop() ?? '';
            // Keyframe-селекторы (`from`/`to`/`50%`) не матчат элементы страницы —
            // изоляцию для них проверяет отдельный тест по имени @keyframes.
            const insideKeyframes = preludeStack.some((entry) => entry.startsWith('@keyframes'));

            if (!insideKeyframes && !prelude.startsWith('@') && prelude !== '') {
                for (const selector of splitSelectorList(prelude)) {
                    rules.push({ selector, body: bodyBuffer.trim() });
                }
            }

            buffer = '';
            bodyBuffer = '';
            collectingBody = false;
        } else if (collectingBody) {
            bodyBuffer += char;
        } else {
            buffer += char;
        }
    }

    return rules;
}

/**
 * Проверяет, что селектор заскоуплен в поверхность модуля: его первый compound
 * содержит `bricks-`-маркер (класс/суффикс body-класса), в т.ч. внутри
 * `:where(...)`/`:is(...)`. Голые element/universal-селекторы и немаркированные
 * классы поверхностью не считаются.
 *
 * @param selector - Один селектор (без запятых верхнего уровня).
 * @returns true, если правило не может сматчить элементы host-страницы.
 */
function isScopedToBricksSurface(selector: string): boolean {
    const firstCompound = selector.split(/\s+/)[0] ?? '';

    return firstCompound.includes('.bricks-') || firstCompound.includes('body.bricks-');
}

describe('изоляция стилей от host-приложения', () => {
    const defaultCss = compileStylesheet('default.scss');
    const bundleCss = compileStylesheet('bundle.scss');
    const fontsCss = compileStylesheet('common/fonts.scss');

    it('default.scss: каждый селектор заскоуплен в bricks-поверхность', () => {
        const rules = extractRules(defaultCss);
        expect(rules.length).toBeGreaterThan(50);

        const unscoped = rules
            .map((rule) => rule.selector)
            .filter((selector) => !isScopedToBricksSurface(selector));

        expect(unscoped).toEqual([]);
    });

    it('default.scss: порядок @layer фиксирует приоритет typography над reset', () => {
        // TipTap typography has to beat the reset, and both of them are layered:
        // between two layers neither specificity nor source order decides, only the
        // order the layers are declared in. Swapping the two names in the statement
        // is enough to strip the formatting of rich-text content.
        const firstLayerStatement = defaultCss.match(/@layer\s+([^;{]+);/);

        expect(firstLayerStatement?.[1].trim()).toBe('bricks-reset, bricks-typography');
        // Statement-декларация должна идти раньше первого layer-блока
        expect(defaultCss.indexOf('@layer bricks-reset, bricks-typography;')).toBeLessThan(
            defaultCss.indexOf('@layer bricks-reset {')
        );
    });

    it('default.scss: зона контента накрывает и канвас, и published одним правилом', () => {
        // Канвас билдера и published-страница должны получать идентичный reset —
        // общий селектор гарантирует это по построению.
        expect(defaultCss).toContain(':where(.bricks-canvas, body.bricks-render)');
        // Зона хрома не должна протекать в канвас
        expect(defaultCss).toContain(':not(:where(.bricks-canvas *))');
    });

    it('bundle.scss: :root только с --bricks-переменными, остальное — bricks-scoped', () => {
        const rules = extractRules(bundleCss);
        expect(rules.length).toBeGreaterThan(10);

        for (const rule of rules) {
            if (rule.selector === ':root') {
                // Глобальная область — допустимы только префиксованные переменные
                const declarations = rule.body
                    .split(';')
                    .map((declaration) => declaration.trim())
                    .filter(Boolean);

                for (const declaration of declarations) {
                    expect(declaration).toMatch(/^--bricks-/);
                }
            } else {
                expect(isScopedToBricksSurface(rule.selector)).toBe(true);
            }
        }
    });

    it('bundle.scss: имена @keyframes префиксованы, чтобы не перебить анимации host-проекта', () => {
        const names = Array.from(bundleCss.matchAll(/@keyframes\s+([\w-]+)/g)).map(
            (match) => match[1]
        );

        expect(names.filter((name) => !name.startsWith('bricks-'))).toEqual([]);
    });

    it('fonts.scss: только @font-face, без селекторов', () => {
        expect(extractRules(fontsCss)).toEqual([]);
        expect(fontsCss).toContain('@font-face');
    });
});
