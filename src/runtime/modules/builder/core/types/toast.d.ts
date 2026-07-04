/**
 * Типы toast-уведомлений билдера.
 */

/**
 * Состояние toast-уведомления.
 */
export interface IBuilderToastState {
    visible: boolean;
    message: string;
    variant: 'success' | 'error';
    duration?: number;
}
