import type { IMediaItem } from '../../media/types/media';

export interface ISidebarExpose {
    handleMediaSelect: (item: IMediaItem) => void;
}
