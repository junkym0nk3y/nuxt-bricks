import type { Ref, VNodeChild } from 'vue';
import type { LandingComponent } from '../../types/landing';
import type { ILandExportModule } from '../../types/index';

export interface ILandingRendererStoryResolverOptions {
    findImportModule: (storyPath: string) => (() => Promise<ILandExportModule>) | undefined;
}

export interface ILandingRendererProps {
    component: LandingComponent;
    allComponents?: LandingComponent[];
    resolvedProps?: Record<string, Record<string, unknown>>;
}

export type TLandingRendererChildRenderer = (component: LandingComponent) => VNodeChild;

export interface ILandingRendererLayoutsOptions {
    allComponents: Ref<LandingComponent[]>;
    styles: Record<string, string>;
    renderChild: TLandingRendererChildRenderer;
}

export interface ILandingRendererPlaceholderProps {
    title?: string;
    description?: string;
}
