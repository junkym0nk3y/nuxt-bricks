<script setup lang="ts">
/**
 * @description The blocking screen of a session that did not open: the technical
 * reason of the refusal plus the two actions left — a retry and the way out onto the
 * dashboard.
 *
 * Decisions held by the style section: the screen covers the whole workspace of the
 * editor rather than the canvas alone, because until the session opens neither the
 * canvas nor the panels of the properties and of the publish settings can save a
 * change. Hence `position: absolute; inset: 0` over `.content` and a z-index above
 * the sidebars (50) and the vertical navigation (60), yet below the loader — a
 * repeated attempt stays visible over the screen.
 */

// #region Imports
// Types
import type { IBuilderSessionErrorProps, IBuilderSessionErrorEmits } from '../types/builder';

// Vue
import { onMounted, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBuilderSessionErrorProps>(), {
    isRetrying: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBuilderSessionErrorEmits>();
// #endregion

// #region Data
const { t } = useI18n();

/** The retry button — the focus is taken onto it on mount. */
const retryButtonRef = useTemplateRef<InstanceType<typeof BricksButton>>('retryButton');
// #endregion

// #region Methods
/**
 * Asks the owner of the session to repeat the opening of the page.
 */
function handleRetry(): void {
    emit('retry');
}

/**
 * Takes the person onto the dashboard — the only safe way out of an inconsistent
 * session.
 */
function handleOpenPagesManager(): void {
    emit('openPagesManager');
}
// #endregion

// #region Lifecycle
onMounted(() => {
    // The focus may have stayed in a field of the workspace, which this screen has
    // just covered: without the move the keyboard would be left pointing at what
    // nobody can see and the screen reader with nothing announced
    retryButtonRef.value?.$el?.focus?.();
});
// #endregion
</script>

<template>
    <div
        :class="$style.TheBuilderSessionError"
        role="alertdialog"
        aria-labelledby="bricks-session-error-title"
        aria-describedby="bricks-session-error-description"
    >
        <div :class="$style.iconCircle">
            <BricksIcon icon="ta:outline-circle-x" :class="$style.icon" />
        </div>

        <h2 id="bricks-session-error-title" :class="$style.title">
            {{ t('bricks.publish.session.errorTitle') }}
        </h2>
        <p id="bricks-session-error-description" :class="$style.description">
            {{ t('bricks.publish.session.errorDescription') }}
        </p>
        <p :class="$style.reason">{{ props.message }}</p>

        <div :class="$style.actions">
            <BricksButton
                ref="retryButton"
                size="md"
                variant="primary"
                :disabled="props.isRetrying"
                @click="handleRetry"
            >
                {{ t('bricks.publish.session.errorRetry') }}
            </BricksButton>

            <BricksButton size="md" variant="quiet" @click="handleOpenPagesManager">
                {{ t('bricks.publish.session.errorOpenPages') }}
            </BricksButton>
        </div>
    </div>
</template>

<style module lang="scss">
.TheBuilderSessionError {
    position: absolute;
    z-index: 90;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    padding: 4rem 2.4rem;
    background: var(--bricks-base-0);
    inset: 0;
}

.iconCircle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 6.4rem;
    height: 6.4rem;
    margin-bottom: 1.2rem;
    border-radius: 50%;
    background: var(--bricks-base-100);
}

.icon {
    width: 2.8rem;
    height: 2.8rem;
    color: var(--bricks-danger-500);
}

.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.description {
    max-width: 36rem;
    margin: 0;
    text-align: center;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}

.reason {
    max-width: 48rem;
    margin: 0 0 1.6rem;
    text-align: center;
    font-family: monospace;
    font-size: 1.2rem;
    word-break: break-word;
    color: var(--bricks-text-muted);
}

.actions {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}
</style>
