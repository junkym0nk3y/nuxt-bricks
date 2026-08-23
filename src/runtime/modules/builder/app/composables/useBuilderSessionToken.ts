// #region Imports
// Types
import type { IBuilderSessionToken } from '../types/composables';

// Vue
import { computed, ref } from 'vue';
// #endregion

/**
 * The token of a builder session — the shared cut-off point for the operations
 * that begin in one session and finish in another. An operation takes the token at
 * its start (`capture`) and checks it (`isCurrent`) before applying a result or a
 * side effect; `invalidate` cuts every started operation off at once. Nothing is
 * aborted by that: the requests keep flying, they merely stop being applied.
 *
 * There is one owner of the increments — `useBuilderSession` (the entry into a
 * session opening and the `onScopeDispose` of the instance). The other consumers
 * receive the token from the composition root and only read it, so there is
 * exactly one counter per page.
 *
 * The token is local to the page instance on purpose rather than global: an
 * unfinished operation outlives the unmount (the stores live at the level of the
 * application), and what puts it out is exactly the increment on dispose — a new
 * instance starts with a counter of its own, while the operations of the dead one
 * stay cut off by theirs.
 */
export function useBuilderSessionToken(): IBuilderSessionToken {
    const token = ref(0);

    return {
        token: computed(() => token.value),

        /**
         * Takes the token at the start of an operation.
         *
         * @returns The value of the token the operation started with.
         */
        capture(): number {
            return token.value;
        },

        /**
         * Checks that the session an operation started in is still the current one.
         *
         * @param captured - The token taken at the start of the operation.
         * @returns Whether the result and the side effects may be applied.
         */
        isCurrent(captured: number): boolean {
            return captured === token.value;
        },

        /**
         * Cuts every started operation off: their `isCurrent` is false from now on.
         */
        invalidate(): void {
            token.value += 1;
        },
    };
}
