import type { Ref, VNodeChild } from 'vue';
import type { IBricksComponent } from '../../common/types/brick';
import type { IBrickExportModule } from '../../common/types/index';
import type { TApiRequestOptions } from '../../common/types/composables';

export interface IRendererBrickResolverOptions {
    findImportModule: (brickPath: string) => (() => Promise<IBrickExportModule>) | undefined;
}

export interface IRendererProps {
    component: IBricksComponent;
    allComponents?: IBricksComponent[];
    /** The key is `component.id` from the schema, hence a `Map` as the container. */
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

/**
 * Options of a single request of the public render clients (published page
 * lookup, data sources). The shape is the same as the builder client's: one
 * ofetch underlies both.
 *
 * Along with the shape comes the ban on hooks and on a retry policy. The public
 * clients have no need for it — they have nothing to leak, since they do not
 * forward identity at all (`credentials: 'omit'`) — but the transport contract is
 * the same for every client of the module, and the narrower of the two is the
 * safe one. They do not strip the keys at runtime: that guards identity, and
 * there is never any identity here.
 */
export type TPublicRequestOptions = TApiRequestOptions;
