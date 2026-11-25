export interface IBricksDisclosureProps {
    /** Section title, doubling as the accessible name of the disclosure button */
    label: string;
    /** Section is expanded. The state is controlled: content mounts only when open */
    value: boolean;
    /**
     * Level of the heading the toggle sits in, for a section that titles a part of the
     * page: a screen reader then reaches it by its heading navigation. Without it the
     * toggle is a plain button
     */
    headingLevel?: TBricksDisclosureHeadingLevel;
}

/** Heading levels a disclosure title may take */
export type TBricksDisclosureHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface IBricksDisclosureEmits {
    'update:value': [value: boolean];
}
