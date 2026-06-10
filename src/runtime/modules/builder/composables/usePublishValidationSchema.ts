import { object, string } from 'yup';
import { usePublishStore } from '../stores/publish';

/**
 * Composable для получения validation schema формы публикации.
 *
 * @param isEditing - режим редактирования (для проверки уникальности pagename).
 */
export function usePublishValidationSchema(isEditing: boolean) {
    const publishStore = usePublishStore();

    const validationSchema = object({
        pagename: string()
            .required('Необходимо указать pagename')
            .min(3, 'Минимум 3 символа')
            .max(80, 'Максимум 80 символов')
            .matches(/^[a-z0-9-]+$/, 'Допустимы только строчные буквы, цифры и дефис')
            .test('unique', 'Такой pagename уже занят', function (value) {
                if (!value) {
                    return true;
                }
                const editingPageId = isEditing
                    ? (publishStore.editingPageId ?? undefined)
                    : undefined;
                return publishStore.isPagenameAvailable(value, editingPageId);
            }),
        title: string()
            .required('Заголовок обязателен')
            .min(3, 'Минимум 3 символа')
            .max(120, 'Максимум 120 символов'),
        description: string()
            .required('Описание обязательно')
            .min(10, 'Минимум 10 символов')
            .max(500, 'Максимум 500 символов'),
        keywords: string().max(255, 'Максимум 255 символов'),
        socialImage: string().url('Некорректный URL').nullable(),
        backgroundColor: string().nullable(),
        layout: string().required('Layout обязателен'),
        urlPrefix: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/, 'Допустимы строчные буквы, цифры, дефис и /')
            .max(100, 'Максимум 100 символов'),
        subdomain: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]*$/, 'Допустимы только строчные буквы, цифры и дефис')
            .max(63, 'Максимум 63 символа'),
    });

    return {
        validationSchema,
    };
}
