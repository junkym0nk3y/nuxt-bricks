// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import type { VNodeRef } from 'vue';

// Composables
import { useSlotDragDrop } from '../../src/runtime/modules/builder/canvas/item/composables/useSlotDragDrop';
// #endregion

/**
 * BM-14 №3: состояния слотов лежали в `reactive<Record<string, ISlotState>>({})`,
 * а имена слотов приходят из brick-файла. Для `'__proto__'` `ensureSlotState`
 * принимал `Object.prototype` за уже созданную корзину, и drag-обработчики
 * писали `dragDepth`/`isDragOver`/`dropInsertIndex` в глобальный прототип:
 * состояние протекало между элементами канваса и не сбрасывалось
 * (`Object.keys` такого ключа не возвращает).
 *
 * Тест идёт без DOM (в проекте нет jsdom): контейнер слота и Node подменяются
 * заглушками ровно в объёме, который трогает композабл.
 */

// #region Test doubles
/** Заглушка контейнера слота: композаблу нужны только эти три метода. */
class FakeElement {
    /**
     * Дочерних элементов слота нет — индекс вставки всегда 0.
     *
     * @returns Пустой список.
     */
    querySelectorAll(): unknown[] {
        return [];
    }

    /**
     * Вложенность цели drag-leave не проверяется.
     *
     * @returns false.
     */
    contains(): boolean {
        return false;
    }

    /**
     * Приём CustomEvent 'slot-drop'.
     *
     * @returns true.
     */
    dispatchEvent(): boolean {
        return true;
    }
}

/**
 * Минимальное drag-событие: типы payload распознаёт applyDropEffect.
 *
 * Базой служит настоящий `Event` (в Node он есть, `DragEvent` — нет), поэтому
 * `preventDefault`/`stopPropagation` не заглушки, а приведение — сужение до
 * подтипа вместо сквозного `as unknown as`.
 */
function createDragEvent(): DragEvent {
    const event = new Event('dragenter') as DragEvent;

    return Object.assign(event, {
        clientY: 0,
        relatedTarget: null,
        dataTransfer: {
            types: ['component-id'],
            dropEffect: '',
            getData: () => '',
        },
    });
}

/**
 * Привязывает заглушку контейнера к слоту. `VNodeRef` — union со строкой,
 * поэтому функциональная ветка берётся явным приведением.
 *
 * @param refFactory - `setSlotContainerRef` тестируемого композабла.
 * @param slotName - Имя слота.
 */
function attachSlotContainer(refFactory: (slotName: string) => VNodeRef, slotName: string): void {
    const handler = refFactory(slotName) as (
        element: unknown,
        refs: Record<string, unknown>
    ) => void;

    handler(new FakeElement(), {});
}

/**
 * Носители, в которые уехало бы состояние слота при lookup'е по прототипу.
 * Тип — `object`: значения читаются через `Reflect.get`, приведение не нужно.
 */
function getPollutionCarriers(): object[] {
    return [{}, Object, Object.prototype.toString, Object.prototype.hasOwnProperty];
}
// #endregion

/** Имена, которые обычный объект «находит» в `Object.prototype`. */
const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'] as const;

describe('useSlotDragDrop: имена слотов из Object.prototype', () => {
    beforeEach(() => {
        vi.stubGlobal('HTMLElement', FakeElement);
        vi.stubGlobal('Node', FakeElement);
        // inject вне setup() — предупреждение Vue, к предмету теста отношения не имеет
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each(PROTOTYPE_KEYS)('слот %s ведёт собственное состояние, а не прототип', (slotName) => {
        const { setSlotContainerRef, handleSlotDragEnter, handleSlotDragLeave, getSlotDropIndex } =
            useSlotDragDrop('parent-1');

        attachSlotContainer(setSlotContainerRef, slotName);
        handleSlotDragEnter(slotName, createDragEvent());

        expect(getSlotDropIndex(slotName)).toBe(0);

        getPollutionCarriers().forEach((carrier) => {
            expect(Reflect.get(carrier, 'dragDepth')).toBeUndefined();
            expect(Reflect.get(carrier, 'isDragOver')).toBeUndefined();
            expect(Reflect.get(carrier, 'dropInsertIndex')).toBeUndefined();
        });

        handleSlotDragLeave(slotName, createDragEvent());

        expect(getSlotDropIndex(slotName)).toBeNull();
    });

    it.each(PROTOTYPE_KEYS)('состояние слота %s не протекает в другой элемент', (slotName) => {
        const first = useSlotDragDrop('parent-1');
        attachSlotContainer(first.setSlotContainerRef, slotName);
        first.handleSlotDragEnter(slotName, createDragEvent());

        const second = useSlotDragDrop('parent-2');

        expect(second.getSlotDropIndex(slotName)).toBeNull();
    });
});
