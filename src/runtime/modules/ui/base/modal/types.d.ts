import type { TBricksButtonSize } from '../button/types.d.ts';

export interface IBricksCloseButtonProps {
    disabled?: boolean;
    size?: TBricksButtonSize;
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
    /** Описание для скринридеров (DialogDescription, визуально скрыто); без него aria-describedby отключается явно */
    description?: string;
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
    /**
     * Leave-анимация закончилась, модалка ушла из DOM. Нужен тому, кто открывает
     * вторую модалку следом за первой: `force-mount` держит уезжающий диалог в
     * DOM до конца анимации, поэтому открытая синхронно вторая модалка встаёт
     * под ним (у неё свой z-index) и получает второй focus trap.
     */
    afterLeave: [];
}
