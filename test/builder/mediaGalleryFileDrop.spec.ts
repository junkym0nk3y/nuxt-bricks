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
import { defineComponent, effectScope, h } from 'vue';
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

/**
 * Событие перетаскивания, которое помнит, гасили ли его.
 *
 * @param files - Перетаскиваемые файлы.
 * @returns Событие и флаг подавления.
 */
function createTrackedDragEvent(files: File[]): { event: DragEvent; isPrevented: () => boolean } {
    const dataTransfer = new DataTransfer();

    files.forEach((file) => dataTransfer.items.add(file));

    let prevented = false;
    const event = {
        preventDefault: (): void => {
            prevented = true;
        },
        dataTransfer,
    } as unknown as DragEvent;

    return { event, isPrevented: () => prevented };
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

// Гейт роли решает, ЗАГРУЗЯТСЯ ли файлы, но не отдаёт браузеру нативную
// обработку: без `preventDefault` документ откроет брошенный файл соседней
// вкладкой, то есть роль без права записи получила бы уход со страницы вместо
// «ничего не произошло»
describe('приёмник файлов галереи: выключенный приёмник', () => {
    it('гасит перетаскивание и drop, но файлы не принимает', () => {
        const onFiles = vi.fn();
        const scope = effectScope();
        const drop = scope.run(() =>
            useMediaGalleryFileDrop({ onFiles, isEnabled: () => false })
        ) as ReturnType<typeof useMediaGalleryFileDrop>;

        const over = createTrackedDragEvent([makeFile()]);
        const enter = createTrackedDragEvent([makeFile()]);
        const dropped = createTrackedDragEvent([makeFile()]);

        drop.handleDragOver(over.event);
        drop.handleDragEnter(enter.event);
        drop.handleDrop(dropped.event);

        expect(over.isPrevented()).toBe(true);
        expect(enter.isPrevented()).toBe(true);
        expect(dropped.isPrevented()).toBe(true);
        expect(drop.isDraggingFiles.value).toBe(false);
        expect(onFiles).not.toHaveBeenCalled();

        scope.stop();
    });

    it('включённый приёмник файлы принимает', () => {
        const onFiles = vi.fn();
        const scope = effectScope();
        const drop = scope.run(() =>
            useMediaGalleryFileDrop({ onFiles, isEnabled: () => true })
        ) as ReturnType<typeof useMediaGalleryFileDrop>;

        const dropped = createTrackedDragEvent([makeFile()]);
        drop.handleDrop(dropped.event);

        expect(onFiles).toHaveBeenCalledTimes(1);

        scope.stop();
    });
});
