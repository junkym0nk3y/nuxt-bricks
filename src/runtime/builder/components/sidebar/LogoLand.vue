<script setup lang="ts">
// #region Imports
// Vue
import { computed, ref, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        text?: string;
        isTouch?: boolean;
        to?: string | null;
        external?: boolean;
        target?: '_blank' | '_self';
        isInfiniteAnimation?: boolean;
    }>(),
    {
        color: 'white',
        text: 'От Иды, <br /> С любовью',
        isTouch: false,
        to: '/',
        external: false,
        target: '_blank',
        isInfiniteAnimation: false,
    }
);

// #endregion

// #region Data
const $style = useCssModule();
const isAnimating = ref(false);
// #endregion

// #region Computed
const classList = computed(() => [
    {
        [$style.animating]: isAnimating.value || props.isInfiniteAnimation,
        [$style.infinite]: props.isInfiniteAnimation,
        [$style.clickable]: Boolean(props.to),
    },
]);

const componentBind = computed(() => ({
    target: props.target,
    href: props.to || undefined,
}));

const isLink = computed<boolean>(() => Boolean(props.to));
// #endregion

// #region Methods
function onMouseenter() {
    if (isAnimating.value || props.isTouch) {
        return;
    }

    isAnimating.value = true;

    // Сбрасываем анимацию через 2.4 секунды (0.6 + 1 + 0.8)
    setTimeout(() => {
        isAnimating.value = false;
    }, 2400);
}
// #endregion
</script>

<template>
    <div :class="[$style.LogoLand, classList]">
        <component
            :is="isLink ? 'a' : 'div'"
            v-bind="isLink ? componentBind : {}"
            :class="$style.wrapper"
            @mouseenter="onMouseenter"
        >
            <div :class="$style.inner">
                <svg
                    viewBox="0 0 88 28"
                    :class="$style.logoIcon"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <g fill="currentColor">
                        <path
                            d="M2.83,6.53L7.26.37h2.75v10.16h-2.75v-6.16l-4.43,6.16H.08V.37h2.75v6.16Z"
                        />
                        <path
                            d="M21.72.37v7.57h1.73v2.59h-12.5v-2.59h.37c.22,0,.38-.01.5-.03.12-.02.25-.07.41-.16s.28-.25.37-.5c.09-.24.15-.56.17-.94.07-.98.1-2.96.1-5.94h8.85ZM15.13,7.93h3.83V2.98h-3.49c-.03,1.54-.05,2.57-.08,3.1-.04.76-.13,1.38-.27,1.86Z"
                        />
                        <path
                            d="M32.03,1.67V.37h2.73v10.16h-2.73v-1.35h-.1c-.33.49-.77.88-1.35,1.18s-1.22.46-1.94.47c-1.39,0-2.54-.5-3.46-1.5s-1.38-2.29-1.38-3.87.45-2.88,1.36-3.9S27.23.05,28.66.06c.71,0,1.35.15,1.92.45.57.3,1.02.69,1.35,1.16h.1ZM27.34,7.43c.51.52,1.17.79,1.97.79s1.46-.27,1.96-.81c.5-.54.75-1.19.75-1.97s-.25-1.45-.77-1.98c-.51-.53-1.16-.8-1.95-.8s-1.46.26-1.97.79c-.51.52-.76,1.19-.76,1.99s.25,1.47.76,1.99Z"
                        />
                    </g>
                    <g fill="currentColor">
                        <path
                            d="M10.36,13.87v10.3h-2.68v-7.65h-3.41c-.03,1.74-.05,2.88-.08,3.41-.03.59-.1,1.12-.21,1.59s-.23.85-.37,1.15c-.13.3-.31.55-.54.76-.23.21-.42.36-.6.46s-.4.18-.67.24c-.28.05-.49.09-.65.09-.15,0-.37.01-.65.01H0v-2.77h.2c.21,0,.37,0,.49-.03.11-.02.25-.08.41-.17.16-.09.28-.25.37-.5.09-.24.14-.55.17-.94.04-.92.07-2.91.1-5.96h8.63Z"
                        />
                        <path
                            d="M16.59,13.56c1.64,0,2.94.61,3.89,1.82.95,1.21,1.34,2.74,1.15,4.57h-7.46c.08.55.33,1.02.76,1.4.43.38.98.58,1.64.61.46.03.9-.06,1.3-.26.4-.2.69-.47.86-.8h2.8c-.32,1.13-.93,2.01-1.83,2.64-.9.63-1.94.94-3.14.94-1.6,0-2.86-.53-3.77-1.58-.91-1.05-1.37-2.35-1.37-3.88s.49-2.84,1.46-3.89c.97-1.05,2.21-1.57,3.7-1.57ZM18.07,16.51c-.42-.3-.92-.46-1.5-.46s-1.09.16-1.52.47-.72.73-.86,1.25h4.72c-.15-.54-.43-.96-.84-1.26Z"
                        />
                        <path
                            d="M29.56,17.61v-3.74h2.68v10.3h-2.68v-3.91h-4.19v3.91h-2.68v-10.3h2.68v3.74h4.19Z"
                        />
                        <path
                            d="M43.65,13.87v7.67h1.69v2.63h-2.56s-7.04,0-7.04,0h-2.56s0-2.63,0-2.63h.36c.21,0,.37,0,.49-.03.11-.02.24-.08.4-.17s.27-.26.36-.51c.09-.25.14-.57.17-.95.07-.99.1-3,.1-6.02h8.61ZM37.24,21.54h3.73v-5.03h-3.39c-.03,1.56-.05,2.61-.08,3.14-.04.77-.13,1.4-.26,1.88Z"
                        />
                        <path
                            d="M48.97,20.11l4.31-6.25h2.68v10.3h-2.68v-6.25l-4.31,6.25h-2.68v-10.3h2.68v6.25Z"
                        />
                        <path
                            d="M64.51,17.61v-3.74h2.68v10.3h-2.68v-3.91h-4.19v3.91h-2.68v-10.3h2.68v3.74h4.19Z"
                        />
                        <path d="M76.55,13.87v2.69h-4.98v7.61h-2.68v-10.3h7.66Z" />
                        <path
                            d="M80.03,20.11l4.31-6.25h2.68v10.3h-2.68v-6.25l-4.31,6.25h-2.68v-10.3h2.68v6.25Z"
                        />
                    </g>
                </svg>
                <div :class="$style.rectangleTop">
                    <span></span>
                </div>
                <div :class="$style.rectangleBottom">
                    <span></span>
                </div>
            </div>

            <div v-if="text" :class="$style.text" v-html="text"></div>
        </component>
    </div>
</template>

<style lang="scss" module>
.LogoLand {
    user-select: none;
}

.clickable {
    cursor: pointer;
}

.wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.inner {
    position: relative;
    flex-shrink: 0;
    width: 9rem;
    height: 3rem;
    padding: 1px;
}

.rectangleTop,
.rectangleBottom {
    position: absolute;
    left: -1px;
    overflow: hidden;

    span {
        position: absolute;
        top: 0;
        right: -2px;
        left: -2px;
        height: 100%;
        background: linear-gradient(
                to right,
                var(--land-base-900, currentColor) 50%,
                transparent 50%
            )
            100%;
        background-size: 200% 100%;
        transition: background-position 0.6s ease-in-out;
    }
}

.animating {
    .rectangleTop span,
    .rectangleBottom span {
        animation: slide-animation 2.4s ease-in-out;
    }
}

.infinite {
    .rectangleTop span,
    .rectangleBottom span {
        animation-iteration-count: infinite;
    }
}

@keyframes slide-animation {
    0% {
        background-position: 100%;
    }

    25% {
        background-position: 0%;
    }

    66% {
        background-position: 0%;
    }

    100% {
        background-position: -100%;
    }
}

.rectangleTop {
    top: 0;
    width: 42%;
    height: 50%;
}

.rectangleBottom {
    bottom: 0;
    width: 100%;
    height: calc(50% + 1px);
}

.logoIcon {
    width: 100%;
    height: 100%;
    color: var(--land-base-900, currentColor);
    transform: translate3d(0, 0, 0);
}

.text {
    flex-shrink: 0;
    margin-left: 2.4rem;
    font-size: var(--font-size-sm);
    font-weight: 500;
    line-height: 1.6rem;
}
</style>
