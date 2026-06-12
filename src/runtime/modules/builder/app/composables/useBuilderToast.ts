// #region Imports
// Types
import type { IBuilderToastState } from '../types/composables';

// Vue
import { reactive } from 'vue';
// #endregion

/**
 * Состояние toast-уведомления билдера и единая функция показа.
 */
export function useBuilderToast() {
    const toast = reactive<IBuilderToastState>({
        visible: false,
        message: '',
        variant: 'success',
        duration: 4000,
    });

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
