export interface IBricksDisclosureProps {
    /** Section title, doubling as the accessible name of the disclosure button */
    label: string;
    /** Section is expanded. The state is controlled: content mounts only when open */
    value: boolean;
}

export interface IBricksDisclosureEmits {
    'update:value': [value: boolean];
}
