// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type {
    ISchemaFileInput,
    IUseSchemaFileTransferReturn,
    TSchemaFileReadResult,
} from '../types/composables';

// Utils
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * Перенос схемы страницы файлом: скачивание JSON и чтение выбранного файла с
 * валидацией структуры и ошибками чтения/парсинга.
 *
 * Схема приходит аргументом, а не берётся из стора канваса: композабл работает в
 * списке страниц, где канваса нет вовсе, — экспортируемую схему туда приносит
 * точечный запрос полной страницы.
 *
 * Ошибку композабл не хранит: он отдаёт исход чтения, а показывает его каждый
 * потребитель у себя. Общее поле ошибки роняло бы сообщение из модалки создания
 * в панель деталей и наоборот.
 */
export function useSchemaFileTransfer(): IUseSchemaFileTransferReturn {
    const { t } = useI18n();

    const fileInputRef = ref<HTMLInputElement | null>(null);

    /**
     * Собирает JSON-файл из схемы и скачивает его.
     *
     * @param schema - Схема страницы.
     * @param filename - Имя файла вместе с расширением.
     */
    function downloadSchema(schema: IBricksSchema, filename: string): void {
        const json = JSON.stringify(schema, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Открывает системный диалог выбора JSON-файла.
     */
    function openFilePicker(): void {
        fileInputRef.value?.click();
    }

    /**
     * Читает выбранный JSON-файл, разбирает и валидирует схему.
     *
     * @param input - Файловый input, в котором лежит выбор пользователя.
     * @returns Исход чтения либо `null`, если файл не выбран.
     */
    async function readSelectedFile(
        input: ISchemaFileInput | null
    ): Promise<TSchemaFileReadResult | null> {
        const file = input?.files?.[0];

        if (!input || !file) {
            return null;
        }

        // Сброс на любом исходе (успех, ранний возврат, отказ чтения) — иначе
        // повторный выбор того же файла после отклонённого импорта не вызовет
        // change-событие, и кнопка выглядела бы неработающей
        try {
            if (!file.name.endsWith('.json')) {
                return { status: 'error', message: t('bricks.schema.importErrorFileType') };
            }

            let text: string;

            try {
                text = await file.text();
            } catch {
                return { status: 'error', message: t('bricks.schema.importErrorRead') };
            }

            return parseSchemaText(text, file.name);
        } finally {
            input.value = '';
        }
    }

    /**
     * Разбирает текст файла в схему и проверяет контракт графа компонентов.
     *
     * @param text - Содержимое файла.
     * @param filename - Имя файла для метаданных выбора.
     * @returns Исход разбора.
     */
    function parseSchemaText(text: string, filename: string): TSchemaFileReadResult {
        let parsed: IBricksSchema;

        try {
            parsed = JSON.parse(text) as IBricksSchema;
        } catch {
            return { status: 'error', message: t('bricks.schema.importErrorParse') };
        }

        if (!parsed || !Array.isArray(parsed.components)) {
            return { status: 'error', message: t('bricks.schema.importErrorInvalid') };
        }

        const contractErrors = validateSchemaComponentGraph(parsed.components);

        if (contractErrors.length > 0) {
            return {
                status: 'error',
                message: t('bricks.schema.importErrorStructure', { detail: contractErrors[0] }),
            };
        }

        return {
            status: 'success',
            file: { schema: parsed, filename, blocksCount: parsed.components.length },
        };
    }

    return { fileInputRef, openFilePicker, readSelectedFile, downloadSchema };
}
