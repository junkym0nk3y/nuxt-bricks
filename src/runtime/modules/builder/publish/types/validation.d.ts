/**
 * Types of the publish form validation: the context of the yup factory and of the
 * checks before a write.
 */

import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

export interface IPublishValidationSchemaOptions {
    /** Translator of the i18n keys (the messages are resolved at validation time) */
    t: (key: string) => string;
    /**
     * Whether the live address of the page is free in the routing of the
     * application (`useBricksPageAddress`) — catches both the surfaces of the
     * builder and the pages of the consumer that cover a published address.
     */
    isPageAddressFree: (address: IBricksPageAddress) => boolean;
    /**
     * Whether the editor address of the page is free
     * (`<builderPrefix>/<urlPrefix>/<pagename>`).
     */
    isEditorAddressFree: (address: IBricksPageAddress) => boolean;
    /**
     * Whether the address is free of other pages (usually
     * `publishStore.isAddressAvailable`).
     */
    isAddressAvailable: (address: IBricksPageAddress, excludeId?: string | number) => boolean;
    /** Returns the id of the page excluded from the address uniqueness check */
    getExcludeId: () => string | number | undefined;
}

/**
 * The result of validating the publish form before a preview or a write.
 */
export interface IPublishFormValidationResult {
    /**
     * The form state with pagename/urlPrefix/subdomain trimmed (the same reference
     * when nothing changed).
     */
    formState: TPublishFormState;
    /** Per-field validation errors (empty means the validation passed) */
    errors: Record<string, string>;
}

/**
 * The rule of a mandatory text field: the length bounds and the message keys.
 */
export interface IRequiredTextRule {
    minLength: number;
    maxLength: number;
    requiredMessage: string;
    minMessage: string;
    maxMessage: string;
}
