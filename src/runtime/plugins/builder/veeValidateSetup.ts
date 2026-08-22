// Types
import type { Composer } from 'vue-i18n';
import type { NuxtApp } from '#app';

// Vendors
import { configure, defineRule } from 'vee-validate';
import { required, numeric, max, min } from '@vee-validate/rules';
import { setLocale } from 'yup';

/**
 * Registers the rules and the localized messages of vee-validate/yup.
 * Called by a lazy chunk from plugins/vee-validate.ts on the first hit of a builder
 * route — published pages do not load vee-validate/yup.
 *
 * @param nuxtApp - The Nuxt application instance (for the lazy `$i18n`).
 */
export function installVeeValidate(nuxtApp: NuxtApp): void {
    defineRule('required', required);
    defineRule('numeric', numeric);
    defineRule('max', max);
    defineRule('min', min);

    /**
     * Rule for checking decimal numbers (fractional values supported).
     * Examples of valid values: "29.2", "100", "-5.5", "0.123".
     * The error text is composed by the localized generateMessage.
     */
    defineRule('decimal', (value: string | number) => {
        if (value === null || value === undefined || value === '') {
            return true;
        }

        // Whole and fractional numbers are allowed, negative ones included
        return /^-?\d+(\.\d+)?$/.test(String(value));
    });

    defineRule('slug', (value: string) => {
        if (!value || typeof value !== 'string') {
            return true;
        }

        return /^[a-z0-9-]+$/.test(value);
    });

    /**
     * Translates a key through the global i18n. Called at the moment of validation,
     * so a change of locale is picked up without re-registering the messages.
     * `$i18n` is resolved lazily: the i18n plugin may be registered later (if the
     * consumer plugs @nuxtjs/i18n in after nuxt-bricks).
     *
     * @param key - Translation key (`bricks.validation.*`).
     * @param params - Named interpolation parameters.
     */
    function t(key: string, params?: Record<string, unknown>): string {
        const i18n = nuxtApp.$i18n as Composer | undefined;
        if (!i18n) {
            return key;
        }

        return params ? i18n.t(key, params) : i18n.t(key);
    }

    // The yup messages are functions: resolved at validation time → always the
    // current locale
    setLocale({
        mixed: {
            required: () => t('bricks.validation.required'),
            notType: () => t('bricks.validation.invalidValue'),
        },
        string: {
            min: ({ min: minLength }) => t('bricks.validation.stringMin', { min: minLength }),
            max: ({ max: maxLength }) => t('bricks.validation.stringMax', { max: maxLength }),
            matches: () => t('bricks.validation.invalidFormat'),
        },
    });

    /** Localized vee-validate messages, by rule name */
    const RULE_MESSAGES: Record<string, (field: string, params: Array<string | number>) => string> =
        {
            required: (field) => t('bricks.validation.fieldRequired', { field }),
            numeric: (field) => t('bricks.validation.fieldNumeric', { field }),
            decimal: (field) => t('bricks.validation.fieldDecimal', { field }),
            max: (field, params) => t('bricks.validation.fieldMax', { field, max: params[0] }),
            min: (field, params) => t('bricks.validation.fieldMin', { field, min: params[0] }),
            slug: (field) => t('bricks.validation.fieldSlug', { field }),
        };

    configure({
        validateOnBlur: true,
        validateOnChange: true,
        validateOnInput: false,
        generateMessage: (ctx) => {
            const fieldLabel = ctx.field || t('bricks.validation.fieldFallback');
            const params = Array.isArray(ctx.rule?.params)
                ? (ctx.rule?.params as Array<string | number>)
                : [];
            const buildMessage = ctx.rule?.name ? RULE_MESSAGES[ctx.rule.name] : undefined;

            return buildMessage
                ? buildMessage(fieldLabel, params)
                : t('bricks.validation.fieldInvalid', { field: fieldLabel });
        },
    });
}
