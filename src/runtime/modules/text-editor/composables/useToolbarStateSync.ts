// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IToolbarGroup, IToolbarStateRefs } from '../../ui/inputs/textEditorToolbar.d.ts';

// Vue
import {
    computed,
    ref,
    toValue,
    watchEffect,
    type ComputedRef,
    type MaybeRefOrGetter,
    type Ref,
} from 'vue';

// Nuxt
import { useNuxtApp } from 'nuxt/app';

// Composables
import { useBricksConfig } from '../../common/composables/useBricksConfig';
// #endregion

// #region Interfaces
export interface IToolbarStateSyncOptions {
    /** Дополнительное условие показа toolbar (false → пустой список групп). */
    isEnabled?: MaybeRefOrGetter<boolean>;
}

export interface IToolbarStateSync {
    /** Refs текущих значений шрифта/цвета/межстрочных для selects тулбара. */
    toolbarState: IToolbarStateRefs;
    /** Счётчик транзакций — реактивная зависимость для пересчёта toolbarGroups. */
    editorTransactionCount: Ref<number>;
    /** Конфигурация групп тулбара (пустая, если editor нет или isEnabled = false). */
    toolbarGroups: ComputedRef<IToolbarGroup[]>;
    /** Сбрасывает toolbar state к дефолтам (например, при смене редактируемого свойства). */
    resetToolbarState: () => void;
}
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
 * Синхронизирует toolbar state с TipTap-транзакциями и строит конфигурацию групп тулбара.
 * Подписка на 'transaction' пересоздаётся автоматически при смене editor (watchEffect).
 *
 * @param editorRef - Ref или getter активного TipTap-редактора (null — редактор не создан).
 * @param options - Опциональное условие isEnabled для скрытия тулбара.
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

    /** Счётчик транзакций для реактивного обновления toolbar */
    const editorTransactionCount = ref<number>(0);

    const availableFonts = computed<string[]>(() => config.fonts ?? []);

    /**
     * Конфигурация групп тулбара.
     * Зависит от editorTransactionCount, чтобы пересчитываться при каждой транзакции
     * редактора (обновление isActive() кнопок при смене выделения/курсора).
     */
    const toolbarGroups = computed<IToolbarGroup[]>(() => {
        const editor = toValue(editorRef);
        const isEnabled = toValue(options.isEnabled ?? true);

        if (!editor || !isEnabled || editorTransactionCount.value < 0) {
            return [];
        }

        return $textEditorToolbar.createToolbarConfig({
            editor,
            availableFonts: availableFonts.value,
            ...toolbarState,
        });
    });

    /**
     * Сбрасывает toolbar state к дефолтным значениям.
     */
    function resetToolbarState(): void {
        toolbarState.currentFontSize.value = DEFAULT_TOOLBAR_STATE.fontSize;
        toolbarState.currentFontWeight.value = DEFAULT_TOOLBAR_STATE.fontWeight;
        toolbarState.currentColor.value = DEFAULT_TOOLBAR_STATE.color;
        toolbarState.currentFontFamily.value = DEFAULT_TOOLBAR_STATE.fontFamily;
        toolbarState.currentLineHeight.value = DEFAULT_TOOLBAR_STATE.lineHeight;
        toolbarState.currentLetterSpacing.value = DEFAULT_TOOLBAR_STATE.letterSpacing;
    }

    /**
     * Подписывается на TipTap-транзакции для синхронизации toolbar state с курсором.
     * watchEffect автоматически очищает предыдущий listener при смене editor.
     */
    watchEffect((onCleanup) => {
        const editor = toValue(editorRef);
        if (!editor) {
            return;
        }

        function handleTransaction(): void {
            editorTransactionCount.value++;
            $textEditorToolbar.syncToolbarState(editor!, toolbarState);
        }

        editor.on('transaction', handleTransaction);
        onCleanup(() => {
            editor.off('transaction', handleTransaction);
        });
    });

    return {
        toolbarState,
        editorTransactionCount,
        toolbarGroups,
        resetToolbarState,
    };
}
