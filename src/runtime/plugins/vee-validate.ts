import { defineNuxtPlugin } from '#imports';
import { configure, defineRule } from 'vee-validate';
import { required, numeric, max, min } from '@vee-validate/rules';
import { setLocale } from 'yup';

defineRule('required', required);
defineRule('numeric', numeric);
defineRule('max', max);
defineRule('min', min);

/**
 * Правило для проверки десятичных чисел (поддерживает дробные значения).
 * Пример валидных значений: "29.2", "100", "-5.5", "0.123"
 */
defineRule('decimal', (value: string | number) => {
    if (value === null || value === undefined || value === '') {
        return true;
    }

    const stringValue = String(value);
    // Разрешаем целые и дробные числа, включая отрицательные
    return /^-?\d+(\.\d+)?$/.test(stringValue) ? true : 'Введите корректное число';
});

defineRule('slug', (value: string) => {
    if (!value || typeof value !== 'string') {
        return true;
    }

    return /^[a-z0-9-]+$/.test(value)
        ? true
        : 'Может содержать только строчные буквы, цифры и дефисы';
});

export default defineNuxtPlugin(() => {
    // Настройка yup локали для русских сообщений
    setLocale({
        mixed: {
            required: 'Обязательное поле',
            notType: 'Некорректное значение',
        },
        string: {
            min: 'Минимум ${min} символов',
            max: 'Максимум ${max} символов',
            matches: 'Некорректный формат',
        },
    });

    configure({
        validateOnBlur: true,
        validateOnChange: true,
        validateOnInput: false,
        generateMessage: (ctx) => {
            const fieldLabel = ctx.field || 'Поле';
            const params = Array.isArray(ctx.rule?.params)
                ? (ctx.rule?.params as Array<string | number>)
                : [];
            switch (ctx.rule?.name) {
                case 'required':
                    return `${fieldLabel} обязательно для заполнения`;
                case 'numeric':
                    return `${fieldLabel} должно содержать только цифры`;
                case 'decimal':
                    return `${fieldLabel} должно быть числом`;
                case 'max':
                    return `${fieldLabel} не может превышать ${params[0]} символов`;
                case 'min':
                    return `${fieldLabel} не может быть меньше ${params[0]}`;
                case 'slug':
                    return `${fieldLabel} должно содержать только строчные буквы, цифры и дефисы`;
                default:
                    return `${fieldLabel} заполнено некорректно`;
            }
        },
    });
});
