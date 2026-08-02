// #region Imports
// Types
import type { IBuilderActionToastOptions, IBuilderToastState } from '../types/toast';

// Vue
import { reactive } from 'vue';
// #endregion

// Модульный синглтон: одно состояние на всё приложение, чтобы toast
// могли показывать и страница билдера, и глубокие потомки (контекстное меню канваса)
const toast = reactive<IBuilderToastState>({
    visible: false,
    message: '',
    variant: 'success',
    duration: 4000,
    autoHide: true,
    actionLabel: '',
    onAction: null,
    onSelect: null,
    token: 0,
});

/** Длительность тоста, ждущего ответа: скрытие — только по действию или крестику. */
const PERSISTENT_TOAST_DURATION = 0;

/**
 * Состояние toast-уведомления билдера и единая функция показа.
 */
export function useBuilderToast() {
    /**
     * Показывает toast с сообщением, вариантом и длительностью.
     *
     * @param message - Текст уведомления.
     * @param variant - Тип уведомления.
     * @param duration - Длительность показа (мс).
     * @returns Номер показа для `hideToast`.
     */
    function showToast(
        message: string,
        variant: IBuilderToastState['variant'] = 'success',
        duration = 4000
    ): number {
        toast.message = message;
        toast.variant = variant;
        toast.duration = duration;
        toast.autoHide = true;
        toast.actionLabel = '';
        toast.onAction = null;
        toast.onSelect = null;
        toast.token += 1;
        toast.visible = false;

        requestAnimationFrame(() => {
            toast.visible = true;
        });

        return toast.token;
    }

    /**
     * Показывает toast, который ждёт действия пользователя: не скрывается сам,
     * несёт кнопку и открывает её же по клику по телу тоста.
     *
     * @param options - Текст, подпись действия, обработчик и вариант.
     * @returns Номер показа для `hideToast`.
     */
    function showActionToast(options: IBuilderActionToastOptions): number {
        showToast(options.message, options.variant ?? 'info', PERSISTENT_TOAST_DURATION);

        toast.autoHide = false;
        toast.actionLabel = options.actionLabel;
        toast.onAction = options.onAction;
        toast.onSelect = options.onSelect ?? null;

        return toast.token;
    }

    /**
     * Скрывает toast, если на экране всё ещё он: чужое сообщение, успевшее
     * заменить своё, гасить нельзя — оно про другое событие.
     *
     * @param token - Номер показа, полученный от `showToast` / `showActionToast`.
     */
    function hideToast(token: number): void {
        if (toast.token !== token) {
            return;
        }

        toast.visible = false;
    }

    return { toast, showToast, showActionToast, hideToast };
}
