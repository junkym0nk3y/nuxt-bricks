/**
 * The types of the concurrency semaphore (`server/utils/concurrencyGate.ts`).
 */

/** The semaphore: run executes a task within the concurrency limit. */
export interface IConcurrencyGate {
    run<T>(task: () => Promise<T>): Promise<T>;
    /**
     * Runs the task only if a slot is free at this very moment; null — there was no
     * free slot and the task was NOT run.
     *
     * It exists for work that must not take a place in the queue away from work
     * someone is waiting for: an opportunistic rehash of a password is worth doing
     * while the server is idle and worth skipping while it is not. The check and the
     * taking of the slot happen in one synchronous step, so two callers cannot both
     * decide the same slot is theirs.
     */
    tryRun<T>(task: () => Promise<T>): Promise<T | null>;
}

/** The semaphore's parameters. */
export interface IConcurrencyGateOptions {
    /** The cap on simultaneously executed tasks. */
    maxConcurrent: number;
    /** The cap on tasks waiting for a slot; above it — a GateOverflowError. */
    maxQueue: number;
}
