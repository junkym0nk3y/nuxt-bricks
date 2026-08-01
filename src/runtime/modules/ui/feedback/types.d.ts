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
