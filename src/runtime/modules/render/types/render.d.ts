import type { Ref, VNodeChild } from 'vue';
import type { IBricksComponent } from '../../common/types/brick';
import type { IBrickExportModule } from '../../common/types/index';

export interface IRendererBrickResolverOptions {
    findImportModule: (brickPath: string) => (() => Promise<IBrickExportModule>) | undefined;
}

export interface IRendererProps {
    component: IBricksComponent;
    allComponents?: IBricksComponent[];
    /** Ключ — `component.id` из схемы, поэтому контейнер — `Map`. */
    resolvedProps?: Map<string, Record<string, unknown>>;
}

export type TRendererChildRenderer = (component: IBricksComponent) => VNodeChild;

export interface IRendererLayoutsOptions {
    allComponents: Ref<IBricksComponent[]>;
    styles: Record<string, string>;
    renderChild: TRendererChildRenderer;
}

export interface IRendererPlaceholderProps {
    title?: string;
    description?: string;
}
