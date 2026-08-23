// Types
import type { IPublishValidationSchemaOptions } from '../types/validation';
import type { TPublishFormState } from '../../../common/types/bricks-api';

// Utils
import { normalizeUrlPrefix, toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Yup
import { object, string, type ValidationError } from 'yup';

// Constants
import {
    DESCRIPTION_MAX_LENGTH,
    DESCRIPTION_MIN_LENGTH,
    KEYWORDS_MAX_LENGTH,
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    SUBDOMAIN_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    TITLE_MIN_LENGTH,
    URL_PREFIX_MAX_LENGTH,
} from '../../../common/constants/publish';

/**
 * Builds the yup schema validating the meta fields of a page. A pure factory bound
 * to neither the store nor i18n — the context (the translator, the uniqueness
 * check, the id to exclude) is passed from the outside, which is why the schema is
 * reused both by the sidebar of the builder (`usePublishValidationSchema`) and by
 * the details panel of the dashboard (`usePublishPageForm`).
 *
 * @param options - Validation context.
 * @returns The yup schema of the publish form.
 */
export function createPublishValidationSchema(options: IPublishValidationSchemaOptions) {
    const { t, isPageAddressFree, isEditorAddressFree, isAddressAvailable, getExcludeId } = options;

    return object({
        pagename: string()
            .required(() => t('bricks.publish.validation.pagenameRequired'))
            .min(PAGENAME_MIN_LENGTH, () => t('bricks.publish.validation.pagenameMin'))
            .max(PAGENAME_MAX_LENGTH, () => t('bricks.publish.validation.pagenameMax'))
            .matches(/^[a-z0-9-]+$/, () => t('bricks.publish.validation.pagenameFormat'))
            // The editor address includes the prefix, so it is the pair that is
            // checked: `bricks-login` with no prefix really does take the path
            // away from the login page, while `blog/bricks-login` lives under a
            // free path
            .test(
                'editorAddress',
                () => t('bricks.publish.validation.pagenameEditorTaken'),
                function (value): boolean {
                    const { urlPrefix } = this.parent as Pick<TPublishFormState, 'urlPrefix'>;

                    return !value || isEditorAddressFree(toPageAddress(value, urlPrefix));
                }
            )
            // The live address only when there is no prefix: with one the
            // address is the urlPrefix field's responsibility, and that is the
            // field that has to go red
            .test(
                'liveAddress',
                () => t('bricks.publish.validation.pagenameAddressTaken'),
                function (value): boolean {
                    const { urlPrefix } = this.parent as Pick<TPublishFormState, 'urlPrefix'>;

                    return (
                        !value ||
                        normalizeUrlPrefix(urlPrefix) !== null ||
                        isPageAddressFree(toPageAddress(value, null))
                    );
                }
            ),
        // trim: the server measures the length of the already trimmed string and
        // puts that very one into the database — without this a field of nothing
        // but spaces would pass the client-side check
        title: string()
            .trim()
            .required(() => t('bricks.publish.validation.titleRequired'))
            .min(TITLE_MIN_LENGTH, () => t('bricks.publish.validation.titleMin'))
            .max(TITLE_MAX_LENGTH, () => t('bricks.publish.validation.titleMax')),
        description: string()
            .trim()
            .required(() => t('bricks.publish.validation.descriptionRequired'))
            .min(DESCRIPTION_MIN_LENGTH, () => t('bricks.publish.validation.descriptionMin'))
            .max(DESCRIPTION_MAX_LENGTH, () => t('bricks.publish.validation.descriptionMax')),
        keywords: string()
            .trim()
            .max(KEYWORDS_MAX_LENGTH, () => t('bricks.publish.validation.keywordsMax')),
        socialImage: string()
            .url(() => t('bricks.publish.validation.socialImageUrl'))
            .nullable(),
        backgroundColor: string().nullable(),
        layout: string().required(() => t('bricks.publish.validation.layoutRequired')),
        urlPrefix: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/, () =>
                t('bricks.publish.validation.urlPrefixFormat')
            )
            .max(URL_PREFIX_MAX_LENGTH, () => t('bricks.publish.validation.urlPrefixMax'))
            // It is the pair with the pagename that is checked rather than the
            // prefix on its own: the address of a page is covered by their sum.
            // The error lands on urlPrefix — the pagename is valid by itself at
            // that moment (with no prefix the address of the page is free), and
            // the field that breaks the address is the one that has to go red
            .test(
                'addressTaken',
                () => t('bricks.publish.validation.urlPrefixAddressTaken'),
                function (value): boolean {
                    const { pagename } = this.parent as Pick<TPublishFormState, 'pagename'>;

                    return !value || !pagename || isPageAddressFree(toPageAddress(pagename, value));
                }
            ),
        subdomain: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]*$/, () => t('bricks.publish.validation.subdomainFormat'))
            .max(SUBDOMAIN_MAX_LENGTH, () => t('bricks.publish.validation.subdomainMax')),
    }).test('addressUnique', function (form): boolean | ValidationError {
        // Uniqueness is checked at the level of the object rather than in a test
        // of a field: it is the whole address that is taken, and a test hanging on
        // one field would not be recomputed on an edit of the other — a change of
        // the pagename would leave the error of the previous pair standing.
        if (!form?.pagename) {
            return true;
        }

        const address = toPageAddress(form.pagename, form.urlPrefix);

        if (isAddressAvailable(address, getExcludeId())) {
            return true;
        }

        // The field of the error is the one a person edits to part with the taken
        // address: with a prefix that is urlPrefix, without one it is the name
        // itself. The same convention as for an address taken by the routing of
        // the application.
        return this.createError({
            path: address.urlPrefix === null ? 'pagename' : 'urlPrefix',
            message: t('bricks.publish.validation.addressTaken'),
        });
    });
}
