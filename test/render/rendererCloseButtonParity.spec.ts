/**
 * Паритет кнопки закрытия в `render` с кнопкой кита.
 *
 * `render` не импортирует `ui` (правило render-lean: кит не должен уезжать в
 * бандл published-страницы ради одной кнопки), поэтому у неё живёт копия. Копия
 * уже однажды отстала: радиус `md` с рамкой `base-300` против `control` без
 * рамки, ховер заливкой вместо смены цвета глифа, отсутствие рамки фокуса — и
 * заметить это было нечем, потому что обе кнопки по отдельности выглядят
 * рабочими.
 *
 * Сравнивается НЕ текст файлов, а разобранное правило корневого класса целиком:
 * объявления верхнего уровня И вложенные блоки состояний. Сравнение только
 * верхнего уровня пропускало бы ровно ту регрессию, из-за которой спека и
 * появилась: ховер у копии был заливкой, а у кита — сменой цвета глифа, и оба
 * живут во вложенных блоках.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// #endregion

// #region Interfaces
interface IParsedRule {
    /** Объявления верхнего уровня: `свойство → значение` */
    declarations: Record<string, string>;
    /** Вложенные блоки: `селектор → объявления` */
    nested: Record<string, Record<string, string>>;
}
// #endregion

const KIT_PATH = 'src/runtime/modules/ui/base/modal/BricksCloseButton.vue';
const COPY_PATH = 'src/runtime/modules/render/components/RendererCloseButton.vue';

/**
 * Вырезает тело правила `.<rootClass> { … }` с учётом вложенных скобок.
 *
 * @param source - Содержимое SFC.
 * @param rootClass - Имя корневого класса.
 * @returns Тело правила без внешних скобок.
 */
function extractRuleBody(source: string, rootClass: string): string {
    const start = source.indexOf(`.${rootClass} {`);

    expect(start).toBeGreaterThan(-1);

    const bodyStart = source.indexOf('{', start) + 1;
    let depth = 1;
    let index = bodyStart;

    while (index < source.length && depth > 0) {
        if (source[index] === '{') {
            depth += 1;
        } else if (source[index] === '}') {
            depth -= 1;
        }

        index += 1;
    }

    return source.slice(bodyStart, index - 1);
}

/**
 * Разбирает тело правила на объявления верхнего уровня и вложенные блоки.
 *
 * Комментарии выкидываются: у копии они свои по определению. Многострочные
 * значения (`transition` в несколько строк) склеиваются в одну строку — иначе
 * одинаковые по смыслу значения различались бы вёрсткой файла.
 *
 * @param body - Тело правила.
 * @returns Объявления и вложенные блоки.
 */
function parseRule(body: string): IParsedRule {
    const cleaned = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');
    const parsed: IParsedRule = { declarations: {}, nested: {} };

    let index = 0;
    let buffer = '';

    /**
     * Кладёт накопленное объявление в карту.
     *
     * @param target - Куда писать.
     */
    function flush(target: Record<string, string>): void {
        const text = buffer.replace(/\s+/g, ' ').trim();
        buffer = '';

        if (!text || !text.includes(':')) {
            return;
        }

        const [property, ...rest] = text.split(':');
        target[property.trim()] = rest.join(':').trim();
    }

    while (index < cleaned.length) {
        const char = cleaned[index];

        if (char === ';') {
            flush(parsed.declarations);
            index += 1;
            continue;
        }

        if (char === '{') {
            const selector = buffer.replace(/\s+/g, ' ').trim();
            buffer = '';

            let depth = 1;
            let cursor = index + 1;

            while (cursor < cleaned.length && depth > 0) {
                if (cleaned[cursor] === '{') {
                    depth += 1;
                } else if (cleaned[cursor] === '}') {
                    depth -= 1;
                }

                cursor += 1;
            }

            const inner = parseRule(cleaned.slice(index + 1, cursor - 1));

            parsed.nested[selector] = inner.declarations;

            for (const [innerSelector, innerDeclarations] of Object.entries(inner.nested)) {
                parsed.nested[`${selector} ${innerSelector}`] = innerDeclarations;
            }

            index = cursor;
            continue;
        }

        buffer += char;
        index += 1;
    }

    flush(parsed.declarations);

    return parsed;
}

/**
 * Разбирает корневое правило кнопки в файле.
 *
 * @param path - Путь к SFC от корня репозитория.
 * @param rootClass - Имя корневого класса.
 * @returns Разобранное правило.
 */
function readRule(path: string, rootClass: string): IParsedRule {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');

    return parseRule(extractRuleBody(source, rootClass));
}

const kit = readRule(KIT_PATH, 'BricksCloseButton');
const copy = readRule(COPY_PATH, 'RendererCloseButton');

describe('RendererCloseButton: паритет с BricksCloseButton', () => {
    it('объявления верхнего уровня совпадают', () => {
        expect(copy.declarations).toEqual(kit.declarations);
    });

    it('состояния описаны теми же селекторами', () => {
        expect(Object.keys(copy.nested).sort()).toEqual(Object.keys(kit.nested).sort());
    });

    it.each(['&:not(:disabled):hover', '&:focus-visible', '&:disabled', 'svg'])(
        'блок %s совпадает',
        (selector) => {
            expect(copy.nested[selector]).toEqual(kit.nested[selector]);
        }
    );
});
