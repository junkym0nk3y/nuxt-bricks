/**
 * Типы toast-уведомлений билдера.
 */

/**
 * Состояние toast-уведомления. Состояние одно на всё приложение, поэтому у
 * каждого показа есть `token`: по нему автор сообщения гасит своё, не сбивая
 * чужое, успевшее его заменить (см. `useBuilderToast.hideToast`).
 */
export interface IBuilderToastState {
    visible: boolean;
    message: string;
    variant: 'success' | 'error' | 'info';
    duration?: number;
    /** Тост без автоскрытия — ждёт действия или закрытия пользователем. */
    autoHide?: boolean;
    /** Подпись кнопки действия; пустая — тост без действия. */
    actionLabel?: string;
    /** Кнопка действия тоста — короткий путь к самому действию. */
    onAction?: (() => void) | null;
    /** Клик по телу тоста — обычно «показать подробности». */
    onSelect?: (() => void) | null;
    /** Номер показа — им `hideToast` отличает своё сообщение от следующего. */
    token: number;
}

/**
 * Параметры тоста, ожидающего действия пользователя.
 */
export interface IBuilderActionToastOptions {
    message: string;
    actionLabel: string;
    onAction: () => void;
    /** Реакция на клик по телу; без неё тело тоста ведёт себя как обычный текст. */
    onSelect?: () => void;
    variant?: 'success' | 'error' | 'info';
}
