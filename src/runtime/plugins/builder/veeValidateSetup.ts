// Types
import type { Composer } from 'vue-i18n';
import type { NuxtApp } from '#app';

// Vendors
import { configure, defineRule } from 'vee-validate';
import { required, numeric, max, min } from '@vee-validate/rules';
import { setLocale } from 'yup';

/**
 * Регистрирует правила и локализованные сообщения vee-validate/yup.
 * Вызывается lazy-чанком из plugins/vee-validate.ts при первом заходе
 * на /bricks — published-страницы vee-validate/yup не грузят.
 *
 * @param nuxtApp - Экземпляр Nuxt-приложения (для ленивого `$i18n`).
 */
export function installVeeValidate(nuxtApp: NuxtApp): void {
    defineRule('required', required);
    defineRule('numeric', numeric);
    defineRule('max', max);
    defineRule('min', min);

    /**
     * Правило для проверки десятичных чисел (поддерживает дробные значения).
     * Пример валидных значений: "29.2", "100", "-5.5", "0.123"
     * Текст ошибки формирует локализованный generateMessage.
     */
    defineRule('decimal', (value: string | number) => {
        if (value === null || value === undefined || value === '') {
            return true;
        }

        // Разрешаем целые и дробные числа, включая отрицательные
        return /^-?\d+(\.\d+)?$/.test(String(value));
    });

    defineRule('slug', (value: string) => {
        if (!value || typeof value !== 'string') {
            return true;
        }

        return /^[a-z0-9-]+$/.test(value);
    });

    /**
     * Переводит ключ через глобальный i18n. Вызывается в момент валидации,
     * поэтому смена локали подхватывается без ре-регистрации сообщений.
     * `$i18n` резолвится лениво: плагин i18n может регистрироваться позже
     * (если потребитель подключает @nuxtjs/i18n после nuxt-bricks).
     *
     * @param key - Ключ перевода (`bricks.validation.*`).
     * @param params - Именованные параметры интерполяции.
     */
    function t(key: string, params?: Record<string, unknown>): string {
        const i18n = nuxtApp.$i18n as Composer | undefined;
        if (!i18n) {
            return key;
        }

        return params ? i18n.t(key, params) : i18n.t(key);
    }

    // Сообщения yup — функции: резолвятся при валидации → всегда актуальная локаль
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

    /** Локализованные сообщения vee-validate по имени правила. */
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
