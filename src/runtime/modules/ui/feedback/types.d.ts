/**
 * Confirm Modal types
 */

export interface IBricksConfirmModalProps {
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: import('../base/button/types.d.ts').TIdaButtonVariant;
    isLoading?: boolean;
}

export interface IBricksConfirmModalEmits {
    close: [];
    confirm: [];
    /** Диалог ушёл из DOM — можно открывать следующую модалку (см. IBricksModalEmits). */
    afterLeave: [];
}

/**
 * Toast types
 */

export type TBricksToastVariant = 'success' | 'error' | 'info';

export interface IBricksToastProps {
    visible: boolean;
    message: string;
    variant?: TBricksToastVariant;
    autoHide?: boolean;
    duration?: number;
    /**
     * Подпись кнопки действия. Пустая — тост без действия: ни кнопки, ни реакции
     * на клик по телу.
     */
    actionLabel?: string;
}

export interface IBricksToastEmits {
    'update:visible': [value: boolean];
    /** Нажата кнопка действия. */
    action: [];
    /**
     * Клик по телу тоста мимо кнопок. Отдельно от `action`: кнопка — короткий
     * путь к самому действию, тело — «покажи подробности», и сводить их в одно
     * событие значит терять эту разницу.
     */
    select: [];
}
