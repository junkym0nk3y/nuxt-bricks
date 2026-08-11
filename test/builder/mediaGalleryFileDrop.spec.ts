/**
 * @vitest-environment happy-dom
 *
 * Приёмник файлов галереи: страховка от залипшего оверлея.
 *
 * Пары `dragenter`/`dragleave` не всегда сходятся — перетаскивание отменяют
 * Escape'ом, `drop` приземляется в чужой обработчик, элемент под курсором
 * исчезает вместе с перерисовкой сетки. Тогда счётчик остаётся положительным, и
 * оверлей приёмника висит поверх сетки до следующего открытия галереи. `dragend`
 * эту дыру не закрывает: у файлов из ОС источник перетаскивания лежит вне
 * документа.
 */

// #region Imports
// Types
import type { IMediaGalleryFileDrop } from '../../src/runtime/modules/builder/media/types/media';

// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

// Composables
import { useMediaGalleryFileDrop } from '../../src/runtime/modules/builder/media/composables/useMediaGalleryFileDrop';
// #endregion

// #region Helpers
/**
 * Монтирует композабл в пустом компоненте: ему нужен контекст ради уборки
 * таймера на размонтировании.
 *
 * @param onFiles - Приёмник брошенных файлов.
 * @returns API композабла и обёртка компонента.
 */
function mountFileDrop(onFiles: (files: File[]) => void = vi.fn()): {
    api: IMediaGalleryFileDrop;
    unmount: () => void;
} {
    let api: IMediaGalleryFileDrop | null = null;

    const wrapper = mount(
        defineComponent({
            setup() {
                api = useMediaGalleryFileDrop({ onFiles });

                return () => h('div');
            },
        })
    );

    if (!api) {
        throw new Error('Композабл не отдал API');
    }

    return { api, unmount: () => wrapper.unmount() };
}

/**
 * Событие перетаскивания с заданным содержимым.
 *
 * @param files - Перетаскиваемые файлы.
 * @returns Событие для обработчиков приёмника.
 */
function createDragEvent(files: File[]): DragEvent {
    const dataTransfer = new DataTransfer();

    files.forEach((file) => dataTransfer.items.add(file));

    return { preventDefault: (): void => undefined, dataTransfer } as unknown as DragEvent;
}

/** Один перетаскиваемый файл. */
function makeFile(): File {
    return new File(['x'], 'photo.png', { type: 'image/png' });
}
// #endregion

describe('приёмник файлов галереи: сторож тишины перетаскивания', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('сворачивает приёмник, когда `dragover` перестал приходить', () => {
        const { api } = mountFileDrop();

        api.handleDragEnter(createDragEvent([makeFile()]));

        expect(api.isDraggingFiles.value).toBe(true);
        expect(api.draggedFileCount.value).toBe(1);

        // Ни `dragleave`, ни `drop` не пришли: без сторожа оверлей остался бы
        vi.advanceTimersByTime(1000);

        expect(api.isDraggingFiles.value).toBe(false);
        expect(api.draggedFileCount.value).toBe(0);
    });

    it('не сворачивает приёмник, пока `dragover` продолжает приходить', () => {
        const { api } = mountFileDrop();
        const event = createDragEvent([makeFile()]);

        api.handleDragEnter(event);

        for (let tick = 0; tick < 5; tick += 1) {
            vi.advanceTimersByTime(700);
            api.handleDragOver(event);
        }

        expect(api.isDraggingFiles.value).toBe(true);
    });

    it('перетаскивание текста приёмник не разворачивает и сторожа не заводит', () => {
        const { api } = mountFileDrop();
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add('просто текст', 'text/plain');
        const event = {
            preventDefault: (): void => undefined,
            dataTransfer,
        } as unknown as DragEvent;

        api.handleDragEnter(event);
        api.handleDragOver(event);

        expect(api.isDraggingFiles.value).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('`drop` отдаёт файлы и снимает состояние вместе с таймером', () => {
        const onFiles = vi.fn();
        const { api } = mountFileDrop(onFiles);
        const file = makeFile();

        api.handleDragEnter(createDragEvent([file]));
        api.handleDrop(createDragEvent([file]));

        expect(onFiles).toHaveBeenCalledTimes(1);
        expect(onFiles.mock.calls[0]?.[0]).toHaveLength(1);
        expect(api.isDraggingFiles.value).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('размонтирование гасит таймер сторожа', () => {
        const { api, unmount } = mountFileDrop();

        api.handleDragEnter(createDragEvent([makeFile()]));

        expect(vi.getTimerCount()).toBe(1);

        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});
