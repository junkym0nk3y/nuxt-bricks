<script setup lang="ts">
/**
 * @description Аватар учётки: фото из хранилища либо буква на подложке.
 *
 * Запасной вариант — не заглушка «нет фото», а полноценное состояние: фото
 * необязательно, и буква первого символа подписи отличает учётки друг от друга
 * в углу экрана и в списке. Одна формула на все размеры (кегль ≈ 40% диаметра,
 * округлённый до шага 0.2rem) — иначе буква у мелкого аватара оказывается
 * непропорционально крупной, и угол экрана «прыгает» при смене человека.
 *
 * Отказ загрузки фото (`@error`) возвращает букву: ссылка живёт в колонке
 * учётки, а файл лежит в хранилище отдельно — объект могли снести уборкой
 * бакета, и без этого в углу остался бы пустой квадрат вместо опознаваемой
 * буквы.
 *
 * Компонент декоративен (`aria-hidden`): имя владельца всегда есть рядом —
 * текстом в шапке меню и в модалке профиля, `aria-label`'ом у кнопки-триггера.
 * Второе прочтение того же имени скринридером ничего не добавляет.
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
/** Фото не загрузилось — показываем букву. */
const hasImageError = ref(false);
// #endregion

// #region Computed
/**
 * Первый символ подписи. `Array.from`, а не `[0]`: имя пишет человек, и первым
 * символом бывает эмодзи или буква вне BMP — индексация по code unit разрезала
 * бы её на половину суррогатной пары.
 */
const initial = computed<string>(() => {
    const [first] = Array.from(props.name.trim());

    return first ? first.toLocaleUpperCase() : '';
});

const shouldShowImage = computed<boolean>(() => Boolean(props.imageUrl) && !hasImageError.value);
// #endregion

// #region Methods
/**
 * Отмечает фото недоступным.
 */
function handleImageError(): void {
    hasImageError.value = true;
}
// #endregion

// #region Lifecycle
// Смена ссылки снимает прежний отказ: компонент переиспользуется (угол экрана
// живёт всю сессию), и после загрузки нового фото он иначе продолжал бы
// показывать букву
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

/* Угол шапки: дашборд после «+ Пользователь», билдер после «Сохранить». */
._sm {
    width: 3.6rem;
    height: 3.6rem;

    .initial {
        font-size: 1.4rem;
    }
}

/* Строка списка учёток и шапка меню профиля. */
._md {
    width: 4rem;
    height: 4rem;

    .initial {
        font-size: 1.6rem;
    }
}

/* Модалка профиля. */
._lg {
    width: 9.6rem;
    height: 9.6rem;

    .initial {
        font-size: 3.8rem;
    }
}
</style>
