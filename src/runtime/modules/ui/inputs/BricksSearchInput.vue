<script setup lang="ts">
/**
 * @description Поле поиска: один вид для всех списков билдера — библиотека
 * компонентов, список страниц дашборда, медиатека.
 *
 * До него каждое место собирало поиск заново: в сайдбаре компонентов это был
 * `BricksInput` с глифом в `#prefix`, в дашборде — нативный `<input>` с
 * абсолютно позиционированной лупой и тремя десятками собственных строк стилей,
 * в медиатеке — третья копия того же. Расходились они молча: разная высота,
 * разный фокус, крестик очистки был только в одном из трёх.
 *
 * Своей разметки поля здесь нет — это `BricksInput` с глифом и `clearable`.
 * Отдельным компонентом, а не «правилом всегда писать так»: правило соблюдается
 * ровно до следующего списка.
 *
 * Ширину задаёт вызывающий классом — она везде разная (280 в медиатеке, во всю
 * колонку в сайдбаре), и зашивать её сюда значило бы переопределять её в каждом
 * втором месте.
 *
 * Исключение, которое сюда НЕ переводится: поиск в селекторе страниц тулбара.
 * Там полем обязан быть reka `ListboxFilter` — стрелки и Enter из него ведут по
 * строкам списка, и подмена на обычный input сломала бы клавиатурную навигацию.
 */

// #region Imports
// Types
import type { IBricksSearchInputProps, IBricksSearchInputEmits } from './types.d.ts';

// Components
import BricksInput from './BricksInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSearchInputProps>(), {
    placeholder: '',
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksSearchInputEmits>();
// #endregion

// #region Methods
/**
 * Пробрасывает ввод наверх. Значение контролируемое: поле показывает то, что
 * пришло пропом, поэтому вызывающий вправе фильтровать или нормализовать запрос.
 */
function handleInput(value: string): void {
    emit('update:value', value);
}
// #endregion
</script>

<template>
    <BricksInput
        :value="props.value"
        type="text"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        clearable
        @update:value="handleInput"
    >
        <template #prefix>
            <BricksIcon icon="ta:outline-search" />
        </template>
    </BricksInput>
</template>
