<script setup lang="ts">
/**
 * @description The publication card of a page: the "Published" switch, the live URL
 * of the page and the button copying it. Shared by the details panel of the dashboard
 * and the publish settings of the editor: the publication status of a page used to be
 * switchable from the dashboard alone, and a person who had just finished a page in the
 * editor had to leave it to publish it.
 *
 * The card owns no write and no toast: the hosts differ in both — the dashboard patches
 * a row of the list, the editor has to keep its publish form in step with the server
 * as well.
 *
 * The URL opens in a new tab: the person stays in the builder, and the live page next to
 * it shows what the visitors get. Until the host is known (SSR, before mount) the URL is
 * printed without a link — a link built on the domain stub would lead nowhere.
 */

// #region Imports
// Types
import type {
    IPublishPublicationCardProps,
    IPublishPublicationCardEmits,
} from '../types/dashboard';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksSwitch from '../../../ui/inputs/BricksSwitch.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishPublicationCardProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishPublicationCardEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/**
 * Passes the new publication flag to the host.
 *
 * @param value - The value of the switch.
 */
function handleToggle(value: boolean | string): void {
    emit('toggle-published', Boolean(value));
}

/**
 * Asks the host to copy the URL.
 */
function handleCopy(): void {
    emit('copy-url');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishPublicationCard">
        <BricksSwitch
            :value="props.published"
            :true-value="true"
            :false-value="false"
            false-label=""
            :disabled="props.disabled"
            :true-label="t('bricks.publish.dashboard.details.published')"
            @update:value="handleToggle"
        />
        <div v-if="props.liveUrl" :class="$style.urlRow">
            <BricksIcon icon="ph:link" :class="$style.urlIcon" />
            <a
                v-if="props.liveHref"
                :class="[$style.urlText, $style.urlLink]"
                :href="props.liveHref"
                :title="props.liveHref"
                target="_blank"
                rel="noopener noreferrer"
            >
                {{ props.liveUrl }}
            </a>
            <span v-else :class="$style.urlText">{{ props.liveUrl }}</span>
            <BricksIconButton
                icon="ta:outline-copy"
                :label="t('bricks.publish.dashboard.details.copyUrl')"
                variant="ghost"
                :disabled="!props.liveHref"
                @click="handleCopy"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishPublicationCard {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    background: var(--bricks-base-50);
}

.urlRow {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
}

.urlIcon {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    color: var(--bricks-base-400);
}

.urlText {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-primary-600);
}

.urlLink {
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }

    &:focus-visible {
        border-radius: var(--bricks-border-radius-xs);
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}
</style>
