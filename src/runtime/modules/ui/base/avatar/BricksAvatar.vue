<script setup lang="ts">
/**
 * @description Account avatar: either a photo from storage or a letter on a
 * backing.
 *
 * The fallback is not a "no photo" placeholder but a state in its own right: a
 * photo is optional, and the first character of the caption is what tells
 * accounts apart in the corner of the screen and in a list. One formula for
 * every size (font size around 40% of the diameter, rounded to the 0.2rem step)
 * — otherwise the letter on a small avatar comes out disproportionately large,
 * and the corner of the screen "jumps" as the person changes.
 *
 * A failed photo load (`@error`) brings the letter back: the link lives in the
 * account column while the file sits in storage separately — the object could
 * have been swept away by a bucket cleanup, and without this the corner would
 * keep an empty square instead of a recognizable letter.
 *
 * The component is decorative (`aria-hidden`): the owner's name is always right
 * there — as text in the menu header and in the profile modal, as the
 * `aria-label` of the trigger button. A second reading of the same name by a
 * screen reader adds nothing.
 */

// #region Imports
// Types
import type { IBricksAvatarProps } from './types.d.ts';

// Vue
import { computed, ref, watch } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksAvatarProps>(), {
    imageUrl: null,
    size: 'md',
});
// #endregion

// #region Data
/** The photo failed to load — the letter is shown instead */
const hasImageError = ref(false);
// #endregion

// #region Computed
/**
 * First character of the caption. `Array.from` rather than `[0]`: the name is
 * written by a person, and the first character is sometimes an emoji or a letter
 * outside the BMP — indexing by code unit would cut it down to half a surrogate
 * pair.
 */
const initial = computed<string>(() => {
    const [first] = Array.from(props.name.trim());

    return first ? first.toLocaleUpperCase() : '';
});

const shouldShowImage = computed<boolean>(() => Boolean(props.imageUrl) && !hasImageError.value);
// #endregion

// #region Methods
/**
 * Marks the photo as unavailable.
 */
function handleImageError(): void {
    hasImageError.value = true;
}
// #endregion

// #region Lifecycle
// A changed link clears the previous failure: the component is reused (the
// corner of the screen lives for the whole session), and otherwise it would keep
// showing the letter after a new photo had loaded
watch(
    () => props.imageUrl,
    () => {
        hasImageError.value = false;
    }
);
// #endregion
</script>

<template>
    <span :class="[$style.BricksAvatar, $style[`_${props.size}`]]" aria-hidden="true">
        <img
            v-if="shouldShowImage"
            :src="props.imageUrl ?? undefined"
            alt=""
            :class="$style.image"
            decoding="async"
            @error="handleImageError"
        />

        <span v-else :class="$style.initial">{{ initial }}</span>
    </span>
</template>

<style module lang="scss">
.BricksAvatar {
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: var(--bricks-border-radius-pill);
    background: var(--bricks-base-100);
    user-select: none;
}

.image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.initial {
    font-weight: 600;
    line-height: 1;
    color: var(--bricks-base-500);
}

._sm {
    width: 3.6rem;
    height: 3.6rem;

    .initial {
        font-size: 1.4rem;
    }
}

._md {
    width: 4rem;
    height: 4rem;

    .initial {
        font-size: 1.6rem;
    }
}

._lg {
    width: 9.6rem;
    height: 9.6rem;

    .initial {
        font-size: 3.8rem;
    }
}
</style>
