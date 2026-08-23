/**
 * The shared set of the SEO fields of a page: the sidebar of the builder and the
 * details panel of the dashboard draw it with one component but own the form each
 * in their own way (the vee-validate `<Form>` against `useForm`), so the values and
 * the errors arrive as props.
 */

import type { TPublishFormErrors } from './dashboard';

export interface IPublishSeoFieldsProps {
    title: string;
    pagename: string;
    description: string;
    /** The keywords as a string — exactly the shape they are stored in */
    keywords: string;
    errors: TPublishFormErrors;
    /** The form is busy writing — the fields are blocked whole */
    disabled?: boolean;
}

export interface IPublishSeoFieldsEmits {
    'update:title': [value: string];
    'update:pagename': [value: string];
    'update:description': [value: string];
    'update:keywords': [value: string];
}
