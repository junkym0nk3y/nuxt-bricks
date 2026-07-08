// #region Imports
// Types
import type { IBuilderToastState } from '../types/toast';

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
});

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
     */
    function showToast(
        message: string,
        variant: 'success' | 'error' = 'success',
        duration = 4000
    ): void {
        toast.message = message;
        toast.variant = variant;
        toast.duration = duration;
        toast.visible = false;

        requestAnimationFrame(() => {
            toast.visible = true;
        });
    }

    return { toast, showToast };
}
