import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IBuilderDraftSnapshot } from '../types/builderDrafts';

/**
 * Builds the object to compare out of the publish settings.
 *
 * The publication flag is left out: it is never an unsaved edit — the switch writes it
 * to the server at once, on the dashboard and in the editor alike — so a difference in
 * it is not a change to keep. Compared, a flag changed on the dashboard after a draft
 * was written made a draft equal to the saved page in everything else look like
 * unsaved work: the editor offered to restore it, and the autosave kept it.
 *
 * @param formState - Form state.
 */
function pickComparableFormState(formState: TPublishFormState): Record<string, unknown> {
    return {
        pagename: (formState.pagename ?? '').trim(),
        title: (formState.title ?? '').trim(),
        description: (formState.description ?? '').trim(),
        keywords: (formState.keywords ?? '').trim(),
        layout: formState.layout ?? '',
        backgroundColor: formState.backgroundColor ?? '',
        socialImage: formState.socialImage ?? '',
        urlPrefix: formState.urlPrefix ?? '',
        subdomain: formState.subdomain ?? '',
        // Without this an edit of a device width would not count as a change: the
        // form would be marked clean, and "Save" would go out without the set
        viewportConfig: formState.viewportConfig ?? null,
        headCode: formState.headCode ?? '',
        bodyEndCode: formState.bodyEndCode ?? '',
        noindex: formState.noindex === true,
    };
}

/**
 * Compares the publish settings only. Apart from the whole snapshot because the
 * schema would have to be serialized for that — and the form changes on every
 * character typed into a field, so there is no point in comparing the entire
 * canvas over it.
 *
 * @param a - The first form state.
 * @param b - The second form state.
 */
export function isFormStateEqual(a: TPublishFormState, b: TPublishFormState): boolean {
    return (
        JSON.stringify(pickComparableFormState(a)) === JSON.stringify(pickComparableFormState(b))
    );
}

/**
 * Compares two snapshots (schema + publish settings).
 *
 * @param a - The first snapshot.
 * @param b - The second snapshot.
 */
export function isSnapshotEqual(a: IBuilderDraftSnapshot, b: IBuilderDraftSnapshot): boolean {
    const schemaEqual = JSON.stringify(a.schema) === JSON.stringify(b.schema);
    if (!schemaEqual) {
        return false;
    }

    return isFormStateEqual(a.formState, b.formState);
}
