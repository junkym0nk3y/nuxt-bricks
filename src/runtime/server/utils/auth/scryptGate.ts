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

/**
 * Maximum simultaneous scrypt derivations.
 *
 * Two rather than four, and the reason is the thread pool rather than memory: one
 * derivation of the current parameters holds a libuv thread for about a tenth of a
 * second, and the pool is four threads by default. Four derivations at once would
 * occupy all of it, and image processing, file reads and part of the DNS would be
 * waiting behind the logins.
 */
const MAX_CONCURRENT_SCRYPT_TASKS = 2;
/**
 * Maximum derivations waiting for a slot; beyond that, a GateOverflowError.
 *
 * The bound is read as waiting time: a full queue at two slots and a derivation of
 * about a quarter of a second on a slow instance is about a second of waiting before
 * the answer. A deeper queue would turn a burst into a form that hangs for tens of
 * seconds — an early 503 is the better answer of the two.
 */
const MAX_SCRYPT_QUEUE = 8;

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

/**
 * Runs a scrypt task only while there is a free slot; null — it was skipped.
 *
 * For work nobody is waiting for. The rehash of a password after a sign-in is exactly
 * that: it happens once in the life of an account, and paying for it with the slot of
 * somebody who is waiting to log in — or with a 503 for them — would be a bad trade.
 * A skipped rehash is retried by the next sign-in.
 *
 * @param task - A lazy scrypt operation.
 */
export function runScryptTaskIfIdle<T>(task: () => Promise<T>): Promise<T | null> {
    return scryptGate.tryRun(task);
}
