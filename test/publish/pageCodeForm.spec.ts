// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IPublishPageFormValues } from '../../src/runtime/modules/builder/publish/types/dashboard';

// Utils
import {
    normalizePageVersionPreview,
    normalizePublishedPage,
} from '../../src/runtime/modules/common/utils/bricks/publishedPage';
import {
    buildMetaPatchPayload,
    buildPagePayload,
} from '../../src/runtime/modules/builder/publish/utils/pagePayload';
import {
    buildCopyFormState,
    buildEditFormState,
    normalizeFormState,
} from '../../src/runtime/modules/builder/publish/utils/formState';
import { isFormStateEqual } from '../../src/runtime/modules/builder/publish/utils/draftSnapshots';
import { validatePublishFormState } from '../../src/runtime/modules/builder/publish/utils/formValidation';
import { createPublishValidationSchema } from '../../src/runtime/modules/builder/publish/utils/validationSchema';
import { PAGE_CODE_MAX_LENGTH } from '../../src/runtime/modules/common/constants/publish';
import { createFormStateBuilder, createPageBuilder } from '../helpers/publishFixtures';
// #endregion

const HEAD_CODE = '<script>ym(1, "init");</script>';
const BODY_CODE = '<noscript><img src="https://mc.example.com/watch/1" alt=""></noscript>';

const buildPage = createPageBuilder();
const buildFormState = createFormStateBuilder({
    description: 'A description longer than ten characters',
});

/**
 * Form values of the details panel with valid defaults.
 *
 * @param overrides - Fields on top of the defaults.
 * @returns The values of the meta form.
 */
function buildFormValues(overrides: Partial<IPublishPageFormValues> = {}): IPublishPageFormValues {
    return {
        pagename: 'landing',
        title: 'Landing',
        description: 'A description longer than ten characters',
        keywords: '',
        socialImage: '',
        urlPrefix: '',
        subdomain: '',
        layout: 'default',
        backgroundColor: '',
        headCode: '',
        bodyEndCode: '',
        noindex: false,
        ...overrides,
    };
}

describe('page code in the normalized page', () => {
    it('reads the snake_case fields of a database row or an external backend', () => {
        const page = normalizePublishedPage({
            id: 1,
            pagename: 'landing',
            head_code: HEAD_CODE,
            body_end_code: BODY_CODE,
            noindex: true,
        });

        expect(page.headCode).toBe(HEAD_CODE);
        expect(page.bodyEndCode).toBe(BODY_CODE);
        expect(page.noindex).toBe(true);
    });

    it('treats a page from a backend without the fields as code-free and indexable', () => {
        const page = normalizePublishedPage({ id: 1, pagename: 'landing' });

        expect(page.headCode).toBeNull();
        expect(page.bodyEndCode).toBeNull();
        expect(page.noindex).toBe(false);
    });

    it('does not take a truthy non-boolean for noindex', () => {
        expect(
            normalizePublishedPage({ id: 1, pagename: 'landing', noindex: 'false' }).noindex
        ).toBe(false);
    });

    it('runs a version preview with the code the page has now: versions do not carry it', () => {
        const {
            schema: _schema,
            isPreview: _isPreview,
            ...summary
        } = buildPage({
            headCode: HEAD_CODE,
            bodyEndCode: BODY_CODE,
            noindex: true,
        });

        const preview = normalizePageVersionPreview(
            { id: 99, pagename: 'landing', head_code: '<script>old</script>', noindex: false },
            summary
        );

        expect(preview.headCode).toBe(HEAD_CODE);
        expect(preview.bodyEndCode).toBe(BODY_CODE);
        expect(preview.noindex).toBe(true);
    });
});

describe('page code in the form state', () => {
    it('is carried into the edit form and into a copy of the page', () => {
        const page = buildPage({ headCode: HEAD_CODE, bodyEndCode: BODY_CODE, noindex: true });

        for (const formState of [buildEditFormState(page), buildCopyFormState(page, 'copy')]) {
            expect(formState.headCode).toBe(HEAD_CODE);
            expect(formState.bodyEndCode).toBe(BODY_CODE);
            expect(formState.noindex).toBe(true);
        }
    });

    it('fills in the fields missing from a draft written before they existed', () => {
        const formState = normalizeFormState({ pagename: 'landing' });

        expect(formState.headCode).toBeNull();
        expect(formState.bodyEndCode).toBeNull();
        expect(formState.noindex).toBe(false);
    });

    it('repairs the fields of a corrupted draft instead of passing them on', () => {
        const formState = normalizeFormState({
            pagename: 'landing',
            headCode: undefined,
            noindex: 'yes' as unknown as boolean,
        });

        expect(formState.headCode).toBeNull();
        expect(formState.noindex).toBe(false);
    });

    it('counts an edit of the code or of the flag as a change of the form', () => {
        const base = buildFormState();

        expect(isFormStateEqual(base, buildFormState({ headCode: HEAD_CODE }))).toBe(false);
        expect(isFormStateEqual(base, buildFormState({ bodyEndCode: BODY_CODE }))).toBe(false);
        expect(isFormStateEqual(base, buildFormState({ noindex: true }))).toBe(false);
    });

    it('does not count an emptied field as a change against no code at all', () => {
        expect(isFormStateEqual(buildFormState(), buildFormState({ headCode: '' }))).toBe(true);
    });
});

describe('page code in the request payloads', () => {
    it('sends the code and the flag with the page save, an empty field as null', () => {
        const payload = buildPagePayload(
            { components: [] },
            buildFormState({ headCode: HEAD_CODE, bodyEndCode: '', noindex: true })
        );

        expect(payload.headCode).toBe(HEAD_CODE);
        expect(payload.bodyEndCode).toBeNull();
        expect(payload.noindex).toBe(true);
    });

    it('sends the code and the flag with the meta PATCH of the details panel', () => {
        const payload = buildMetaPatchPayload(
            buildFormValues({ headCode: '', bodyEndCode: BODY_CODE, noindex: true })
        );

        expect(payload.headCode).toBeNull();
        expect(payload.bodyEndCode).toBe(BODY_CODE);
        expect(payload.noindex).toBe(true);
    });
});

describe('page code length check', () => {
    const tooLong = 'x'.repeat(PAGE_CODE_MAX_LENGTH + 1);

    it('stops a save of a draft carrying code over the limit', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ headCode: tooLong, bodyEndCode: tooLong }),
            () => true
        );

        expect(errors.headCode).toBe('bricks.publish.validation.codeMax');
        expect(errors.bodyEndCode).toBe('bricks.publish.validation.codeMax');
    });

    it('lets code within the limit through', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ headCode: 'x'.repeat(PAGE_CODE_MAX_LENGTH), bodyEndCode: BODY_CODE }),
            () => true
        );

        expect(errors).toEqual({});
    });

    it('shows the same error in the form schema', async () => {
        const schema = createPublishValidationSchema({
            t: (key) => key,
            isPageAddressFree: () => true,
            isEditorAddressFree: () => true,
            isAddressAvailable: () => true,
            getExcludeId: () => undefined,
        });

        await expect(
            schema.validateAt('bodyEndCode', buildFormValues({ bodyEndCode: tooLong }))
        ).rejects.toThrow('bricks.publish.validation.codeMax');
        await expect(
            schema.validateAt('headCode', buildFormValues({ headCode: HEAD_CODE }))
        ).resolves.toBe(HEAD_CODE);
    });
});
