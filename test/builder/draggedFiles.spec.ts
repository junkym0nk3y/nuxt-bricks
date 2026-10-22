/**
 * @vitest-environment happy-dom
 *
 * Подсчёт перетаскиваемых файлов для приёмника галереи.
 *
 * В `dragenter` браузер отдаёт только `items` с видом элемента — сами файлы
 * (`dataTransfer.files`) доступны лишь на `drop`. Поэтому по длине `items`
 * приёмник разворачивался и на перетаскивании текста или ссылки, а `drop` затем
 * молча ничего не делал.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { countDraggedFiles } from '../../src/runtime/modules/builder/media/utils/draggedFiles';
// #endregion

// #region Helpers
/**
 * Собирает `DataTransfer` с заданным содержимым.
 *
 * @param files - Перетаскиваемые файлы.
 * @param text - Перетаскиваемый текст, если он есть.
 * @returns Готовый `DataTransfer`.
 */
function createDataTransfer(files: File[], text?: string): DataTransfer {
    const dataTransfer = new DataTransfer();

    files.forEach((file) => dataTransfer.items.add(file));

    if (text !== undefined) {
        dataTransfer.items.add(text, 'text/plain');
    }

    return dataTransfer;
}

/**
 * Создаёт файл-заглушку.
 *
 * @param name - Имя файла.
 * @returns Файл с типом изображения.
 */
function createImageFile(name: string): File {
    return new File(['x'], name, { type: 'image/png' });
}
// #endregion

describe('Подсчёт перетаскиваемых файлов', () => {
    it('считает файлы', () => {
        const dataTransfer = createDataTransfer([
            createImageFile('a.png'),
            createImageFile('b.png'),
        ]);

        expect(countDraggedFiles(dataTransfer)).toBe(2);
    });

    it('перетаскивание текста файлов не даёт — приёмник остаётся свёрнутым', () => {
        const dataTransfer = createDataTransfer([], 'просто текст');

        expect(countDraggedFiles(dataTransfer)).toBe(0);
    });

    it('в смешанном перетаскивании считаются только файлы', () => {
        const dataTransfer = createDataTransfer([createImageFile('a.png')], 'подпись');

        expect(countDraggedFiles(dataTransfer)).toBe(1);
    });

    it('отсутствующий dataTransfer — ноль, а не падение', () => {
        expect(countDraggedFiles(null)).toBe(0);
    });
});
