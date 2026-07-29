import type { IMediaItem } from '../../../common/types/media';

export interface ISidebarExpose {
    handleMediaSelect: (item: IMediaItem) => void;
}

/**
 * Пропсы блокирующего экрана «сессия не открылась» (TheBuilderSessionError).
 */
export interface IBuilderSessionErrorProps {
    /** Техническая причина отказа из ошибки bootstrap'а. */
    message: string;
    /** Идёт повторная попытка — кнопка «Повторить» заблокирована. */
    isRetrying?: boolean;
}

/**
 * События блокирующего экрана «сессия не открылась».
 */
export interface IBuilderSessionErrorEmits {
    retry: [];
    openPagesManager: [];
}

/**
 * Аргументы guard'а сохранения (`runSaveWhenSessionReady`).
 */
export interface ISessionSaveGuardOptions {
    /** Открыта ли сессия до согласованного состояния. */
    isSessionReady: () => boolean;
    /** Само сохранение — выполняется только в согласованной сессии. */
    save: () => Promise<void>;
    /** Реакция на отказ: объяснение пользователю. */
    onBlocked: () => void;
}
