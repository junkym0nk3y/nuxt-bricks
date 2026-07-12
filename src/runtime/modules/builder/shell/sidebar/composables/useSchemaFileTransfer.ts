// Types
import type { IBricksSchema } from '../../../../common/types/brick';
import type { ISchemaFileTransferOptions } from '../types/composables';

// Utils
import { validateSchemaComponentGraph } from '../../../../common/utils/bricks/schemaContract';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

/**
 * Экспорт текущей схемы билдера в JSON-файл и импорт схемы из выбранного
 * пользователем файла (с валидацией структуры и ошибками чтения/парсинга).
 */
export function useSchemaFileTransfer(options: ISchemaFileTransferOptions) {
    const componentsStore = useComponentsStore();
    const { t } = useI18n();

    const fileInputRef = ref<HTMLInputElement | null>(null);
    const importError = ref<string | null>(null);

    /**
     * Экспортирует текущую схему в JSON-файл и скачивает его.
     */
    function handleExportSchema(): void {
        const schema = componentsStore.exportSchema();
        const json = JSON.stringify(schema, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `bricks-schema-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Открывает диалог выбора JSON-файла.
     */
    function handleImportClick(): void {
        importError.value = null;
        fileInputRef.value?.click();
    }

    /**
     * Читает выбранный JSON-файл и передаёт схему в onImport без сохранения.
     *
     * @param event - Событие выбора файла.
     */
    function handleFileSelect(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];

        if (!file) {
            return;
        }

        if (!file.name.endsWith('.json')) {
            importError.value = t('bricks.schema.importErrorFileType');
            input.value = '';
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result as string) as IBricksSchema;

                if (!parsed || !Array.isArray(parsed.components)) {
                    importError.value = t('bricks.schema.importErrorInvalid');
                    return;
                }

                const contractErrors = validateSchemaComponentGraph(parsed.components);

                if (contractErrors.length > 0) {
                    importError.value = t('bricks.schema.importErrorStructure', {
                        detail: contractErrors[0],
                    });
                    return;
                }

                options.onImport(parsed);
                importError.value = null;
            } catch {
                importError.value = t('bricks.schema.importErrorParse');
            } finally {
                // Сбрасываем input на любом исходе (успех/ранний return/catch) —
                // иначе повторный выбор того же файла после отклонённого импорта
                // не вызовет change-событие.
                input.value = '';
            }
        };

        reader.onerror = () => {
            importError.value = t('bricks.schema.importErrorRead');
            input.value = '';
        };

        reader.readAsText(file);
    }

    return { fileInputRef, importError, handleExportSchema, handleImportClick, handleFileSelect };
}
