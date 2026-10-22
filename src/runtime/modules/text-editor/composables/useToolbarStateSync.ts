// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IToolbarGroup, IToolbarStateRefs } from '../../ui/inputs/textEditorToolbar.d.ts';
import type { IToolbarStateSync, IToolbarStateSyncOptions } from '../types/composables';

// Vue
import { computed, ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue';

// Nuxt
import { useNuxtApp } from 'nuxt/app';

// Composables
import { useBricksConfig } from '../../common/composables/useBricksConfig';
// #endregion

const DEFAULT_TOOLBAR_STATE = Object.freeze({
    fontSize: '1.6rem',
    fontWeight: '',
    color: '#000000',
    fontFamily: '',
    lineHeight: '',
    letterSpacing: '',
});

/**
 * Keeps the toolbar state in sync with TipTap transactions and builds the config of the
 * toolbar groups. The 'transaction' subscription is recreated on its own whenever the
 * editor changes (watchEffect).
 *
 * @param editorRef - Ref or getter of the active TipTap editor (null — no editor created).
 * @param options - The isEnabled condition that hides the toolbar, and the link button handler.
 */
export function useToolbarStateSync(
    editorRef: MaybeRefOrGetter<Editor | null>,
    options: IToolbarStateSyncOptions = {}
): IToolbarStateSync {
    const { $textEditorToolbar } = useNuxtApp();
    const config = useBricksConfig();

    const toolbarState: IToolbarStateRefs = {
        currentFontSize: ref<string>(DEFAULT_TOOLBAR_STATE.fontSize),
        currentFontWeight: ref<string>(DEFAULT_TOOLBAR_STATE.fontWeight),
        currentColor: ref<string>(DEFAULT_TOOLBAR_STATE.color),
        currentFontFamily: ref<string>(DEFAULT_TOOLBAR_STATE.fontFamily),
        currentLineHeight: ref<string>(DEFAULT_TOOLBAR_STATE.lineHeight),
        currentLetterSpacing: ref<string>(DEFAULT_TOOLBAR_STATE.letterSpacing),
    };

    /** Revision bumped by every editor transaction, private to the composable */
    const toolbarRefreshRevision = ref<number>(0);

    const availableFonts = computed<string[]>(() => config.fonts ?? []);

    /**
     * Reads the refresh revision to register the reactive dependency on it.
     *
     * The revision is the only way the toolbar learns about a moved cursor: `isActive()`
     * of the buttons is not reactive, so nothing else in the computed changes when the
     * selection moves within the same formatting. The read used to sit inside the guard
     * of the computed as `revision < 0`, where it read as a check for an impossible
     * state instead of a subscription.
     *
     * @returns Current value of the revision (the caller has no use for it).
     */
    function trackToolbarRefresh(): number {
        return toolbarRefreshRevision.value;
    }

    /** Config of the toolbar groups, recomputed on every editor transaction */
    const toolbarGroups = computed<IToolbarGroup[]>(() => {
        trackToolbarRefresh();

        const editor = toValue(editorRef);
        const isEnabled = toValue(options.isEnabled ?? true);

        if (!editor || !isEnabled) {
            return [];
        }

        return $textEditorToolbar.createToolbarConfig({
            editor,
            availableFonts: availableFonts.value,
            ...toolbarState,
            ...(options.onRequestLink ? { onRequestLink: options.onRequestLink } : {}),
        });
    });

    /** Resets the toolbar state to the default values */
    function resetToolbarState(): void {
        toolbarState.currentFontSize.value = DEFAULT_TOOLBAR_STATE.fontSize;
        toolbarState.currentFontWeight.value = DEFAULT_TOOLBAR_STATE.fontWeight;
        toolbarState.currentColor.value = DEFAULT_TOOLBAR_STATE.color;
        toolbarState.currentFontFamily.value = DEFAULT_TOOLBAR_STATE.fontFamily;
        toolbarState.currentLineHeight.value = DEFAULT_TOOLBAR_STATE.lineHeight;
        toolbarState.currentLetterSpacing.value = DEFAULT_TOOLBAR_STATE.letterSpacing;
    }

    /**
     * Subscribes to TipTap transactions to keep the toolbar state in sync with the cursor.
     * watchEffect drops the previous listener on its own whenever the editor changes.
     */
    watchEffect((onCleanup) => {
        const editor = toValue(editorRef);
        if (!editor) {
            return;
        }

        function handleTransaction(): void {
            toolbarRefreshRevision.value++;
            $textEditorToolbar.syncToolbarState(editor!, toolbarState);
        }

        editor.on('transaction', handleTransaction);
        onCleanup(() => {
            editor.off('transaction', handleTransaction);
        });
    });

    return {
        toolbarState,
        toolbarGroups,
        resetToolbarState,
    };
}
