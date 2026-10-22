<script setup lang="ts">
/**
 * @description Search field: one look for every list in the builder — the
 * component library, the dashboard page list, the media library.
 *
 * Before it, each place assembled its own search: in the components sidebar it
 * was a `BricksInput` with a glyph in `#prefix`, in the dashboard a native
 * `<input>` with an absolutely positioned magnifier and three dozen style lines
 * of its own, in the media library a third copy of the same. They drifted apart
 * silently: different height, different focus, and only one of the three had a
 * clear button.
 *
 * There is no field markup of its own here — it is a `BricksInput` with a glyph
 * and `clearable`. A component rather than a "rule to always write it this way":
 * such a rule holds exactly until the next list.
 *
 * The width is set by the caller through a class — it differs everywhere (280 in
 * the media library, the full column in the sidebar), and hardwiring it here
 * would mean overriding it in every other place.
 *
 * The exception that is NOT moved here: the search in the toolbar page selector.
 * There the field has to be a reka `ListboxFilter` — arrow keys and Enter from
 * it walk the rows of the list, and swapping it for a plain input would break
 * keyboard navigation.
 */

// #region Imports
// Types
import type { IBricksSearchInputProps, IBricksSearchInputEmits } from './types.d.ts';

// Components
import BricksInput from './BricksInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSearchInputProps>(), {
    placeholder: '',
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksSearchInputEmits>();
// #endregion

// #region Methods
/**
 * Passes the input upwards. The value is controlled: the field shows whatever
 * arrived through the prop, so the caller is free to filter or normalize the
 * query.
 */
function handleInput(value: string): void {
    emit('update:value', value);
}
// #endregion
</script>

<template>
    <BricksInput
        :value="props.value"
        type="text"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        clearable
        @update:value="handleInput"
    >
        <template #prefix>
            <BricksIcon icon="ta:outline-search" />
        </template>
    </BricksInput>
</template>
