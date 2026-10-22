// #region Imports
// Types
import type { IPublishAdapter } from '../../types/adapters';
import type { IFileDeleteOptions } from '../../types/fileDeletion';
// #endregion

// #region Constants
/**
 * How many times a deletion is attempted when the caller asked for repeats.
 *
 * The client of the storage retries a request twice on its own, and it is bounded by
 * its own timeout — this ceiling multiplies that one, which is why the budget below
 * matters more than the count does.
 */
const DELETE_ATTEMPTS = 3;

/** Pause before the next attempt (ms); doubled with every attempt */
const RETRY_DELAY_MS = 200;

/**
 * The whole of the time the repeats may take, pauses included (ms).
 *
 * Every caller of this helper stands inside the request of a person: the record has
 * been deleted and what is left is to answer. So the repeats are for the failures that
 * come back FAST — a refused connection, an immediate 500 — where another attempt costs
 * milliseconds and often works. A storage that answers by timing out has spent the
 * budget on the first attempt and gets no second one: it would not have answered in two
 * hundred milliseconds either, and the person would be the one paying for the wait.
 */
const RETRY_BUDGET_MS = 2_000;
// #endregion

// #region Methods
/**
 * Waits out the pause between attempts.
 *
 * @param delayMs - Length of the pause.
 */
function wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
}

/**
 * Whether the budget of the repeats is spent, counting the pause about to be waited.
 *
 * @param startedAt - The moment the first attempt began.
 * @param delayMs - The pause that would follow.
 * @returns Whether there is no room left for another attempt.
 */
function hasSpentBudget(startedAt: number, delayMs: number): boolean {
    return Date.now() - startedAt + delayMs >= RETRY_BUDGET_MS;
}

/**
 * Deletes a file of the storage without ever throwing, repeating the attempt when the
 * caller says a repeat is worth it.
 *
 * The repeats exist for one situation: the record that pointed at the file is being
 * removed in the same breath, so a failure leaves an object nobody will ever ask about
 * again — and the objects are public, which makes it a file that goes on opening by its
 * old address after the person deleted it. Repeating rather than collecting: a
 * background sweep over the bucket costs more than the garbage it removes.
 *
 * A caller that is about to return an error asks for a single attempt instead. Its
 * cleanup must not stand between the person and the answer — the rule the compensation
 * of a failed upload has followed all along.
 *
 * Whether the URL belongs to the managed storage is the caller's to decide: the adapter
 * refuses a foreign key outright, and that refusal is not worth repeating.
 *
 * @param publish - The publish adapter of the storage.
 * @param url - Public URL of the file.
 * @param context - Prefix of the log message, naming the caller.
 * @param options - Whether a failure is worth another attempt.
 * @returns Whether the file was deleted.
 */
export async function deleteFileBestEffort(
    publish: Pick<IPublishAdapter, 'deleteFile'>,
    url: string,
    context: string,
    options: IFileDeleteOptions
): Promise<boolean> {
    const maxAttempts = options.repeatOnFailure ? DELETE_ATTEMPTS : 1;
    const startedAt = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await publish.deleteFile(url);

            return true;
        } catch (error: unknown) {
            lastError = error;
        }

        const delayMs = RETRY_DELAY_MS * attempt;

        if (attempt === maxAttempts || hasSpentBudget(startedAt, delayMs)) {
            break;
        }

        await wait(delayMs);

        // The budget is asked again on the way out of the pause: a timer of two hundred
        // milliseconds returns when the event loop gets to it, and under load that is
        // not the same thing. The attempt that follows would otherwise start on a
        // budget already spent
        if (hasSpentBudget(startedAt, 0)) {
            break;
        }
    }

    console.warn(`${context} Failed to delete a file:`, url, lastError);

    return false;
}
// #endregion
