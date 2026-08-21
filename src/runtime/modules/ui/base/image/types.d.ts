import type { TBricksMediaLoadMode } from '../../../common/types/config';

export interface IBricksImageProps {
    /** The full file — what has to end up on screen eventually */
    src: string;
    alt?: string;
    /** Preview around 480px; `null` means no such variant, and the stage is skipped */
    previewSrc?: string | null;
    /** Mock around 32px; `null` means no such variant, and the stage is skipped */
    mockSrc?: string | null;
    /**
     * Progressive loading mode. The default is set by the caller (a prop on the
     * Media block, `off` everywhere else): the mode depends on the place in the
     * page, not on the file.
     */
    mode?: TBricksMediaLoadMode;
    /**
     * Above the fold: drops lazy loading and sets `fetchpriority="high"`. Above
     * the fold progressive loading hurts LCP — the full file is needed at once.
     */
    eager?: boolean;
    /**
     * The `object-fit` value of the image. The set repeats the native one,
     * `none` included: the Media block passes it straight through from its own
     * property, and substituting `fill` for `none` would silently stretch the
     * image in every schema already saved.
     */
    fit?: 'cover' | 'contain' | 'scale-down' | 'fill' | 'none';
    /**
     * Pixel dimensions of the full file. Needed to hold the space for the image
     * with `aspect-ratio` while the markup still carries a transparent 1×1: that
     * one has neither height nor ratio, and a block with `height: auto` would
     * collapse to zero.
     *
     * Without them the component honestly loads the preview right away —
     * progressive loading loses part of its saving, but the layout does not
     * jump. That is how schemas saved before dimensions started being stored
     * behave.
     */
    naturalWidth?: number | null;
    naturalHeight?: number | null;
}

export interface IBricksImageEmits {
    /** The full file has loaded and is on screen */
    load: [];
    /** The full file failed to load (broken link, deleted object) */
    error: [];
}
