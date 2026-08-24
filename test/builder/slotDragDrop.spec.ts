/**
 * @vitest-environment happy-dom
 *
 * Слот brick-компонента как зона drop: индекс вставки и снятие плейсхолдера.
 *
 * Два дефекта, ради которых спека написана:
 *
 * 1. Дети слота отбирались `querySelectorAll('[data-slot-child="true"]')` по всему
 *    поддереву, а атрибут несёт любой canvas-item со слотом — включая детей слота
 *    внутри слота. Индекс вставки считался по расширенному списку и мог превысить
 *    число непосредственных детей слота, то есть блок уезжал не туда.
 * 2. `dragDepth` рос на каждом всплывшем `dragenter` (обработчик висит на контейнере,
 *    события приходят и от потомков), а `dragleave` при переходе между потомками
 *    выходил ранним `return`, ничего не уменьшая. После пары переходов внутри слота
 *    счётчик не возвращался к нулю, и плейсхолдер оставался до конца drag-сессии.
 *
 * Живьём это не воспроизведено: brick-компонента со слотами в playground нет.
 * Непроверенным остаётся порядок native-событий Chromium и значения `relatedTarget`
 * при уходе в другое окно.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import type { VNodeRef } from 'vue';

// Composables
import { useSlotDragDrop } from '../../src/runtime/modules/builder/canvas/item/composables/useSlotDragDrop';
// #endregion

/** Высота одного ряда детей слота: из неё считаются середины для попадания курсора. */
const CHILD_HEIGHT = 100;

/**
 * Собирает контейнер слота: два непосредственных ребёнка, а внутри второго — слот со
 * своим ребёнком. Вложенный ребёнок несёт тот же `data-slot-child`, поэтому именно он
 * и попадал в список внешнего слота.
 *
 * @returns Контейнер слота.
 */
function buildSlotContainer(): HTMLElement {
    document.body.innerHTML = `
        <div id="slot">
            <div id="first" data-slot-child="true"></div>
            <div id="second" data-slot-child="true">
                <div id="inner-slot">
                    <div id="nested" data-slot-child="true"></div>
                </div>
            </div>
        </div>
    `;

    const container = document.getElementById('slot') as HTMLElement;
    const tops: Record<string, number> = { first: 0, second: CHILD_HEIGHT, nested: CHILD_HEIGHT };

    for (const id of Object.keys(tops)) {
        const element = document.getElementById(id) as HTMLElement;
        // happy-dom не считает геометрию: прямоугольники задаются вручную
        element.getBoundingClientRect = () => ({ top: tops[id], height: CHILD_HEIGHT }) as DOMRect;
    }

    return container;
}

/**
 * Минимальное drag-событие: типы payload распознаёт applyDropEffect.
 *
 * @param pointerY - Позиция курсора по вертикали.
 * @param relatedTarget - Цель перехода (куда уходит курсор при leave).
 */
function createDragEvent(pointerY = 0, relatedTarget: EventTarget | null = null): DragEvent {
    const event = new Event('dragenter') as DragEvent;

    return Object.assign(event, {
        clientY: pointerY,
        relatedTarget,
        dataTransfer: {
            types: ['component-id'],
            dropEffect: '',
            getData: () => '',
        },
    });
}

/**
 * Привязывает контейнер к слоту. `VNodeRef` — union со строкой, поэтому
 * функциональная ветка берётся явным приведением.
 *
 * @param refFactory - `setSlotContainerRef` тестируемого композабла.
 * @param slotName - Имя слота.
 * @param container - Элемент контейнера.
 */
function attachSlotContainer(
    refFactory: (slotName: string) => VNodeRef,
    slotName: string,
    container: HTMLElement
): void {
    const handler = refFactory(slotName) as (
        element: unknown,
        refs: Record<string, unknown>
    ) => void;

    handler(container, {});
}

describe('useSlotDragDrop: индекс вставки и снятие плейсхолдера', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        // inject вне setup() — предупреждение Vue, к предмету теста отношения не имеет
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('дети слота внутри слота в счёт не идут', () => {
        const container = buildSlotContainer();
        const { setSlotContainerRef, handleSlotDragEnter, getSlotDropIndex } =
            useSlotDragDrop('parent-1');

        attachSlotContainer(setSlotContainerRef, 'content', container);

        // Курсор ниже обоих непосредственных детей: вставка в конец, то есть 2.
        // С рекурсивным отбором вложенный ребёнок давал 3 — позицию, которой у слота нет
        handleSlotDragEnter('content', createDragEvent(CHILD_HEIGHT * 3));

        expect(getSlotDropIndex('content')).toBe(2);
    });

    it('курсор над вторым ребёнком даёт индекс этого ребёнка', () => {
        const container = buildSlotContainer();
        const { setSlotContainerRef, handleSlotDragEnter, getSlotDropIndex } =
            useSlotDragDrop('parent-1');

        attachSlotContainer(setSlotContainerRef, 'content', container);
        handleSlotDragEnter('content', createDragEvent(CHILD_HEIGHT + 10));

        expect(getSlotDropIndex('content')).toBe(1);
    });

    it('ходьба по потомкам плейсхолдер не роняет, а выход из контейнера роняет', () => {
        const container = buildSlotContainer();
        const nested = document.getElementById('nested') as HTMLElement;
        const { setSlotContainerRef, handleSlotDragEnter, handleSlotDragLeave, getSlotDropIndex } =
            useSlotDragDrop('parent-1');

        attachSlotContainer(setSlotContainerRef, 'content', container);

        // Всплывшие dragenter от потомков: раньше каждый поднимал счётчик вложенности
        handleSlotDragEnter('content', createDragEvent(10));
        handleSlotDragEnter('content', createDragEvent(CHILD_HEIGHT + 10));
        handleSlotDragEnter('content', createDragEvent(CHILD_HEIGHT + 20));

        // Переход между потомками — не выход: плейсхолдер остаётся
        handleSlotDragLeave('content', createDragEvent(0, nested));
        expect(getSlotDropIndex('content')).toBe(1);

        // Один настоящий выход обязан снять его целиком
        handleSlotDragLeave('content', createDragEvent(0, document.body));
        expect(getSlotDropIndex('content')).toBeNull();
    });

    it('уход без цели (другое окно) считается выходом', () => {
        const container = buildSlotContainer();
        const { setSlotContainerRef, handleSlotDragEnter, handleSlotDragLeave, getSlotDropIndex } =
            useSlotDragDrop('parent-1');

        attachSlotContainer(setSlotContainerRef, 'content', container);
        handleSlotDragEnter('content', createDragEvent(10));
        handleSlotDragLeave('content', createDragEvent(0, null));

        expect(getSlotDropIndex('content')).toBeNull();
    });
});
