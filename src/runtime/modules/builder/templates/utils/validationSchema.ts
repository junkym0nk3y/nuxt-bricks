/**
 * The yup schema of the form of a template — one for saving and for renaming: the
 * fields are the same (a name and a description), and once apart the two forms would
 * promise different things about one record.
 */
// #region Imports
// Constants
import {
    TEMPLATE_DESCRIPTION_MAX_LENGTH,
    TEMPLATE_NAME_MAX_LENGTH,
    TEMPLATE_NAME_MIN_LENGTH,
} from '../../../common/constants/templates';

// Yup
import { object, string } from 'yup';
// #endregion

/**
 * Assembles the validation schema of the form of a template.
 *
 * The bounds are taken from the shared constants rather than written out as numbers: a
 * client-side schema that has drifted from the server-side one either turns down a name
 * the server would have taken, or sends a request over the network that is refused for
 * certain.
 *
 * Whether the name is taken is not checked here at all — only the server knows that,
 * and its refusal lands under the field (see `isTemplateNameTakenError`).
 *
 * @param options - The translator of the messages.
 * @returns The yup schema of the form of a template.
 */
export function createTemplateValidationSchema(options: {
    t: (key: string, params?: Record<string, unknown>) => string;
}) {
    const { t } = options;

    return object({
        // `trim` before the bounds rather than after: the forms send trimmed values and
        // the server-side validator measures an already trimmed string — without it
        // "  a  " would pass the client-side minimum and come back as a generic refusal
        // of the server instead of a hint under the field
        name: string()
            .trim()
            .required(() => t('bricks.templates.validation.nameRequired'))
            .min(TEMPLATE_NAME_MIN_LENGTH, () =>
                t('bricks.templates.validation.nameTooShort', { min: TEMPLATE_NAME_MIN_LENGTH })
            )
            .max(TEMPLATE_NAME_MAX_LENGTH, () =>
                t('bricks.templates.validation.nameTooLong', { max: TEMPLATE_NAME_MAX_LENGTH })
            ),
        description: string()
            .trim()
            .max(TEMPLATE_DESCRIPTION_MAX_LENGTH, () =>
                t('bricks.templates.validation.descriptionTooLong', {
                    max: TEMPLATE_DESCRIPTION_MAX_LENGTH,
                })
            ),
    });
}
