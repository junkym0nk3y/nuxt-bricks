// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type {
    IBricksPageTransferFile,
    IParsedEnvelope,
    ISchemaFileInput,
    IUseSchemaFileTransferReturn,
    TSchemaFileReadResult,
} from '../types/composables';

// Utils
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * Распознаёт конверт переноса страницы.
 *
 * Голая схема (файлы, записанные до появления набора устройств) конвертом не
 * считается и продолжает приниматься: сломать уже сохранённые у пользователей
 * файлы сменой формата нельзя.
 *
 * @param raw - Разобранный JSON файла.
 * @returns Конверт либо `null`, если это не он.
 */
function readEnvelope(raw: unknown): IParsedEnvelope | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return null;
    }

    const record = raw as Record<string, unknown>;

    if (record.version !== 1 || typeof record.schema !== 'object' || record.schema === null) {
        return null;
    }

    // Отсутствие поля и явный `null` — разные вещи, и подменять первое вторым
    // нельзя: `null` означает «источник наследовал набор проекта» и снимает
    // собственный набор целевой страницы, а конверт без поля про набор просто
    // ничего не говорит. Свои файлы пакет всегда пишет с полем
    const hasViewportConfig = Object.hasOwn(record, 'viewportConfig');

    return {
        version: 1,
        schema: record.schema as IBricksSchema,
        viewportConfig: hasViewportConfig
            ? ((record.viewportConfig ?? null) as TBricksPageDeviceSet | null)
            : undefined,
    };
}

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
     * Собирает JSON-файл переноса страницы и скачивает его.
     *
     * Пишется конверт со схемой и набором устройств: ключи `props.responsive` в
     * схеме относятся к набору страницы, и файл без него описывал бы раскладку,
     * которую нечем восстановить.
     *
     * @param schema - Схема страницы.
     * @param filename - Имя файла вместе с расширением.
     * @param viewportConfig - Набор устройств страницы либо `null`.
     */
    function downloadSchema(
        schema: IBricksSchema,
        filename: string,
        viewportConfig: TBricksPageDeviceSet | null
    ): void {
        const payload: IBricksPageTransferFile = { version: 1, schema, viewportConfig };
        const json = JSON.stringify(payload, null, 2);
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
        let raw: unknown;

        try {
            raw = JSON.parse(text);
        } catch {
            return { status: 'error', message: t('bricks.schema.importErrorParse') };
        }

        const envelope = readEnvelope(raw);
        const schema = envelope ? envelope.schema : (raw as IBricksSchema);

        if (!schema || !Array.isArray(schema.components)) {
            return { status: 'error', message: t('bricks.schema.importErrorInvalid') };
        }

        const contractErrors = validateSchemaComponentGraph(schema.components);

        if (contractErrors.length > 0) {
            return {
                status: 'error',
                message: t('bricks.schema.importErrorStructure', { detail: contractErrors[0] }),
            };
        }

        // `undefined`, а не `null`: legacy-схема и конверт без поля про набор
        // ничего не говорят, и целевая страница обязана сохранить свой
        let viewportConfig = envelope?.viewportConfig;

        if (envelope?.viewportConfig) {
            const validation = validateDeviceSet(envelope.viewportConfig);

            if (!validation.ok) {
                return {
                    status: 'error',
                    message: t('bricks.schema.importErrorDevices', {
                        detail: validation.errors[0],
                    }),
                };
            }

            // Дальше едет нормализованный набор, а не вход файла: валидатор
            // подрезает подписи и оставляет только объявленные поля, и записывать
            // в страницу надо именно его
            viewportConfig = validation.value;
        }

        return {
            status: 'success',
            file: {
                schema,
                filename,
                blocksCount: schema.components.length,
                kind: envelope ? 'envelope' : 'legacy',
                viewportConfig,
            },
        };
    }

    return { fileInputRef, openFilePicker, readSelectedFile, downloadSchema };
}
