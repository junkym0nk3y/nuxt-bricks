/**
 * Семафор конкурентности для тяжёлых серверных операций (sharp-декодирование):
 * не больше maxConcurrent задач одновременно, излишек ждёт в ограниченной
 * очереди, переполнение очереди — GateOverflowError (ручки мапят в 503).
 * Чистый модуль без h3 — тестируется юнитами.
 */

/** Переполнение очереди семафора: сервер занят, запрос отклоняется без ожидания. */
export class GateOverflowError extends Error {
    constructor() {
        super('Concurrency gate queue overflow');
        this.name = 'GateOverflowError';
    }
}

/** Семафор: run исполняет задачу в пределах лимита одновременности. */
export interface IConcurrencyGate {
    run<T>(task: () => Promise<T>): Promise<T>;
}

/** Параметры семафора. */
export interface IConcurrencyGateOptions {
    /** Максимум одновременно исполняемых задач. */
    maxConcurrent: number;
    /** Максимум задач, ожидающих слот; сверх — GateOverflowError. */
    maxQueue: number;
}

/**
 * Создаёт семафор конкурентности с ограниченной очередью ожидания.
 *
 * @param options - Лимиты одновременности и очереди.
 * @returns Семафор.
 */
export function createConcurrencyGate(options: IConcurrencyGateOptions): IConcurrencyGate {
    const { maxConcurrent, maxQueue } = options;
    const queue: Array<() => void> = [];
    let active = 0;

    /**
     * Захватывает слот исполнения или встаёт в очередь.
     */
    async function acquireSlot(): Promise<void> {
        if (active < maxConcurrent) {
            active += 1;
            return;
        }

        if (queue.length >= maxQueue) {
            throw new GateOverflowError();
        }

        await new Promise<void>((resolve) => {
            queue.push(resolve);
        });
    }

    /**
     * Освобождает слот: передаёт его первому ожидающему либо уменьшает счётчик.
     */
    function releaseSlot(): void {
        const next = queue.shift();

        if (next) {
            next();
            return;
        }

        active -= 1;
    }

    return {
        async run<T>(task: () => Promise<T>): Promise<T> {
            await acquireSlot();

            try {
                return await task();
            } finally {
                releaseSlot();
            }
        },
    };
}
