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
    /** The page asks search engines not to index it */
    noindex: boolean;
    /** Third-party HTML put at the end of `<head>` of the published page */
    headCode: string;
    /** Third-party HTML put at the end of `<body>` of the published page */
    bodyEndCode: string;
    errors: TPublishFormErrors;
    /** The form is busy writing — the fields are blocked whole */
    disabled?: boolean;
}

export interface IPublishSeoFieldsEmits {
    'update:title': [value: string];
    'update:pagename': [value: string];
    'update:description': [value: string];
    'update:keywords': [value: string];
    'update:noindex': [value: boolean];
    'update:headCode': [value: string];
    'update:bodyEndCode': [value: string];
}
