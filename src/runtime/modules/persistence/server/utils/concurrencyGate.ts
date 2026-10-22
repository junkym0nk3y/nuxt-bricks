/**
 * A concurrency semaphore for the heavy server-side operations (sharp decoding): no
 * more than maxConcurrent tasks at once, the excess waits in a bounded queue, and an
 * overflow of the queue is a GateOverflowError (the handlers map it into a 503).
 * A pure module with no h3 — unit-tested.
 */

import type { IConcurrencyGate, IConcurrencyGateOptions } from '../../types/concurrencyGate';

/**
 * An overflow of the semaphore's queue: the server is busy, and the request is
 * refused without waiting.
 */
export class GateOverflowError extends Error {
    constructor() {
        super('Concurrency gate queue overflow');
        this.name = 'GateOverflowError';
    }
}

/**
 * Creates a concurrency semaphore with a bounded waiting queue.
 *
 * @param options - The concurrency and queue limits.
 * @returns The semaphore.
 */
export function createConcurrencyGate(options: IConcurrencyGateOptions): IConcurrencyGate {
    const { maxConcurrent, maxQueue } = options;
    const queue: Array<() => void> = [];
    let active = 0;

    /**
     * Takes an execution slot, or joins the queue.
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
     * Frees a slot: hands it to the first waiter, or decrements the counter.
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

        async tryRun<T>(task: () => Promise<T>): Promise<T | null> {
            if (active >= maxConcurrent) {
                return null;
            }

            active += 1;

            try {
                return await task();
            } finally {
                releaseSlot();
            }
        },
    };
}
