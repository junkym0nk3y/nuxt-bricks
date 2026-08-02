import type { IMediaItem } from '../../../common/types/media';

export interface ISidebarExpose {
    handleMediaSelect: (item: IMediaItem) => void;
}

/**
 * Пропсы оверлея загрузки билдера (TheBuilderLoader).
 */
export interface IBuilderLoaderProps {
    /** Идёт открытие сессии; оверлей держится до её конца, но не меньше цикла анимации. */
    isLoading: boolean;
}

/**
 * События оверлея загрузки.
 */
export interface IBuilderLoaderEmits {
    /** Оверлей ушёл с экрана вместе с анимацией — рабочая область открыта. */
    hidden: [];
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
 * Пропсы окна выбора по найденному черновику (TheBuilderDraftRestoreModal).
 */
export interface IBuilderDraftRestoreModalProps {
    isOpen: boolean;
    /** Время последней записи черновика (ISO) — по нему пользователь и решает. */
    updatedAt?: string | null;
}

/**
 * События окна выбора по найденному черновику. Закрытие (`close`) — не ответ:
 * черновик остаётся, предложение тоже. Удаляет только `discard`.
 */
export interface IBuilderDraftRestoreModalEmits {
    close: [];
    restore: [];
    discard: [];
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
