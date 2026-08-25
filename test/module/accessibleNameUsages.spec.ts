/**
 * Подписи у контролов, которые сами себя назвать не могут.
 *
 * Что здесь сторожится: подпись легко забыть в новом месте использования, и
 * забытая возвращает ровно тот дефект, ради которого возможность подписать
 * заводилась. Поведение самих компонентов проверяет
 * `test/ui/bricksAccessibleNames.spec.ts`; здесь — разметка потребителей, потому
 * что монтировать ради одного атрибута пять тяжёлых модалок и панелей дороже,
 * чем прочитать их шаблоны.
 *
 * `BricksCloseButton` в список не входит: он даёт себе имя сам, и подпись
 * снаружи ему нужна только там, где «Закрыть» неоднозначно.
 */

// #region Imports
// Node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Pathe
import { join } from 'pathe';
// #endregion

// #region Data
const RUNTIME_MODULES_DIR = fileURLToPath(new URL('../../src/runtime/modules', import.meta.url));
// #endregion

// #region Methods
/**
 * Собирает открывающие теги компонента из всей разметки рантайма.
 *
 * Объявление самого компонента пропускается: подписывают его потребители.
 *
 * @param componentName - Имя компонента.
 * @returns Открывающие теги вида `<Component … >`.
 */
function findTags(componentName: string): string[] {
    const pattern = new RegExp(`<${componentName}[\\s/>][^>]*>`, 'g');
    const tags: string[] = [];

    /**
     * Обходит каталог рантайма, собирая теги из `.vue`-файлов.
     *
     * @param directory - Абсолютный путь каталога.
     */
    function collectFrom(directory: string): void {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const entryPath = join(directory, entry.name);

            if (entry.isDirectory()) {
                collectFrom(entryPath);
                continue;
            }

            if (!entry.name.endsWith('.vue') || entry.name === `${componentName}.vue`) {
                continue;
            }

            tags.push(...(readFileSync(entryPath, 'utf8').match(pattern) ?? []));
        }
    }

    collectFrom(RUNTIME_MODULES_DIR);

    return tags;
}
// #endregion

describe('Доступные имена в местах использования', () => {
    // Селект подписывается ТОЛЬКО пропом: наследование атрибутов у него
    // отключено, а корень — не DOM-узел. Без подписи поле объявляет текущее
    // значение («Редактор»), но не своё назначение
    it('ни одно вхождение BricksSelect не остаётся без подписи', () => {
        const usages = findTags('BricksSelect');
        const unlabelled = usages.filter((tag) => !tag.includes('aria-label'));

        expect(usages).not.toEqual([]);
        expect(unlabelled).toEqual([]);
    });

    // Внутри крестика тоста одна иконка, а имя у него было зашито по-английски
    // при существующем ключе локали: на русской локали скринридер читал
    // единственную кнопку закрытия тоста чужим языком. Монтированием это не
    // проверить — reka-шный ToastRoot в эмуляторе уходит в цикл обновлений
    it('крестик тоста подписан ключом локали, а не зашитым словом', () => {
        const usages = findTags('ToastClose');

        expect(usages).not.toEqual([]);
        expect(usages.filter((tag) => !tag.includes(':aria-label="t(\'bricks.'))).toEqual([]);
    });

    // Копия кнопки закрытия в render-слое (правило render-lean запрещает ему
    // импортировать `ui/`) собственного имени не имеет: она стоит в баннере
    // превью, то есть на опубликованной странице, и подписывается на месте
    it('кнопка закрытия превью подписана на месте использования', () => {
        const usages = findTags('RendererCloseButton');

        expect(usages).not.toEqual([]);
        expect(usages.filter((tag) => !tag.includes('aria-label'))).toEqual([]);
    });
});
