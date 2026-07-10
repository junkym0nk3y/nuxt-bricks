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

// #region Methods
/**
 * Разворачивает/сворачивает секцию маршрутизации.
 */
function handleToggle(): void {
    isOpen.value = !isOpen.value;
}
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
    <div :class="$style.BuilderPublishDetailsPanelRouting">
        <button :class="$style.routingToggle" type="button" @click="handleToggle">
            <BricksIcon
                icon="ta:outline-chevron-right"
                :class="[$style.routingCaret, isOpen && $style.routingCaretOpen]"
            />
            {{ t('bricks.publish.dashboard.details.routing') }}
        </button>

        <div v-if="isOpen" :class="$style.routingFields">
            <div :class="$style.field">
                <BricksInput
                    label="URL Prefix"
                    :value="props.urlPrefix"
                    type="text"
                    :max-length="100"
                    placeholder="blog"
                    :disabled="props.isSaving"
                    :error-message="props.errors.urlPrefix"
                    @update:value="(val: string) => emit('update:urlPrefix', val)"
                />
                <span :class="$style.fieldHint">{{ t('bricks.publish.urlPrefixHint') }}</span>
            </div>
            <div :class="$style.field">
                <BricksInput
                    :label="t('bricks.publish.subdomain')"
                    :value="props.subdomain"
                    type="text"
                    :max-length="63"
                    placeholder="spb"
                    :disabled="props.isSaving"
                    :error-message="props.errors.subdomain"
                    @update:value="(val: string) => emit('update:subdomain', val)"
                />
                <span :class="$style.fieldHint">{{ t('bricks.publish.subdomainHint') }}</span>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanelRouting {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.routingToggle {
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

.routingCaret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--bricks-default-transition);
}

.routingCaretOpen {
    transform: rotate(90deg);
}

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

.fieldHint {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}
</style>
