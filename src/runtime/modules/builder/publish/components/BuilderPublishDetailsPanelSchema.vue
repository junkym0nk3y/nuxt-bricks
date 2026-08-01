<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDetailsPanelSchemaProps,
    IPublishDetailsPanelSchemaEmits,
} from '../types/dashboard';

// Utils
import { fetchPageRequest } from '../utils/publishApi';

// Vue
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useSchemaFileTransfer } from '../composables/useSchemaFileTransfer';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelSchemaProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelSchemaEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { fileInputRef, openFilePicker, readSelectedFile, downloadSchema } = useSchemaFileTransfer();

const isOpen = ref(false);
const isExporting = ref(false);
const errorMessage = ref('');

/**
 * Поколение экспорта. Список страниц несёт сводку без схемы, поэтому файл
 * собирается после точечного запроса — и за это время пользователь успевает
 * выбрать другую страницу. Скачивать файл прежней нельзя: он выглядел бы
 * ошибкой, а `isExporting` от старого ответа снял бы индикатор нового запроса.
 */
let exportGeneration = 0;
// #endregion

// #region Computed
const isBusy = computed<boolean>(() => isExporting.value || props.isImporting || props.isSaving);

/**
 * Строка под кнопками — одна на состояние: ожидание важнее ошибки, ошибка
 * важнее подсказки.
 */
const statusText = computed<string>(() => {
    if (isExporting.value) {
        return t('bricks.publish.dashboard.details.schema.exporting');
    }

    if (props.isImporting) {
        return t('bricks.publish.dashboard.details.schema.importing');
    }

    return errorMessage.value || t('bricks.publish.dashboard.details.schema.replaceHint');
});

const isPendingState = computed<boolean>(() => isExporting.value || props.isImporting);
// #endregion

// #region Methods
/**
 * Разворачивает/сворачивает секцию схемы.
 */
function handleToggle(): void {
    isOpen.value = !isOpen.value;
}

/**
 * Тянет полную страницу и скачивает её схему файлом `<pagename>.json`.
 *
 * Имя файла — слаг страницы: в редакторе в имя уходила дата, потому что страница
 * могла быть ещё не сохранена, а из списка экспортируется конкретная строка.
 */
async function handleExport(): Promise<void> {
    if (isBusy.value) {
        return;
    }

    const startedIn = ++exportGeneration;
    const pageId = props.page.id;
    const filename = `${props.page.pagename}.json`;

    isExporting.value = true;
    errorMessage.value = '';

    try {
        const fullPage = await fetchPageRequest(pageId);

        if (startedIn !== exportGeneration) {
            return;
        }

        downloadSchema(fullPage.schema, filename);
    } catch (error: unknown) {
        if (startedIn !== exportGeneration) {
            return;
        }

        errorMessage.value =
            error instanceof Error
                ? error.message
                : t('bricks.publish.dashboard.details.schema.exportFailed');
    } finally {
        if (startedIn === exportGeneration) {
            isExporting.value = false;
        }
    }
}

/**
 * Открывает диалог выбора JSON-файла.
 */
function handleImportClick(): void {
    if (isBusy.value) {
        return;
    }

    errorMessage.value = '';
    openFilePicker();
}

/**
 * Разбирает выбранный файл и отдаёт его контроллеру — подтверждение замены и
 * запись схемы принадлежат ему, а не секции.
 *
 * Чтение файла — уже асинхронное окно, и цель импорта обязана быть проверена
 * здесь, до эмита: панель деталей переиспользуется между страницами (своего
 * `key` у неё нет), поэтому к концу чтения большого файла `props.page` может
 * указывать на другую страницу — и файл, выбранный для одной, ушёл бы в другую.
 * Контроллер снимает цель уже с того, что приедет сюда, и такой подмены не
 * увидит.
 */
async function handleFileSelect(): Promise<void> {
    // Страница снимается до чтения и уходит наверх вместе с файлом: читать
    // `props.page` после await нельзя — он уже может указывать на другую
    // страницу, и файл ушёл бы в неё. Актуальность цели проверяет координатор
    const page = props.page;
    const result = await readSelectedFile(fileInputRef.value);

    if (!result) {
        return;
    }

    if (result.status === 'error') {
        errorMessage.value = result.message;
        return;
    }

    errorMessage.value = '';
    emit('import-file', page, result.file);
}
// #endregion

// #region Lifecycle
watch(
    () => props.page.id,
    () => {
        // Ответ запроса прежней страницы больше не нужен: он и скачал бы чужой
        // файл, и снял бы индикатор нового экспорта
        exportGeneration += 1;
        isExporting.value = false;
        errorMessage.value = '';
        isOpen.value = false;
    }
);

onBeforeUnmount(() => {
    exportGeneration += 1;
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDetailsPanelSchema">
        <button :class="$style.schemaToggle" type="button" @click="handleToggle">
            <BricksIcon
                icon="ta:outline-chevron-right"
                :class="[$style.schemaCaret, isOpen && $style.schemaCaretOpen]"
            />
            {{ t('bricks.publish.dashboard.details.schema.title') }}
        </button>

        <div v-if="isOpen" :class="$style.schemaContent">
            <div :class="$style.actions">
                <BricksButton
                    :class="$style.actionButton"
                    size="sm"
                    variant="secondary"
                    :disabled="isBusy"
                    @click="handleExport"
                >
                    <BricksIcon icon="ta:outline-download" />
                    {{ t('bricks.publish.exportJson') }}
                </BricksButton>
                <BricksButton
                    :class="$style.actionButton"
                    size="sm"
                    variant="secondary"
                    :disabled="isBusy"
                    @click="handleImportClick"
                >
                    <BricksIcon icon="ta:outline-upload" />
                    {{ t('bricks.publish.importJson') }}
                </BricksButton>
            </div>

            <input
                ref="fileInputRef"
                type="file"
                accept=".json"
                :class="$style.hiddenInput"
                @change="handleFileSelect"
            />

            <p
                :class="[
                    $style.status,
                    isPendingState && $style.statusPending,
                    !isPendingState && errorMessage && $style.statusError,
                ]"
            >
                <BricksIcon
                    v-if="isPendingState"
                    icon="ta:outline-loader-2"
                    :class="$style.statusSpinner"
                />
                {{ statusText }}
            </p>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanelSchema {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.schemaToggle {
    display: flex;
    align-items: center;
    align-self: flex-start;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition: color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover {
        color: var(--bricks-base-900);
    }
}

.schemaCaret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--bricks-default-transition);
}

.schemaCaretOpen {
    transform: rotate(90deg);
}

.schemaContent {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.actions {
    display: flex;
    gap: 0.8rem;
}

// Кнопки делят ширину контента панели поровну. Размер `sm`, а не `md`: на
// содержимое остаётся 28.8rem (полоса прокрутки съедает ещё 1.1rem), то есть по
// 14rem на кнопку — при `md` подпись с глифом не влезает ни в одну локаль и
// переносится на вторую строку, делая кнопку двухэтажной.
.actionButton {
    flex: 1;
    min-width: 0;
}

.hiddenInput {
    position: absolute;
    overflow: hidden;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

.status {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.statusPending {
    color: var(--bricks-base-600);
}

.statusError {
    color: var(--bricks-danger-500);
}

.statusSpinner {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}
</style>
