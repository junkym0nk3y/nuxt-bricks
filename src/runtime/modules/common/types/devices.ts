/**
 * The device set: the single source of both the canvas widths and the media-query
 * thresholds.
 *
 * `width` plays both roles at once — it is the width of the sheet in the builder
 * and the `min-width` of the range on a published page. There is no separate list
 * of thresholds any more, so there are no gaps and no overlaps between the steps by
 * construction: the narrowest device serves the range starting at 0, the widest one
 * has no upper bound.
 */

/**
 * A device entry in the set of a page.
 *
 * The `key` reaches the schema (`props.responsive[key]`, `deviceVisibility[key]`)
 * and the names of the CSS variables, so it does not change after creation:
 * recomputing the key when the label is renamed would orphan every override of
 * every block.
 */
export interface IBricksPageDevice {
    key: string;
    label: string;
    /** Glyph key from the fixed set (`DEVICE_ICON_CHOICES`) */
    icon: string;
    /** Canvas width (px) and the `min-width` of the media-query range */
    width: number;
    /** Side padding of `.bricks-container`, rem */
    aside: number;
    maxWidth?: number;
    minWidth?: number;
    /**
     * The rem base the device is laid out in, e.g. `10px` or `0.6944vw`. It describes
     * the canvas sheet only: the builder forces `html { font-size: 10px }` and scales
     * the sheet content to this base, while on a published page the rem is set by the
     * consumer and the module does not touch it. A page device without it falls back
     * to the project device of the same key, then to `10px`.
     */
    remBase?: string;
}

/**
 * A device after resolution: plus the data neither a page nor the project has, and
 * with the rem base settled. `canvasHeight` is the height of the sheet in the builder,
 * a pure property of the interface: on a published page a device has no height at
 * all, and there is no point storing it in the schema.
 */
export interface IBricksResolvedDevice extends IBricksPageDevice {
    remBase: string;
    canvasHeight: number;
}

export type TBricksPageDeviceSet = IBricksPageDevice[];
/** The project set has the same shape as a page set; the name keeps the role apart */
export type TBricksProjectDeviceSet = IBricksPageDevice[];
export type TBricksResolvedDeviceSet = IBricksResolvedDevice[];

/**
 * The window width range a device serves.
 * The narrowest one has `min` equal to 0, the widest one has `max` of `Infinity`.
 */
export interface IBricksDeviceRange {
    key: string;
    min: number;
    max: number;
}

/**
 * An entry of the catalog of known devices.
 *
 * The catalog is the single table the default project set, the list of choices when
 * adding a device and the canvas sheet height all come from. Its labels are in
 * English: this is data traveling into the page schema rather than interface text
 * — otherwise the set would depend on the language selected at the moment of
 * creation.
 */
export interface IBricksDeviceCatalogEntry {
    label: string;
    icon: string;
    width: number;
    aside: number;
    maxWidth?: number;
    /** UI only: base height of the canvas sheet, px */
    canvasHeight: number;
}

/**
 * A choice when adding a device: a catalog entry along with its key.
 */
export interface IBricksDeviceChoice extends IBricksDeviceCatalogEntry {
    key: string;
}

/** Outcome of validating a set: success with a value, or the list of rejection reasons */
export type TBricksDeviceSetValidation =
    | { ok: true; value: TBricksPageDeviceSet }
    | { ok: false; errors: string[] };
