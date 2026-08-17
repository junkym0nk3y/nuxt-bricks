// #region Imports
// Types
import type { H3Event } from 'h3';
import type { IFakeH3EventOptions } from './types';

// Vitest
import { vi } from 'vitest';
// #endregion

/**
 * Фейковое событие h3 для серверных unit-тестов.
 *
 * Собирается объектом, а не настоящим `createEvent` с Node-запросом: middleware и
 * ручкам нужны путь, метод, заголовки и `context`, а поднятие реальных
 * `IncomingMessage`/`ServerResponse` добавило бы к тесту сокеты и их уборку, не
 * добавив ни одной проверяемой границы.
 *
 * Единственное приведение типа живёт здесь: форма фейка сознательно уже
 * контракта `H3Event`, и рассыпать это приведение по спекам значило бы прятать
 * такое же решение в каждой из них.
 *
 * @param options - Путь, метод, заголовки и контекст запроса.
 * @returns Событие в форме, достаточной для тестируемого кода.
 */
export function createFakeH3Event(options: IFakeH3EventOptions = {}): H3Event {
    const { path = '/', method = 'GET', headers = {}, context = {} } = options;

    return {
        path,
        node: {
            req: { url: path, method, headers },
            res: { setHeader: vi.fn() },
        },
        context,
    } as unknown as H3Event;
}
