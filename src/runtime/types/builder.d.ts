import type { IMediaItem } from './media';

export interface IBuilderSidebarExpose {
    handleMediaSelect: (item: IMediaItem) => void;
}
