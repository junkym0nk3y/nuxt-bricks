import type { IMediaItem } from '../../../common/types/media';

export interface ISidebarExpose {
    handleMediaSelect: (item: IMediaItem) => void;
}

/**
 * Props of the loading overlay of the builder (TheBuilderLoader).
 */
export interface IBuilderLoaderProps {
    /**
     * A session is opening; the overlay holds until it ends, but no less than one
     * cycle of the animation.
     */
    isLoading: boolean;
}

/**
 * Events of the loading overlay.
 */
export interface IBuilderLoaderEmits {
    /**
     * The overlay has left the screen along with its animation — the workspace is
     * open. It is the departure that is announced rather than the end of loading:
     * the offer to restore a draft waits for exactly a freed screen, and shown any
     * earlier it would climb over the loader.
     */
    hidden: [];
}

/**
 * Props of the blocking "the session did not open" screen (TheBuilderSessionError).
 */
export interface IBuilderSessionErrorProps {
    /** The technical reason of the refusal, out of the bootstrap error. */
    message: string;
    /** A retry is under way — the "Retry" button is disabled. */
    isRetrying?: boolean;
}

/**
 * Events of the blocking "the session did not open" screen.
 */
export interface IBuilderSessionErrorEmits {
    retry: [];
    openPagesManager: [];
}

/**
 * Props of the choice window over a found draft (TheBuilderDraftRestoreModal).
 */
export interface IBuilderDraftRestoreModalProps {
    isOpen: boolean;
    /** The time of the last write of the draft (ISO) — what a person decides by. */
    updatedAt?: string | null;
}

/**
 * Events of the choice window over a found draft. Closing (`close`) is not an
 * answer: the draft stays and so does the offer. Only `discard` removes it.
 */
export interface IBuilderDraftRestoreModalEmits {
    close: [];
    restore: [];
    discard: [];
}

/**
 * Arguments of the save guard (`runSaveWhenSessionReady`).
 */
export interface ISessionSaveGuardOptions {
    /** Whether the session is open to a consistent state. */
    isSessionReady: () => boolean;
    /** The save itself — carried out in a consistent session only. */
    save: () => Promise<void>;
    /** The reaction to a refusal: an explanation to the person. */
    onBlocked: () => void;
}
