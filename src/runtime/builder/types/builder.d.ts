import type { IMediaItem } from '../../media/types/media';

export interface IBuilderSidebarExpose {
    handleMediaSelect: (item: IMediaItem) => void;
}
