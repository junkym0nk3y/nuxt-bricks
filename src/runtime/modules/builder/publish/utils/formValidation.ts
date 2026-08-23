import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IPublishFormValidationResult, IRequiredTextRule } from '../types/validation';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import {
    DESCRIPTION_MAX_LENGTH,
    DESCRIPTION_MIN_LENGTH,
    KEYWORDS_MAX_LENGTH,
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    TITLE_MAX_LENGTH,
    TITLE_MIN_LENGTH,
} from '../../../common/constants/publish';
import { useBricksPageAddress } from '../../../common/composables/useBricksPageAddress';

/**
 * Translates a key through the global i18n (this utility is called outside a setup
 * context). `$i18n` is resolved lazily on every call — safe under any order of the
 * plugins.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

/**
 * Checks a mandatory text field: not empty, and within the length bounds.
 * The length is measured on the trimmed value — that is what the server saves.
 *
 * @param value - Field value.
 * @param rule - Length bounds and message keys.
 * @returns The error text, or an empty string.
 */
function validateRequiredText(value: string | null | undefined, rule: IRequiredTextRule): string {
    const trimmed = value?.trim() || '';

    if (!trimmed) {
        return t(rule.requiredMessage);
    }

    if (trimmed.length < rule.minLength) {
        return t(rule.minMessage);
    }

    if (trimmed.length > rule.maxLength) {
        return t(rule.maxMessage);
    }

    return '';
}

/**
 * Checks the pagename: not empty, the shape, the length bounds and the
 * availability of the addresses.
 *
 * The addresses are checked against the routing of the application rather than
 * against a list of names. The check is needed here too, even though the yup
 * schema of the form holds it as well: this validator is the last gate before a
 * write, and the form is not its only source — the state also arrives from a
 * localStorage draft, bypassing the fields together with their schema.
 *
 * Whether the address is taken by another page is checked not here but separately
 * (`validateAddressUniqueness`): that belongs to the pair as a whole, and its
 * error lands on the field a person will actually part the addresses with.
 *
 * @param address - Normalized page address.
 * @returns The error text, or an empty string.
 */
function validatePagename(address: IBricksPageAddress): string {
    const { pagename } = address;

    if (!pagename) {
        return t('bricks.publish.validation.pagenameRequired');
    }

    if (!/^[a-z0-9-]+$/.test(pagename)) {
        return t('bricks.publish.validation.pagenameFormat');
    }

    if (pagename.length < PAGENAME_MIN_LENGTH) {
        return t('bricks.publish.validation.pagenameMin');
    }

    if (pagename.length > PAGENAME_MAX_LENGTH) {
        return t('bricks.publish.validation.pagenameMax');
    }

    const { isPageAddressFree, isEditorAddressFree } = useBricksPageAddress();

    if (!isEditorAddressFree(address)) {
        return t('bricks.publish.validation.pagenameEditorTaken');
    }

    // With a prefix the address is the urlPrefix field's responsibility — the
    // error is put there
    if (address.urlPrefix === null && !isPageAddressFree(address)) {
        return t('bricks.publish.validation.pagenameAddressTaken');
    }

    return '';
}

/**
 * Puts the "address taken" error on the field a person parts the addresses with:
 * on `urlPrefix` when there is a prefix, on `pagename` when there is none. The
 * same convention as in the yup schema and for an address taken by the routing of
 * the application.
 *
 * @param address - Normalized page address.
 * @param isAddressAvailable - The check of whether the address is free of other pages.
 * @param errors - Error accumulator (mutated).
 */
function validateAddressUniqueness(
    address: IBricksPageAddress,
    isAddressAvailable: (address: IBricksPageAddress) => boolean,
    errors: Record<string, string>
): void {
    if (!address.pagename || isAddressAvailable(address)) {
        return;
    }

    const field = address.urlPrefix === null ? 'pagename' : 'urlPrefix';

    // An error already standing is not overwritten: the shape and the bounds
    // explain the field more precisely than the pair — assembled out of an
    // invalid value — being taken
    if (!errors[field]) {
        errors[field] = t('bricks.publish.validation.addressTaken');
    }
}

/**
 * Validates the optional routing fields (urlPrefix, subdomain).
 *
 * @param formState - Normalized form state (trimmed already).
 * @param errors - Error accumulator (mutated).
 */
function validateOptionalRoutingFields(
    formState: TPublishFormState,
    errors: Record<string, string>
): void {
    if (formState.urlPrefix && !/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(formState.urlPrefix)) {
        errors.urlPrefix = t('bricks.publish.validation.urlPrefixFormat');
    } else if (
        formState.urlPrefix &&
        !useBricksPageAddress().isPageAddressFree(
            toPageAddress(formState.pagename, formState.urlPrefix)
        )
    ) {
        // The address of the urlPrefix+pagename pair is taken in the routing of
        // the application: a page saved under it would no longer open
        errors.urlPrefix = t('bricks.publish.validation.urlPrefixAddressTaken');
    }

    if (formState.subdomain && !/^[a-z0-9-]+$/.test(formState.subdomain)) {
        errors.subdomain = t('bricks.publish.validation.subdomainFormat');
    }
}

/**
 * Validates the publish settings before a preview or a publication: the mandatory
 * pagename/title/description, their lengths, the shape of the pagename and of the
 * routing fields, the uniqueness of the address.
 *
 * The length bounds are the same constants as in the yup schema of the form and in
 * the server-side DTO check. Without them the sidebar used to light a field up in
 * red by the schema while the save went through anyway: the two checks each lived
 * with a rule set of their own.
 *
 * @param formState - The current form state.
 * @param isAddressAvailable - The check of whether the address is free (the page
 * being edited taken into account).
 * @returns The normalized form state and the per-field errors.
 */
export function validatePublishFormState(
    formState: TPublishFormState,
    isAddressAvailable: (address: IBricksPageAddress) => boolean
): IPublishFormValidationResult {
    const trimmedPagename = formState.pagename.trim();
    const trimmedUrlPrefix = formState.urlPrefix?.trim() || null;
    const trimmedSubdomain = formState.subdomain?.trim() || null;

    const isChanged =
        trimmedPagename !== formState.pagename ||
        trimmedUrlPrefix !== formState.urlPrefix ||
        trimmedSubdomain !== formState.subdomain;

    const normalized: TPublishFormState = isChanged
        ? {
              ...formState,
              pagename: trimmedPagename,
              urlPrefix: trimmedUrlPrefix,
              subdomain: trimmedSubdomain,
          }
        : formState;

    const errors: Record<string, string> = {};
    const address = toPageAddress(trimmedPagename, trimmedUrlPrefix);

    const pagenameError = validatePagename(address);
    if (pagenameError) {
        errors.pagename = pagenameError;
    }

    const titleError = validateRequiredText(normalized.title, {
        minLength: TITLE_MIN_LENGTH,
        maxLength: TITLE_MAX_LENGTH,
        requiredMessage: 'bricks.publish.validation.titleRequired',
        minMessage: 'bricks.publish.validation.titleMin',
        maxMessage: 'bricks.publish.validation.titleMax',
    });
    if (titleError) {
        errors.title = titleError;
    }

    const descriptionError = validateRequiredText(normalized.description, {
        minLength: DESCRIPTION_MIN_LENGTH,
        maxLength: DESCRIPTION_MAX_LENGTH,
        requiredMessage: 'bricks.publish.validation.descriptionRequired',
        minMessage: 'bricks.publish.validation.descriptionMin',
        maxMessage: 'bricks.publish.validation.descriptionMax',
    });
    if (descriptionError) {
        errors.description = descriptionError;
    }

    if ((normalized.keywords?.trim() || '').length > KEYWORDS_MAX_LENGTH) {
        errors.keywords = t('bricks.publish.validation.keywordsMax');
    }

    validateOptionalRoutingFields(normalized, errors);
    validateAddressUniqueness(address, isAddressAvailable, errors);

    return { formState: normalized, errors };
}
