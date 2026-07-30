/**
 * Реестр незавершённых операций записи текущего лендинга.
 *
 * Список идентификаторов, а не общий boolean: операции переживают смену страницы
 * в билдере, и `finally` первой снимал бы индикатор второй. Владение по id
 * закрывает и обратное — операция покинутой страницы не должна блокировать
 * запись в открытой: её id вычищает сброс при смене сессии.
 */
import type { IActiveWriteRegistry } from '../types/publishStore';

/**
 * Открывает операцию записи. Отказ (`null`) означает, что запись уже идёт:
 * второй submit не должен уходить на сервер вовсе.
 *
 * Запрет держится здесь, а не на `disabled` кнопки: тот зависит от того, успел
 * ли Vue перерисовать разметку между двумя действиями, и не распространяется на
 * прямой вызов action'а стора.
 *
 * @param registry - Состояние реестра (стор).
 * @returns Идентификатор операции либо `null`, если запись уже идёт.
 */
export function beginActiveWrite(registry: IActiveWriteRegistry): number | null {
    if (registry.activeWriteIds.length > 0) {
        return null;
    }

    // Счётчик монотонный и при сбросе реестра не обнуляется: повторно выданный
    // id позволил бы позднему завершению прежней операции снять новую
    registry.nextWriteId += 1;
    registry.activeWriteIds = [...registry.activeWriteIds, registry.nextWriteId];

    return registry.nextWriteId;
}

/**
 * Закрывает операцию записи. Именно свою: полная очистка списка означала бы, что
 * завершение операции покинутой страницы снимает индикатор у записи, идущей на
 * открытой.
 *
 * @param registry - Состояние реестра (стор).
 * @param writeId - Идентификатор, выданный `beginActiveWrite`.
 */
export function endActiveWrite(registry: IActiveWriteRegistry, writeId: number): void {
    registry.activeWriteIds = registry.activeWriteIds.filter((activeId) => activeId !== writeId);
}
