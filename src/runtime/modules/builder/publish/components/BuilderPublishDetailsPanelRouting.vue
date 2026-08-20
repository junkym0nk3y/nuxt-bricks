<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDetailsPanelRoutingProps,
    IPublishDetailsPanelRoutingEmits,
} from '../types/dashboard';

// Vue
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksDisclosure from '../../../ui/base/disclosure/BricksDisclosure.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelRoutingProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelRoutingEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const isOpen = ref(false);
// #endregion

// #region Lifecycle
watch(
    () => props.page.id,
    () => {
        isOpen.value = Boolean(props.page.urlPrefix || props.page.subdomain);
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksDisclosure v-model:value="isOpen" :label="t('bricks.publish.dashboard.details.routing')">
        <div :class="$style.routingFields">
            <div :class="$style.field">
                <BricksInput
                    label="URL Prefix"
                    :value="props.urlPrefix"
                    type="text"
                    :max-length="100"
                    placeholder="blog"
                    :disabled="props.isDisabled"
                    :error-message="props.errors.urlPrefix"
                    @update:value="(val: string) => emit('update:urlPrefix', val)"
                />
                <BricksFieldHint>{{ t('bricks.publish.urlPrefixHint') }}</BricksFieldHint>
            </div>
            <div :class="$style.field">
                <BricksInput
                    :label="t('bricks.publish.subdomain')"
                    :value="props.subdomain"
                    type="text"
                    :max-length="63"
                    placeholder="spb"
                    :disabled="props.isDisabled"
                    :error-message="props.errors.subdomain"
                    @update:value="(val: string) => emit('update:subdomain', val)"
                />
                <BricksFieldHint>{{ t('bricks.publish.subdomainHint') }}</BricksFieldHint>
            </div>
        </div>
    </BricksDisclosure>
</template>

<style module lang="scss">
.routingFields {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}
</style>
