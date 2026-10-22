// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Extractor
import { extractBrickMetadata } from '../../src/brick-metadata';
// #endregion

/**
 * Метаданные брика раньше добывались регуляркой по исходнику: она находила
 * `category` даже в комментарии, а `category: SOME_CONST` молча превращала в
 * дефолтную категорию. Теперь значения читаются из AST, и всё, чего разбор без
 * исполнения модуля знать не может, обязано ронять сборку с указанием файла и
 * поля — иначе в манифест уедет не то, что написано в brick-файле.
 */

const FILE = '/project/components/Card.brick.ts';

/**
 * Разбирает исходник brick-файла.
 *
 * @param source - Содержимое `*.brick.ts`.
 * @returns Извлечённые метаданные.
 */
function extract(source: string) {
    return extractBrickMetadata(FILE, source);
}

describe('метаданные brick-файла: разбор литералов', () => {
    it('читает четыре поля, разворачивает as const satisfies и нормализует слоты', () => {
        const metadata = extract(`
            import Card from './Card.vue';

            export const brick = {
                category: 'Marketing',
                description: \`Карточка\`,
                values: { gap: { type: 'input', default: -1.5 } },
                slots: ['header', { name: 'body', label: 'Тело', allowMultiple: false }],
            } as const satisfies Record<string, unknown>;

            export default Card;
        `);

        expect(metadata).toEqual({
            category: 'Marketing',
            // Шаблон без подстановок — обычная строка, записанная иначе
            description: 'Карточка',
            // Отрицательное число приходит унарным минусом, а не литералом
            values: { gap: { type: 'input', default: -1.5 } },
            // Обе формы записи слотов приводятся к одной здесь: в рантайме
            // разбирать сырые варианты больше некому
            slots: [
                { name: 'header', label: 'header', description: undefined, allowMultiple: true },
                { name: 'body', label: 'Тело', description: undefined, allowMultiple: false },
            ],
        });
    });

    it('слоты объектной формой берут имя из ключа', () => {
        const metadata = extract(
            `export const brick = { values: {}, slots: { header: { allowMultiple: false } } };`
        );

        expect(metadata.slots).toEqual([
            { name: 'header', label: 'header', description: undefined, allowMultiple: false },
        ]);
    });

    it('функции dataSources разбор не трогает', () => {
        const metadata = extract(`
            export const brick = {
                category: 'Data',
                values: {},
                dataSources: [{ name: 'items', resolve: async () => fetch('/api') }],
            };
        `);

        expect(metadata.category).toBe('Data');
    });

    it('категория без значения — дефолтная', () => {
        expect(extract(`export const brick = { values: {} };`).category).toBe('Common');
    });

    it.each([
        ['категория из константы', `export const brick = { category: CATEGORY, values: {} };`],
        ['values из константы', `export const brick = { values: VALUES };`],
        ['spread на верхнем уровне', `export const brick = { ...base, values: {} };`],
        ['вычисляемый ключ', `export const brick = { values: { [name]: { type: 'input' } } };`],
        [
            'подстановка в шаблоне',
            'export const brick = { description: `Привет, ${name}`, values: {} };',
        ],
        [
            'ключ __proto__ в глубине',
            `export const brick = { values: { a: { default: { __proto__: 1 } } } };`,
        ],
        // В объектном литерале это установка прототипа: исполненный модуль
        // показал бы унаследованные category/dataSources, которых разбор не видит
        [
            'ключ __proto__ на верхнем уровне',
            `export const brick = { __proto__: { category: 'Hidden' }, values: {} };`,
        ],
        // JSON не переживает ни бесконечности, ни -0: значение по умолчанию
        // молча менялось бы при публикации манифеста
        ['число вне диапазона JSON', `export const brick = { values: { a: { default: 1e999 } } };`],
        ['минус ноль', `export const brick = { values: { a: { default: -0 } } };`],
        // Разбор читает объявление, а переприсваивание ниже меняет то, что
        // увидит рантайм
        ['объявление через let', `export let brick = { category: 'A', values: {} };`],
        ['values не запись объектов', `export const brick = { values: { a: 'input' } };`],
        ['нет объявления brick', `export default {};`],
        ['нет values', `export const brick = { category: 'A' };`],
    ])('%s роняет сборку с указанием файла', (_case, source) => {
        expect(() => extract(source)).toThrowError(new RegExp(FILE));
    });

    it('сообщение показывает путь до поля и место в файле', () => {
        expect(() =>
            extract(`export const brick = {\n    values: { headline: { default: TITLE } },\n};`)
        ).toThrowError(/2:\d+ — brick\.values\.headline\.default/);
    });
});
