<script setup lang="ts">
// #region Imports
// Types
import type { IBricksSchema } from '../../../../common/types/brick';
import type {
    ISidebarPublishSchemaActionsProps,
    ISidebarPublishSchemaActionsEmits,
} from '../types/components';

// Composables
import { useSchemaFileTransfer } from '../composables/useSchemaFileTransfer';

// Components
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPublishSchemaActionsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ISidebarPublishSchemaActionsEmits>();
// #endregion

// #region Data
const { fileInputRef, importError, handleExportSchema, handleImportClick, handleFileSelect } =
    useSchemaFileTransfer({
        onImport: handleImportSchema,
    });
// #endregion

// #region Methods
/**
 * Пробрасывает провалидированную схему родителю.
 */
function handleImportSchema(schema: IBricksSchema): void {
    emit('importSchema', schema);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPublishSchemaActions">
        <div :class="$style.schemaActions">
            <BricksButton
                size="md"
                variant="secondary"
                :disabled="props.isSubmitting"
                @click="handleExportSchema"
            >
                <BricksIcon icon="ph:download" />
                Экспорт JSON
            </BricksButton>
            <BricksButton
                size="md"
                variant="secondary"
                :disabled="props.isSubmitting"
                @click="handleImportClick"
            >
                <BricksIcon icon="ph:upload" />
                Импорт JSON
            </BricksButton>
        </div>

        <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            :class="$style.hiddenInput"
            @change="handleFileSelect"
        />

        <Transition mode="out-in" name="library-fade-fast">
            <div v-if="importError" :class="$style.error">
                {{ importError }}
            </div>
        </Transition>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPublishSchemaActions {
    display: flex;
    flex-direction: column;
}

.schemaActions {
    display: flex;
    gap: 0.8rem;
}

.hiddenInput {
    position: absolute;
    overflow: hidden;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

.error {
    margin-top: 0.4rem;
    font-size: 1.2rem;
    color: var(--bricks-danger-500);
}
</style>
