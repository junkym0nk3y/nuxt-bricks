/**
 * Types of the editor of the device set of a page.
 */

import type {
    IBricksDeviceChoice,
    IBricksPageDevice,
    IBricksResolvedDevice,
    TBricksPageDeviceSet,
} from '../../../common/types/devices';

/** Props of the "add a device" menu */
export interface IPublishDeviceAddMenuProps {
    /** Devices of the catalog available to be added */
    choices: IBricksDeviceChoice[];
    /** The counter of the set next to the label: "3 of 4" */
    counter: string;
    disabled?: boolean;
}

/** Events of the "add a device" menu */
export interface IPublishDeviceAddMenuEmits {
    /** A device of the catalog was picked */
    select: [key: string];
}

/** Props of the device glyph picker */
export interface IPublishDeviceIconPopoverProps {
    /** The key of the current glyph in the catalog */
    icon: string;
    disabled?: boolean;
}

/** Events of the device glyph picker */
export interface IPublishDeviceIconPopoverEmits {
    /** A glyph of the catalog was picked */
    'update:icon': [icon: string];
}

/**
 * A row of the editor table.
 *
 * The width error lies in the row rather than in a shared list: it is printed
 * under its own field, and after a re-sorting there would be nothing to tie it to
 * its record by an index with.
 */
export interface IPublishDeviceRow extends IBricksPageDevice {
    /** An edge device: it cannot be removed, and carries a lock instead of a cross */
    isLocked: boolean;
    /** The error text of the width field; an empty string means there is no error */
    widthError: string;
    /** The error text of the name field; an empty string means there is no error */
    labelError: string;
}

/** Props of a device row of the editor table */
export interface IPublishDeviceRowProps {
    row: IPublishDeviceRow;
    disabled?: boolean;
}

/** Events of a device row of the editor table */
export interface IPublishDeviceRowEmits {
    /**
     * A field of the row was edited. The key travels along with the patch: the rows
     * are re-sorted by width, so an index would point at a neighbor after a sort.
     */
    update: [key: string, patch: Partial<IPublishDeviceRow>];
    /** The removal cross of an intermediate device was pressed */
    remove: [key: string];
}

/** A segment of the range scale under the table */
export interface IPublishDeviceRange {
    key: string;
    label: string;
    icon: string;
    /** The label of the range: "0 - 767" or "from 1600" */
    text: string;
    /** The device is open on the canvas — the segment is outlined */
    isActive: boolean;
}

/** Props of the range scale under the table */
export interface IPublishDeviceRangesProps {
    ranges: IPublishDeviceRange[];
}

/** What is lost when a device is removed — for the text of the confirmation */
export interface IPublishDeviceRemovalImpact {
    /** The number of the block property overrides bound to the device */
    overridesCount: number;
    /** The label of the device the freed range goes to */
    absorbedBy: string;
    /** The range moving over to the neighbor: "1280-1599" */
    absorbedRange: string;
}

/** Options of the set editor */
export interface IPublishDeviceSetOptions {
    /** Whether the modal is open: the draft is rebuilt from scratch on every opening */
    isOpen: () => boolean;
    /**
     * The set of the page at the moment of the opening; `null` — inherited from
     * the project.
     */
    initial: () => TBricksPageDeviceSet | null;
    /** The resolved set of the project — what the switch shows when turned off */
    projectDevices: () => IBricksResolvedDevice[];
    /** The key of the device open on the canvas (the highlight of the scale segment) */
    activeDeviceKey: () => string;
}
