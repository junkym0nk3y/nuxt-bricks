<script setup lang="ts">
/**
 * @description Шапка модалки: заголовок, необязательная подпись под ним, слот
 * действий и крестик.
 *
 * Заголовок компонент не принимает пропом, а берёт из `BricksModal` через
 * провайд. Причина не в удобстве: то же значение уходит в скрытый `DialogTitle`,
 * то есть в имя диалога для скринридера, а пока видимый заголовок писали в
 * шаблоне руками, эти две строки были двумя источниками правды и могли
 * разъехаться молча.
 *
 * Отдельного `size` под каждый случай нет: две ступени (`md` — диалоги и формы,
 * `lg` — рабочие модалки на весь экран) заменяют семь паддингов и четыре размера
 * заголовка, которые накопились, пока шапку писали в каждой модалке заново.
 */

// #region Imports
// Types
import type { IBricksModalHeaderProps, IBricksModalHeaderEmits } from './types.d.ts';

// Constants
import { BRICKS_MODAL_TITLE_KEY } from '../../../common/constants/injectionKeys';

// Vue
import { computed, inject, useCssModule } from 'vue';

// Components
import BricksCloseButton from './BricksCloseButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksModalHeaderProps>(), {
    size: 'md',
    bordered: true,
    closeDisabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksModalHeaderEmits>();
// #endregion

// #region Data
const $style = useCssModule();

/**
 * Заголовок открытой модалки. Провайдер отсутствует только если шапку поставили
 * вне `BricksModal` — вне модалки у неё нет ни смысла, ни крестика, который
 * что-то закрывает.
 */
const injectedTitle = inject(BRICKS_MODAL_TITLE_KEY, null);
// #endregion

// #region Computed
const title = computed<string>(() => injectedTitle?.value ?? '');

const rootClasses = computed(() => [
    $style.BricksModalHeader,
    $style[`_${props.size}`],
    { [$style._bordered]: props.bordered },
]);
// #endregion
</script>

<template>
    <div :class="rootClasses">
        <div :class="$style.titleGroup">
            <h2 :class="$style.title">
                <!--
                    Текст в своём узле, а не прямо в заголовке: длинный заголовок
                    (логин в форме пароля) обрезается многоточием, а рядом бывает
                    плашка со счётчиком — без отдельного узла обрезка съедала бы
                    и её.
                -->
                <span :class="$style.titleText">{{ title }}</span>
                <slot name="titleExtra" />
            </h2>

            <p v-if="$slots.subtitle" :class="$style.subtitle">
                <slot name="subtitle" />
            </p>
        </div>

        <div :class="$style.actions">
            <slot name="actions" />

            <BricksCloseButton :disabled="props.closeDisabled" @click="emit('close')" />
        </div>
    </div>
</template>

<style module lang="scss">
.BricksModalHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;

    // Шапка не сжимается: у модалок с ограниченной высотой скроллится тело, и
    // без этого шапка отдавала бы ему свои отступы
    flex-shrink: 0;
    gap: 1.6rem;

    &._md {
        padding: 1.6rem 2rem;
    }

    &._lg {
        padding: 2rem 2.4rem;
    }

    &._bordered {
        border-bottom: 1px solid var(--bricks-base-200);
    }
}

.titleGroup {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;

    // Иначе группа не даёт заголовку сжаться, и обрезка многоточием не работает
    min-width: 0;
}

.title {
    display: flex;
    align-items: center;
    min-width: 0;
    margin: 0;
    gap: 0.8rem;
    color: var(--bricks-base-900);

    ._md & {
        font-size: 1.6rem;
        font-weight: 600;
    }

    ._lg & {
        font-size: 2rem;
        font-weight: 600;
    }
}

.titleText {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.subtitle {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.8rem;
}
</style>
