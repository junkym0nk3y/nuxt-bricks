import type { TIdaButtonSize } from '../button/types.d.ts';

export interface IBricksCloseButtonProps {
    disabled?: boolean;
    size?: TIdaButtonSize;
}

export interface IBricksCloseButtonEmits {
    click: [event: MouseEvent];
}

export type TBricksModalVariant = 'dark' | 'gradient';

export interface IBricksModalProps {
    /** Контролируемое состояние открытости */
    isOpen: boolean;
    /** Заголовок для скринридеров (DialogTitle, визуально скрыт) */
    title: string;
    /** Фон overlay: тёмный или градиентный */
    variant?: TBricksModalVariant;
    /** Добавляет padding 2rem на overlay */
    padded?: boolean;
    /** z-index overlay */
    zIndex?: number;
    /** Длительность transition в мс */
    duration?: number;
}

export interface IBricksModalEmits {
    close: [];
    /** Esc внутри модалки; event.preventDefault() отменяет закрытие */
    escapeKeyDown: [event: KeyboardEvent];
}
