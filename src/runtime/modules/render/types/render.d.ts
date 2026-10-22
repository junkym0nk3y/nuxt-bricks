import type { Ref, VNode, VNodeChild } from 'vue';
import type { IBricksComponent } from '../../common/types/brick';
import type { IBrickExportModule } from '../../common/types/index';
import type { TApiRequestOptions } from '../../common/types/composables';

export interface IRendererBrickResolverOptions {
    findImportModule: (brickPath: string) => (() => Promise<IBrickExportModule>) | undefined;
    /** Hands a key of the client manifest to the SSR response; absent outside the server */
    registerSsrModule?: (manifestKey: string) => void;
}

/** The part of the Vue SSR context the renderer writes into */
export interface IRendererSsrContext {
    /** Keys of the client manifest whose stylesheets and preloads the response links */
    modules?: Set<string>;
}

/**
 * Texts of the placeholder of an unavailable component. Supplied by the preview
 * surface alone: `render` carries no locales of its own (i18n is installed under
 * `features.builder`), and a visitor of the published page must not be shown the
 * internal state of the component library in whatever language the editor happens
 * to run. Absent labels mean "render an empty node in its place".
 */
export interface IRendererPlaceholderLabels {
    /** Builds the title out of the component name taken from the schema. */
    title: (componentName: string) => string;
    /** Shown when the brick file is missing from the library. */
    missingBrick: string;
}

export interface IRendererProps {
    component: IBricksComponent;
    /**
     * The schema components by id, built once per page rather than per renderer:
     * the page mounts one renderer per root component, so an index derived inside
     * the renderer would be rebuilt as many times as there are roots.
     *
     * Required with no default on purpose: an omitted index renders every container
     * childless, and that is a silent defect — as a required prop it is a type error
     * instead.
     */
    componentIndex: ReadonlyMap<string, IBricksComponent>;
    /** The key is `component.id` from the schema, hence a `Map` as the container. */
    resolvedProps?: Map<string, Record<string, unknown>>;
    /** Diagnostics of an unavailable component; `null` on a published page. */
    placeholderLabels?: IRendererPlaceholderLabels | null;
}

export type TRendererChildRenderer = (component: IBricksComponent) => VNodeChild;

export interface IRendererLayoutsOptions {
    componentIndex: Ref<ReadonlyMap<string, IBricksComponent>>;
    styles: Record<string, string>;
    renderChild: TRendererChildRenderer;
}

/**
 * Why the guard refused to render a layout block: the component is its own
 * ancestor (`cycle`) or the chain is deeper than the schema contract allows
 * (`depth`).
 */
export type TRendererLayoutRefusalReason = 'cycle' | 'depth';

/**
 * Answer of the layout dispatcher.
 *
 * Three outcomes rather than `VNode | null`, because `not-layout` and `refused`
 * demand opposite things from the caller: the first is the normal route to the
 * brick resolver, the second must never reach it — a refused LAYOUT block has no
 * brick file, the resolver stays silent on the `layout` prefix, and the visitor
 * would be shown "the component is missing from the library" for what is in fact
 * a corrupted component tree.
 */
export type TRendererLayoutResult =
    | { kind: 'rendered'; vnode: VNode }
    | { kind: 'not-layout' }
    | { kind: 'refused'; reason: TRendererLayoutRefusalReason };

export interface IRendererPlaceholderProps {
    title: string;
    description?: string;
}

/**
 * The preview close button. `disabled` is the only state it carries — the
 * accessible name arrives as a slot-free prop of the banner, because `render`
 * carries no locales of its own.
 */
export interface IRendererCloseButtonProps {
    disabled?: boolean;
}

export interface IRendererCloseButtonEmits {
    click: [event: MouseEvent];
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

/**
 * Third-party code of a page in the shape the SSR render hands it to the Nitro
 * `render:html` hook: the page setup puts it into the request context, and the
 * hook appends it to the document.
 */
export interface IRendererPageCode {
    /** HTML for the end of `<head>` */
    head: string | null;
    /** HTML for the end of `<body>` */
    bodyEnd: string | null;
}

/**
 * The parts of the SSR document the page code is appended to — the subset of the
 * Nuxt render context the hook touches, so the util does not depend on Nuxt types.
 */
export interface IRendererHtmlParts {
    head: string[];
    bodyAppend: string[];
}

declare module 'h3' {
    interface H3EventContext {
        /**
         * Code of the published page being rendered (put here by the render page,
         * read by the `render:html` hook).
         */
        bricksPageCode?: IRendererPageCode;
    }
}
