/**
 * Media gallery UI types.
 * Контрактные data-типы (IMediaItem, ответы API, TMediaGalleryContext)
 * живут в common/types/media.d.ts; серверные типы обработки — в persistence/types/media.d.ts.
 */

import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';

export interface IMediaGalleryProps {
    visible: boolean;
    context?: TMediaGalleryContext;
}

export interface IMediaGalleryEmits {
    close: [];
    select: [item: IMediaItem];
    error: [message: string];
}
