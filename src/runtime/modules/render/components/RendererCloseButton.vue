<script setup lang="ts">
/**
 * @description Кнопка закрытия превью на published-странице.
 *
 * Самодостаточная копия `ui/base/modal/BricksCloseButton`: `render` не
 * импортирует `ui` — иначе кит уехал бы в бандл published-страницы, где из него
 * нужна одна кнопка. Копия осознанная, но она однажды уже отстала (радиус `md` с
 * рамкой против `control` без рамки, ховер фоном вместо цвета глифа, не было
 * рамки фокуса), поэтому расхождение токенов сторожит
 * `test/render/rendererCloseButtonParity.spec.ts`.
 *
 * Доступное имя приходит снаружи: локалей в `render` нет, а зашитая строка
 * годилась бы ровно для одного языка. Единственное место вызова — баннер превью
 * — имя передаёт.
 */

// #region Interfaces
interface IRendererCloseButtonProps {
    disabled?: boolean;
}

interface IRendererCloseButtonEmits {
    click: [event: MouseEvent];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IRendererCloseButtonProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IRendererCloseButtonEmits>();
// #endregion

// #region Methods
/**
 * Пробрасывает клик наружу.
 *
 * @param event - MouseEvent.
 */
function handleClick(event: MouseEvent): void {
    emit('click', event);
}
// #endregion
</script>

<template>
    <button
        type="button"
        :class="$style.RendererCloseButton"
        :disabled="props.disabled"
        @click="handleClick"
    >
        <BricksIcon icon="ta:outline-x" />
    </button>
</template>

<style module lang="scss">
/* Те же значения, что у `ui/base/modal/BricksCloseButton`: копия обязана
   выглядеть тем же контролом, что и в билдере. Расхождение сторожит спека
   паритета — правится либо оба файла, либо ни один. */
.RendererCloseButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-control);
    border: none;
    background-color: var(--bricks-surface-raised);
    color: var(--bricks-base-600);
    transition:
        color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:not(:disabled):hover {
        color: var(--bricks-base-900);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    svg {
        width: 2rem;
        height: 2rem;
    }
}
</style>
