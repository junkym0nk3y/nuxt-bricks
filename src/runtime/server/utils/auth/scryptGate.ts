/**
 * A bounded semaphore over scrypt derivations: a stream of login requests with
 * differing usernames cannot claim the CPU with an unbounded number of
 * simultaneous derive operations. Queue overflow is a GateOverflowError (the
 * handler maps it to 503).
 */
import {
    createConcurrencyGate,
    GateOverflowError,
} from '../../../modules/persistence/server/utils/concurrencyGate';

/** Maximum simultaneous scrypt derivations */
const MAX_CONCURRENT_SCRYPT_TASKS = 4;
/** Maximum derivations waiting for a slot; beyond that, a GateOverflowError */
const MAX_SCRYPT_QUEUE = 32;

const scryptGate = createConcurrencyGate({
    maxConcurrent: MAX_CONCURRENT_SCRYPT_TASKS,
    maxQueue: MAX_SCRYPT_QUEUE,
});

export { GateOverflowError };

/**
 * Runs a scrypt task within the shared concurrency limit.
 *
 * @param task - A lazy scrypt operation (verifyPassword or hashPassword).
 */
export function runScryptTask<T>(task: () => Promise<T>): Promise<T> {
    return scryptGate.run(task);
}
