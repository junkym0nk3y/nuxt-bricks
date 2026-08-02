/**
 * Общий набор SEO-полей страницы: сайдбар билдера и панель деталей дашборда
 * рисуют его одним компонентом, но владеют формой по-своему (vee-validate
 * `<Form>` против `useForm`), поэтому значения и ошибки приходят пропами.
 */

import type { TPublishFormErrors } from './dashboard';

export interface IPublishSeoFieldsProps {
    title: string;
    pagename: string;
    description: string;
    /** Ключевые слова строкой — ровно в том виде, в котором они и хранятся. */
    keywords: string;
    errors: TPublishFormErrors;
    /** Форма занята записью — поля блокируются целиком. */
    disabled?: boolean;
}

export interface IPublishSeoFieldsEmits {
    'update:title': [value: string];
    'update:pagename': [value: string];
    'update:description': [value: string];
    'update:keywords': [value: string];
}
