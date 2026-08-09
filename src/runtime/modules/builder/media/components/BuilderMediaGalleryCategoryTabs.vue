<script setup lang="ts">
/**
 * @description Ряд табов-категорий медиатеки в underline-исполнении. Составной
 * таб: подпись со счётчиком — `ToggleGroupItem`, кнопка удаления — его сосед
 * внутри общей обёртки, которая и несёт подчёркивание выбранного.
 *
 * Почему не `BricksTabBar`: он рендерит `items[]` сам, а внутрь
 * `ToggleGroupItem` кнопку удаления положить нельзя — это кнопка внутри кнопки,
 * недопустимая вложенность интерактивных элементов. Разнести их в одном
 * `ToggleGroupItem` тоже нельзя: любой item группы выбирается и эмитит
 * `update:modelValue`, то есть клик по крестику менял бы фильтр. Поэтому ряд
 * собран здесь напрямую на reka `ToggleGroup` — клавиатура, roving tabindex и
 * семантика группы остаются её, а нашей частью остаются обёртка и стили.
 * Значения стилей повторяют `BricksTabBarItem._underline`: ряд обязан читаться
 * так же, как таб-бары кита в остальном билдере.
 *
 * Крестики показываются только в режиме управления (`isManaging`) и только у
 * пользовательских категорий. Постоянные крестики превратили бы ряд фильтров в
 * ряд кнопок удаления, а показ «только у выбранной» прятал удаление за
 * догадкой: чтобы понять, что категорию вообще можно удалить, её сначала надо
 * было выбрать.
 */

// #region Imports
// Types
import type {
    IMediaGalleryCategoryTabsProps,
    IMediaGalleryCategoryTabsEmits,
} from '../types/media';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';

// Vue
import { useI18n } from 'vue-i18n';

// Reka UI
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryCategoryTabsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryCategoryTabsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const allFilterValue = ALL_MEDIA_CATEGORIES_FILTER;
// #endregion

// #region Methods
/**
 * Отдаёт выбор наверх, отсекая два случая, в которых группа сообщает о событии,
 * но выбор не меняется: `undefined` (повторный клик по выбранному — `ToggleGroup`
 * считает это снятием, а фильтр не может быть пустым) и то же значение.
 *
 * @param value - Значение нажатого таба; при снятии выбора приходит пустое.
 */
function handleValueChange(value: unknown): void {
    if (typeof value !== 'string' || value === props.modelValue) {
        return;
    }

    emit('update:modelValue', value);
}

/**
 * Эмитит запрос на удаление категории.
 *
 * @param slug - Удаляемая категория.
 */
function handleDelete(slug: string): void {
    emit('delete-category', slug);
}
// #endregion
</script>

<template>
    <ToggleGroupRoot
        type="single"
        :class="$style.BuilderMediaGalleryCategoryTabs"
        :model-value="props.modelValue"
        :aria-label="t('bricks.media.categoryFilterLabel')"
        @update:model-value="handleValueChange"
    >
        <div :class="$style.tab">
            <ToggleGroupItem :class="$style.label" :value="allFilterValue">
                <span>{{ t('bricks.media.categories.all') }}</span>
                <span :class="$style.count">· {{ props.totalCount }}</span>
            </ToggleGroupItem>
        </div>

        <div
            v-for="category in props.categories"
            :key="category.slug"
            :class="[$style.tab, { [$style._deletable]: props.isManaging }]"
        >
            <ToggleGroupItem :class="$style.label" :value="category.slug">
                <span>{{ category.label }}</span>
                <!--
                    Счётчик только у непустых: «· 0» у каждой заведённой, но пока
                    не наполненной категории — шум в дорожке, а не информация.
                -->
                <span v-if="props.categoryCounts[category.slug]" :class="$style.count">
                    · {{ props.categoryCounts[category.slug] }}
                </span>
            </ToggleGroupItem>

            <Transition name="bricks-fade-fast">
                <BricksButton
                    v-if="props.isManaging"
                    :class="$style.remove"
                    size="sm"
                    variant="ghost"
                    equal
                    :aria-label="t('bricks.media.categoryDelete', { name: category.label })"
                    @click="handleDelete(category.slug)"
                >
                    <BricksIcon icon="ta:outline-x" />
                </BricksButton>
            </Transition>
        </div>
    </ToggleGroupRoot>
</template>

<style module lang="scss">
.BuilderMediaGalleryCategoryTabs {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 0.8rem;
}

/* Обёртка несёт подчёркивание, а подпись и крестик внутри остаются
   самостоятельными интерактивными элементами. Полоса рисуется на ней, а не на
   самом `ToggleGroupItem`, иначе у таба с крестиком она обрывалась бы на
   середине — под подписью, но не под крестиком. */
.tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 3.2rem;

    &:after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 0.2rem;
        background: var(--bricks-primary);
        transform: scaleX(0);
        transform-origin: left center;
        transition: transform var(--bricks-default-transition);
    }

    /* Выбранное состояние ставит reka на сам item, поэтому обёртка читает его
       через :has — иначе пришлось бы дублировать modelValue вторым классом. */
    &:has(.label[data-state='on']) {
        &:after {
            transform: scaleX(1);
        }

        .label {
            color: var(--bricks-primary);
        }

        .count {
            color: var(--bricks-primary);
        }
    }

    /* У таба с крестиком правый паддинг подписи снимается: иначе между подписью
       и крестиком набегает 1.2rem паддинга и таб разъезжается. */
    &._deletable .label {
        padding-right: 0.2rem;
    }
}

.label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 3.2rem;
    padding: 0 1.2rem;
    border: none;
    background: transparent;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.2;
    color: var(--bricks-base-500);
    transition: color var(--bricks-default-transition);
    cursor: pointer;

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:hover {
        color: var(--bricks-base-900);
    }
}

.count {
    color: var(--bricks-base-400);
    transition: color var(--bricks-default-transition);
}

/* Кнопка кита в уменьшенном исполнении: рядом с подписью 1.2rem штатные 3.2rem
   читались бы как отдельная кнопка, приставленная к табу, а не как его часть.
   Квадратность при этом сохраняется — сторона и кегль уменьшены согласованно. */
.remove {
    width: 2rem;
    height: 2rem;
    margin-right: 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    font-size: 1.4rem;
    color: var(--bricks-base-400);

    &:hover {
        background: var(--bricks-danger-50);
        color: var(--bricks-danger-500);
    }
}
</style>
