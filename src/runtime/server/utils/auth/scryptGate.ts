/**
 * Bounded-семафор scrypt-дериваций: поток login-запросов с
 * разными username не может занять CPU неограниченным числом одновременных
 * derive-операций. Переполнение очереди — GateOverflowError (ручка мапит в 503).
 */
import {
    createConcurrencyGate,
    GateOverflowError,
} from '../../../modules/persistence/server/utils/concurrencyGate';

/** Максимум одновременных scrypt-дериваций. */
const MAX_CONCURRENT_SCRYPT_TASKS = 4;
/** Максимум ожидающих слот дериваций; сверх — GateOverflowError. */
const MAX_SCRYPT_QUEUE = 32;

const scryptGate = createConcurrencyGate({
    maxConcurrent: MAX_CONCURRENT_SCRYPT_TASKS,
    maxQueue: MAX_SCRYPT_QUEUE,
});

export { GateOverflowError };

/**
 * Исполняет scrypt-задачу в пределах общего лимита одновременности.
 *
 * @param task - Ленивая scrypt-операция (verifyPassword).
 */
export function runScryptTask<T>(task: () => Promise<T>): Promise<T> {
    return scryptGate.run(task);
}
