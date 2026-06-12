import type { IMediaItem } from '../../../common/types/media';

export interface ISidebarExpose {
    handleMediaSelect: (item: IMediaItem) => void;
}
