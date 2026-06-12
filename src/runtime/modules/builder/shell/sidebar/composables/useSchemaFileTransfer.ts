// Types
import type { IBricksSchema } from '../../../../common/types/brick';
import type { ISchemaFileTransferOptions } from '../types/composables';

// Vue
import { ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

/**
 * Экспорт текущей схемы билдера в JSON-файл и импорт схемы из выбранного
 * пользователем файла (с валидацией структуры и ошибками чтения/парсинга).
 */
export function useSchemaFileTransfer(options: ISchemaFileTransferOptions) {
    const componentsStore = useComponentsStore();

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
            importError.value = 'Выберите файл формата .json';
            input.value = '';
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result as string) as IBricksSchema;

                if (!parsed.components || !Array.isArray(parsed.components)) {
                    importError.value = 'Невалидная схема: отсутствует массив components';
                    return;
                }

                options.onImport(parsed);
                importError.value = null;
            } catch {
                importError.value = 'Ошибка парсинга JSON-файла';
            }

            input.value = '';
        };

        reader.onerror = () => {
            importError.value = 'Ошибка чтения файла';
            input.value = '';
        };

        reader.readAsText(file);
    }

    return { fileInputRef, importError, handleExportSchema, handleImportClick, handleFileSelect };
}
