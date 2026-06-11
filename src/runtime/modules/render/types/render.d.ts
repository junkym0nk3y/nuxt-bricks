import type { Ref, VNodeChild } from 'vue';
import type { LandingComponent } from '../../common/types/landing';
import type { ILandExportModule } from '../../common/types/index';

export interface IRendererStoryResolverOptions {
    findImportModule: (storyPath: string) => (() => Promise<ILandExportModule>) | undefined;
}

export interface IRendererProps {
    component: LandingComponent;
    allComponents?: LandingComponent[];
    resolvedProps?: Record<string, Record<string, unknown>>;
}

export type TRendererChildRenderer = (component: LandingComponent) => VNodeChild;

export interface IRendererLayoutsOptions {
    allComponents: Ref<LandingComponent[]>;
    styles: Record<string, string>;
    renderChild: TRendererChildRenderer;
}

export interface IRendererPlaceholderProps {
    title?: string;
    description?: string;
}
