<script setup lang="ts">
// #region Imports
// Types
import type { IPublishDeviceRange } from '../types/devices';

// Vue
import { useI18n } from 'vue-i18n';

// Utils
import { resolveDeviceIcon } from '../../../common/utils/bricks/devices';
// #endregion

// #region Props
const props = withDefaults(defineProps<{ ranges: IPublishDeviceRange[] }>(), {});
// #endregion

// #region Data
const { t } = useI18n();
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDeviceRanges">
        <span :class="$style.caption">{{ t('bricks.devices.rangesTitle') }}</span>

        <div :class="$style.scale">
            <div
                v-for="range in props.ranges"
                :key="range.key"
                :class="[$style.segment, { [$style.segmentActive]: range.isActive }]"
            >
                <span :class="$style.segmentLabel">
                    <BricksIcon :icon="resolveDeviceIcon(range.icon)" />
                    {{ range.label }}
                </span>
                <span :class="$style.segmentRange">{{ range.text }}</span>
            </div>
        </div>

        <p :class="$style.hint">{{ t('bricks.devices.rangesHint') }}</p>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDeviceRanges {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.caption {
    text-transform: uppercase;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-500);
}

.scale {
    display: flex;
    gap: 0.4rem;
}

.segment {
    display: flex;
    align-items: center;
    flex: 1;
    padding: 0.8rem 0.4rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid transparent;
    background: var(--bricks-base-100);
    flex-direction: column;
    gap: 0.2rem;
}

// Устройство, открытое на канвасе: рамкой, а не заливкой — сегмент остаётся
// читаемым рядом с соседями
.segmentActive {
    border-color: var(--bricks-primary-default);
    background: var(--bricks-primary-50);
}

.segmentLabel {
    display: flex;
    align-items: center;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
    gap: 0.4rem;
}

.segmentRange {
    font-size: 1.1rem;
    color: var(--bricks-base-500);
}

.hint {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.4;
    color: var(--bricks-base-500);
}
</style>
