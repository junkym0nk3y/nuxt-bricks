/**
 * Types for Bricks Builder
 */

import type { TBricksResolvedDeviceSet } from './devices';

// Props of the layout blocks live in layouts-blocks/types/blockProps.d.ts

/**
 * Device key from the set of a page or of the project.
 *
 * It stopped being a literal union: the set is arbitrary (2–4 devices, the key is
 * built out of the label on creation), so the validity of a key is checked
 * against the set itself — `validateDeviceSet` in
 * `common/utils/bricks/devices.ts` — rather than by the type system. Only
 * `mobile` and `desktop` are guaranteed to be present: they are mandatory and
 * always the outermost ones.
 */
export type TBricksDeviceKey = string;

export type TCanvasDragSource = 'canvas' | 'library';

export interface IDragVisualSize {
    width: number;
    height: number;
    isFullWidth?: boolean;
}

export interface ICanvasDragStartPayload extends IDragVisualSize {
    source: TCanvasDragSource;
    componentId?: string | null;
}

export interface ICanvasDragState {
    source: TCanvasDragSource | null;
    componentId: string | null;
    width: number;
    height: number;
    isFullWidth: boolean;
    /**
     * The original of the block being dragged has been taken out of the flow. Set
     * with a delay after dragstart, otherwise an immediate display:none on the
     * source cancels the native drag.
     */
    sourceVacated: boolean;
}

/** Value of an editable brick property (the single source of truth for props values) */
export type TBrickPropValue = string | number | boolean | Record<string, unknown> | Array<unknown>;

/** Demo/default value of a brick: TBrickPropValue + the rare primitives and the nullable variants */
export type TBrickDemoValues =
    | string
    | number
    | boolean
    | symbol
    | bigint
    | null
    | undefined
    | Record<string, unknown>
    | Array<unknown>;

/**
 * Visibility of a block per device: device key → whether to show it.
 *
 * A missing key means "visible": pages have different device sets, and listing
 * every key with a `true` value in the schema would have to be redone on every
 * edit of the set. That is why only the explicit `false` values reach the schema.
 */
export type IDeviceVisibilityConfig = Record<string, boolean>;

// Component instance on canvas
export interface IComponentSlotDefinition {
    name: string;
    label?: string;
    description?: string;
    allowMultiple?: boolean;
}

export interface IBricksComponentSlot extends IComponentSlotDefinition {
    children: string[];
}

export interface IBricksComponent {
    id: string;
    type: 'layout' | 'component'; // Tells Layout blocks apart from regular components
    componentName: string; // 'grid', 'flex', 'space' for a layout, or the name of a UI component
    brickPath: string;
    zIndex: number;
    props: Record<string, unknown>;
    // Nesting
    parent?: string; // ID of the parent component
    children?: string[]; // Array of child component IDs (layout only)
    slots?: IBricksComponentSlot[];
    slotName?: string;
    fullWidth?: boolean;
    isHidden?: boolean;
    htmlId?: string; // Custom HTML id for anchor navigation
    deviceVisibility?: Partial<IDeviceVisibilityConfig>;
    // Grid positioning (for components inside a Grid Layout)
    gridColumn?: string; // e.g. '1 / 3' or 'span 2'
    gridRow?: string; // e.g. '2 / 4' or 'span 2' or 'auto'
}

// Component library item
export interface IComponentLibraryItem {
    name: string;
    category: string;
    brickPath: string;
    description?: string;
    thumbnail?: string;
    defaultProps?: Record<string, unknown>;
    slots?: IComponentSlotDefinition[];
}

export interface INavigationItem {
    id: string;
    target: string;
    label: string;
}

export interface INavigationMeta {
    items: INavigationItem[];
}

export interface IBricksSchemaMeta {
    navigation?: INavigationMeta;
    [key: string]: unknown;
}

export interface IBricksSchema {
    components: IBricksComponent[];
    meta?: IBricksSchemaMeta;
}

// Canvas state
export interface ICanvasState {
    /**
     * Resolved device set of the current page. Put here by the composition root:
     * `builder/core` is not allowed to import `builder/publish`, where the form
     * holding `viewportConfig` lives.
     */
    devices: TBricksResolvedDeviceSet;
    width: number;
    height: number;
    scale: number;
    viewport: TBricksDeviceKey;
    isFigmaMode: boolean;
    showGrid: boolean;
    isViewportSwitching: boolean;
    /** The user zoomed manually (wheel/buttons) — auto-fit does not overwrite the scale */
    hasManualZoom: boolean;
    /** In Figma mode — the viewport where a component was clicked last */
    activeViewport: TBricksDeviceKey | null;
    /** Transient drag state: not serialized into the schema/history */
    dragState: ICanvasDragState;
    /** Canvas width and height before entering Figma mode (to restore them on exit) */
    _preFigmaWidth: number | null;
    _preFigmaHeight: number | null;
    /** Counter of viewport switches: the timer of an outdated switch must not clear the flag */
    _viewportSwitchGeneration: number;
}

// Property editor types
export type TPropertyType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'select'
    | 'textarea'
    | 'switch'
    | 'input'
    | 'image'
    | 'video'
    | 'color'
    | 'array'
    | 'object'
    | 'readonly'
    | 'inline-content'
    | 'tags'
    | 'image-gallery'
    | 'accordion-items';

export interface IPropertyDefinition {
    name: string;
    type: TPropertyType;
    label: string;
    default: TBrickDemoValues;
    options?: Array<{ label: string; value: TBrickDemoValues }>;
    description?: string;
    listDelimiter?: string;
    /** Minimum value for number properties */
    min?: number;
    /** Maximum value for number properties */
    max?: number;
    /** Step for number properties */
    step?: number;
    showWhen?: {
        field: string;
        equals: unknown;
    };
    /** Field configuration for the image-gallery editor */
    fields?: {
        title?: boolean;
        tags?: boolean;
    };
    /** Name of the property to store svgContent in when an SVG is picked from the gallery */
    svgContentProperty?: string;
    /**
     * Names of the properties to store the URLs of the downscaled variants in when
     * an image is picked from the gallery (progressive loading).
     *
     * The same way as `svgContentProperty`: a block stores an image as a string
     * rather than as a media id, so it cannot derive the addresses of the variants
     * from `src` — the extension of a variant does not match the extension of the
     * full file, and external URLs have no variants at all. A guess along the
     * lines of "append a suffix to the name" would give a 404 on every image that
     * does not come from the media library.
     */
    previewUrlProperty?: string;
    mockUrlProperty?: string;
    /**
     * Names of the properties to store the pixel dimensions of the picked image
     * in.
     *
     * Progressive loading needs them: until the frame enters the viewport, a
     * transparent 1×1 stands in place of the image, and it has neither a height
     * nor a ratio. The space for the image is held by `aspect-ratio` at that
     * moment, and there is nowhere else to get it from — a block stores the image
     * as a string, while the dimensions live in the media library.
     */
    naturalWidthProperty?: string;
    naturalHeightProperty?: string;
    /**
     * Name of the property holding the kind of the file (`image` / `video`).
     *
     * Filled in from the MIME type of the picked file rather than by the person: the
     * gallery knows what the file is, and asking again is asking for a mismatch — a
     * video picked while the kind still said `image` rendered as an `<img>` with the
     * address of a video, that is, as nothing at all, on the canvas and on the page
     * alike.
     */
    mediaTypeProperty?: string;
    /** Unit suffix for the input (for example, 'rem') */
    unit?: string;
    /** Group name that folds the properties into a collapsible accordion */
    group?: string;
    /** The property supports responsive values per breakpoint */
    responsive?: boolean;
}

export type TSidebarView = 'components' | 'publish' | 'schema';

// Selected component
export interface ISelectedComponent {
    id: string;
    properties: IPropertyDefinition[];
    description?: string;
}
