/**
 * The deletion nothing follows up on.
 *
 * The record that pointed at the file is removed in the same breath, so a failure here
 * leaves an object nobody will ever ask about again — and the objects of the bucket are
 * public, which makes it a file that goes on opening by its old address after the
 * person deleted it. One repeated attempt is what separates a passing network failure
 * from that.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import { deleteFileBestEffort } from '../../src/runtime/modules/persistence/server/utils/bestEffortDelete';
// #endregion

describe('deleteFileBestEffort', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // The warning of the last attempt is part of the contract, and the cases
        // below read it — it just has no business in the output of the run
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('a file deleted on the first attempt costs one request', async () => {
        const deleteFile = vi.fn().mockResolvedValue(undefined);

        const deleted = await deleteFileBestEffort({ deleteFile }, '/media/x.webp', '[Test]', {
            repeatOnFailure: true,
        });

        expect(deleted).toBe(true);
        expect(deleteFile).toHaveBeenCalledTimes(1);
    });

    it('a passing failure is survived by a repeat', async () => {
        // The whole point of the guard: a dropped connection used to leave a public
        // file behind and a line in the log nobody reads
        const deleteFile = vi
            .fn()
            .mockRejectedValueOnce(new Error('socket hang up'))
            .mockResolvedValueOnce(undefined);

        const pending = deleteFileBestEffort({ deleteFile }, '/media/x.webp', '[Test]', {
            repeatOnFailure: true,
        });
        await vi.runAllTimersAsync();

        expect(await pending).toBe(true);
        expect(deleteFile).toHaveBeenCalledTimes(2);
    });

    it('a failure that lasts is given up on rather than thrown', async () => {
        // The caller is deleting a record, and the record has to go: a bucket that
        // refuses must not take the deletion of the page or the account down with it
        const deleteFile = vi.fn().mockRejectedValue(new Error('bucket unavailable'));

        const pending = deleteFileBestEffort({ deleteFile }, '/media/x.webp', '[Test]', {
            repeatOnFailure: true,
        });
        await vi.runAllTimersAsync();

        expect(await pending).toBe(false);
        expect(deleteFile).toHaveBeenCalledTimes(3);
        expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('the attempts are spaced out instead of hammering the bucket', async () => {
        // A storage that just went away answers the second request the same way it
        // answered the first one; the pause is what gives it a moment to come back
        const deleteFile = vi.fn().mockRejectedValue(new Error('bucket unavailable'));

        const pending = deleteFileBestEffort({ deleteFile }, '/media/x.webp', '[Test]', {
            repeatOnFailure: true,
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(deleteFile).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(200);
        expect(deleteFile).toHaveBeenCalledTimes(2);

        await vi.runAllTimersAsync();
        await pending;
    });
});

describe('deleteFileBestEffort: a caller that is about to answer with an error', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('gets one attempt: its cleanup must not stand between the person and the answer', async () => {
        const deleteFile = vi.fn().mockRejectedValue(new Error('socket hang up'));

        const deleted = await deleteFileBestEffort({ deleteFile }, '/media/x.webp', '[Test]', {
            repeatOnFailure: false,
        });

        expect(deleted).toBe(false);
        expect(deleteFile).toHaveBeenCalledTimes(1);
    });

    it('a storage that answers by timing out is not asked again', async () => {
        // The whole budget of the repeats goes on the first attempt: a bucket that took
        // seconds to fail would not have answered in two hundred milliseconds either,
        // and the person is the one paying for the wait
        const deleteFile = vi.fn().mockImplementation(async () => {
            await vi.advanceTimersByTimeAsync(2_000);

            throw new Error('timeout');
        });

        const pending = deleteFileBestEffort({ deleteFile }, '/media/x.webp', '[Test]', {
            repeatOnFailure: true,
        });
        await vi.runAllTimersAsync();

        expect(await pending).toBe(false);
        expect(deleteFile).toHaveBeenCalledTimes(1);
    });
});

describe('deleteFileBestEffort: the budget is asked again after the pause', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('a timer that came back late does not start another attempt', async () => {
        // A pause of two hundred milliseconds returns when the event loop gets to it,
        // and under load that is not the same thing. Asking the budget only on the way
        // INTO the pause would let the attempt after it start on a budget already spent
        const deleteFile = vi.fn().mockRejectedValue(new Error('connection refused'));
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(5_000);

        const pending = deleteFileBestEffort({ deleteFile }, '/media/x.webp', '[Test]', {
            repeatOnFailure: true,
        });
        await vi.runAllTimersAsync();

        expect(await pending).toBe(false);
        expect(deleteFile).toHaveBeenCalledTimes(1);
    });
});
