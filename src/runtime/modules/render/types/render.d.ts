import type { Ref, VNodeChild } from 'vue';
import type { BricksComponent } from '../../common/types/brick';
import type { IBrickExportModule } from '../../common/types/index';

export interface IRendererStoryResolverOptions {
    findImportModule: (storyPath: string) => (() => Promise<IBrickExportModule>) | undefined;
}

export interface IRendererProps {
    component: BricksComponent;
    allComponents?: BricksComponent[];
    resolvedProps?: Record<string, Record<string, unknown>>;
}

export type TRendererChildRenderer = (component: BricksComponent) => VNodeChild;

export interface IRendererLayoutsOptions {
    allComponents: Ref<BricksComponent[]>;
    styles: Record<string, string>;
    renderChild: TRendererChildRenderer;
}

export interface IRendererPlaceholderProps {
    title?: string;
    description?: string;
}
