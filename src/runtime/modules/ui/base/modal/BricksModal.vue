<script setup lang="ts">
// #region Imports
// Types
import type { IBricksModalProps, IBricksModalEmits } from './types.d.ts';

// Utils
import { markLeavingInert } from '../../../common/utils/transitionInert';

// Constants
import { BRICKS_MODAL_TITLE_KEY } from '../../../common/constants/injectionKeys';

// Vue
import { useCssModule, computed, provide } from 'vue';

// Reka UI
import {
    DialogRoot,
    DialogPortal,
    DialogOverlay,
    DialogContent,
    DialogTitle,
    DialogDescription,
    VisuallyHidden,
} from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksModalProps>(), {
    variant: 'dark',
    padded: false,
    layer: 'modal',
    duration: 300,
    description: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksModalEmits>();
// #endregion

// #region Data
const $style = useCssModule();

/**
 * Заголовок отдаётся вниз, в `BricksModalHeader`: то же значение уходит в
 * скрытый `DialogTitle`, и видимая шапка обязана печатать именно его, а не свою
 * копию — расхождение имени диалога с надписью в нём не заметно ни в одной
 * проверке.
 */
provide(
    BRICKS_MODAL_TITLE_KEY,
    computed(() => props.title)
);
// #endregion

// #region Computed
/**
 * Классы корневой обёртки: центрирование + вариант фона + опциональный padding.
 */
const rootClasses = computed(() => [
    $style.BricksModal,
    {
        [$style._gradient]: props.variant === 'gradient',
        [$style._padded]: props.padded,
        [$style[`_${props.layer}`]]: props.layer !== 'modal',
    },
]);

/**
 * Длительность перехода уезжает в CSS-переменную: тем же значением ограничен
 * `<Transition>`, и без общего источника transform окна (transitions.scss) шёл бы
 * своей константой — у модалок с укороченным переходом Vue снимал бы классы
 * раньше, чем доигрывает масштаб, и окно доезжало бы скачком.
 */
const rootStyle = computed<Record<string, string>>(() => ({
    '--bricks-modal-duration': `${props.duration}ms`,
}));

/**
 * Без description явно сбрасываем aria-describedby (undefined снимает атрибут
 * и внутреннюю привязку Reka) — иначе Reka предупреждает про DialogContent
 * без DialogDescription. С description — не вмешиваемся, Reka свяжет id сама.
 */
const contentAria = computed<Record<string, undefined>>(() =>
    props.description ? {} : { 'aria-describedby': undefined }
);
// #endregion

// #region Methods
/**
 * Пробрасывает закрытие наружу (Esc, клик по overlay).
 * Состояние контролируемое — модалка закроется, только если родитель обновит isOpen.
 *
 * @param open - Новое состояние открытости от Reka.
 */
function onUpdateOpen(open: boolean): void {
    if (!open) {
        emit('close');
    }
}

/**
 * Гасит интерактивность модалки на время leave-анимации. `force-mount` держит
 * `DialogContent` в DOM до её конца, поэтому кнопки уезжающей модалки остаются
 * активируемыми — с клавиатуры и из assistive tech в том числе, а `pointer-events`
 * (transitions.scss) закрывает только указатель. Клик по уже отвеченной модалке
 * отвечал бы за следующую.
 *
 * @param element - Корневой элемент уезжающей модалки.
 */
function onLeave(element: Element): void {
    markLeavingInert(element);
}
// #endregion
</script>

<template>
    <DialogRoot :open="props.isOpen" @update:open="onUpdateOpen">
        <DialogPortal>
            <!--
                `appear` обязателен: модалки с ленивым монтированием (профиль,
                медиа-галерея) появляются в разметке хоста уже открытыми —
                латч монтирования и `isOpen` поднимаются одним действием, а
                чанк приезжает ещё позже. Без `appear` первое открытие такой
                модалки шло без анимации вовсе, а второе — с ней: у уже
                смонтированного компонента `isOpen` меняется штатно.
            -->
            <Transition
                appear
                name="bricks-modal-fade"
                :duration="props.duration"
                @leave="onLeave"
                @after-leave="emit('afterLeave')"
            >
                <!--
                    DialogContent не должен быть вложен в DialogOverlay: overlay Reka
                    делает preventDefault на левый pointerdown, и вложенный контент
                    теряет фокус/выделение мышью. Центрирует обычный div, overlay —
                    прозрачная клик-ловушка под контентом.
                -->
                <div v-if="props.isOpen" :class="rootClasses" :style="rootStyle">
                    <DialogOverlay force-mount :class="$style.overlay" />
                    <!--
                        `bricks-modal-window` — глобальный класс-конвенция, якорь
                        для масштаба окна из transitions.scss: сам `DialogContent`
                        стоит с `display: contents`, поэтому анимировать надо его
                        потомков, а хешированное имя из CSS Modules глобальному
                        файлу переходов недоступно.
                    -->
                    <DialogContent
                        force-mount
                        class="bricks-modal-window"
                        :class="$style.content"
                        v-bind="contentAria"
                        @escape-key-down="emit('escapeKeyDown', $event)"
                    >
                        <VisuallyHidden>
                            <DialogTitle>{{ props.title }}</DialogTitle>
                            <DialogDescription v-if="props.description">
                                {{ props.description }}
                            </DialogDescription>
                        </VisuallyHidden>

                        <slot />
                    </DialogContent>
                </div>
            </Transition>
        </DialogPortal>
    </DialogRoot>
</template>

<style module lang="scss">
.BricksModal {
    position: fixed;
    z-index: var(--bricks-z-modal);
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bricks-overlay-dark);

    /* Уровни модалок над модалками. Все ниже дропдаунов и тостов — иначе селект
       внутри модалки снова уехал бы под неё саму. */
    &._nested {
        z-index: var(--bricks-z-modal-nested);
    }

    &._raised {
        z-index: var(--bricks-z-modal-raised);
    }

    &._confirm {
        z-index: var(--bricks-z-modal-confirm);
    }

    &._gradient {
        background: linear-gradient(
            180deg,
            var(--bricks-overlay-modal-start),
            var(--bricks-overlay-modal-end)
        );
    }

    &._padded {
        padding: 2rem;
    }
}

.overlay {
    position: fixed;

    // Под контентом (в стеке корня), но над фоном корня — клик по фону закрывает модалку
    z-index: -1;
    inset: 0;
}

.content {
    display: contents;
}
</style>
