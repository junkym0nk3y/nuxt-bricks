<script setup lang="ts">
/**
 * @description The schema section of the details panel: exporting the page into a
 * JSON file and picking a file to import into it.
 *
 * Decisions held by the markup and the style section: importing a schema rewrites
 * the page, that is, it is a write, so the button is available to an editor and
 * above, while the export stays available to everyone. The two buttons split the
 * width of the panel content evenly and carry the `sm` size rather than `md`:
 * 28.8rem is left for the content (the scrollbar eats another 1.1rem), that is,
 * 14rem per button — under `md` the label with its glyph fits in no locale and wraps
 * onto a second line, making the button two storeys tall.
 */

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
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksDisclosure from '../../../ui/base/disclosure/BricksDisclosure.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelSchemaProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelSchemaEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit } = useBuilderPermissions();
const { fileInputRef, openFilePicker, readSelectedFile, downloadSchema } = useSchemaFileTransfer();

const isOpen = ref(false);
const isExporting = ref(false);
const errorMessage = ref('');

/**
 * The generation of the export. The page list carries a summary with no schema, so
 * the file is assembled after a point request — and in that time a person has time
 * to select another page. Downloading the file of the previous one is not allowed:
 * it would look like an error, and an `isExporting` cleared by the old answer would
 * take the indicator of the new request away.
 */
let exportGeneration = 0;
// #endregion

// #region Computed
const isBusy = computed<boolean>(() => isExporting.value || props.isImporting || props.isSaving);

/**
 * The line under the buttons — one per state: waiting outranks an error, an error
 * outranks the hint.
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
 * Pulls the full page and downloads its schema as a `<pagename>.json` file.
 *
 * The name of the file is the slug of the page: in the editor the date went into
 * the name because the page might not have been saved yet, while from the list it is
 * one particular row that is exported.
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

        downloadSchema(fullPage.schema, filename, fullPage.viewportConfig);
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
 * Opens the dialog for picking a JSON file.
 */
function handleImportClick(): void {
    if (isBusy.value) {
        return;
    }

    errorMessage.value = '';
    openFilePicker();
}

/**
 * Parses the picked file and hands it over to the controller — the replacement
 * confirmation and the write of the schema belong to it rather than to the section.
 *
 * Reading a file is an asynchronous window already, and the target of the import
 * has to be settled here, before the emit: the details panel is reused between
 * pages (it carries no `key` of its own), so by the time a large file is read
 * `props.page` may point at another page — and a file picked for one would go into
 * another. The controller takes its target from whatever arrives here and would not
 * see such a substitution.
 */
async function handleFileSelect(): Promise<void> {
    // The page is taken before the read and travels upwards together with the file:
    // reading `props.page` after an await is not allowed — it may already point at
    // another page, and the file would go into that one. Whether the target is still
    // current is checked by the coordinator
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
        // The answer to the request of the previous page is no longer needed: it
        // would both download the wrong file and clear the indicator of the new
        // export
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
    <BricksDisclosure
        v-model:value="isOpen"
        :label="t('bricks.publish.dashboard.details.schema.title')"
    >
        <div :class="$style.schemaContent">
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
                    v-if="canEdit"
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
                :aria-label="t('bricks.publish.jsonFileInputLabel')"
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
    </BricksDisclosure>
</template>

<style module lang="scss">
.schemaContent {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.actions {
    display: flex;
    gap: 0.8rem;
}

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
    color: var(--bricks-text-muted);
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
