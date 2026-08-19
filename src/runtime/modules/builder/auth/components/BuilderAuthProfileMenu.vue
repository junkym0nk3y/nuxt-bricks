<script setup lang="ts">
/**
 * @description Аватар в правом верхнем углу и меню профиля под ним. Один
 * компонент на две поверхности — шапку дашборда и тулбар билдера: меню отвечает
 * на два вопроса («кем вошёл», «как отсюда выйти»), и две копии разъехались бы
 * на первой же правке.
 *
 * До этого экрана выход жил только в футере рейла дашборда, то есть из редактора
 * выйти было нельзя вовсе — аватар в тулбаре закрывает эту дыру попутно.
 *
 * Вне database-режима компонент не рисуется: в basic identity одна на всех и
 * задана окружением, профиля у неё нет, а выхода нет и у самого протокола —
 * браузер держит заголовок до закрытия вкладки. Поэтому проп «показывать выход»
 * компоненту не нужен, он решает это сам.
 *
 * Профиль читается из общего состояния, а не приходит пропом: значение одно на
 * сессию, а поверхностей две, и проп пришлось бы тащить через шапку дашборда,
 * которой он не нужен. Правит профиль модалка — её открывает хост, поэтому
 * наружу уходят только события.
 */

// #region Imports
// Types
import type { IAuthProfileMenuEmits, IAuthProfileMenuProps } from '../types/auth';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui';

// Composables
import { useAuthProfile } from '../composables/useAuthProfile';
import { useAuthSession } from '../composables/useAuthSession';

// Components
import BricksAvatar from '../../../ui/base/avatar/BricksAvatar.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthProfileMenuProps>(), {
    separated: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IAuthProfileMenuEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { isDatabaseMode } = useAuthSession();
const { profile, displayLabel } = useAuthProfile();
// #endregion

// #region Computed
/** Подпись под именем: «логин · роль» — обе строки про учётку, не про профиль. */
const accountSummary = computed<string>(() => {
    const current = profile.value;

    if (!current) {
        return '';
    }

    return `${current.username} · ${t(`bricks.auth.roles.${current.role}`)}`;
});

/**
 * Доступное имя кнопки. Без него у триггера нет подписи вовсе: внутри только
 * аватар, а он декоративен.
 */
const triggerLabel = computed<string>(() =>
    t('bricks.auth.profile.menuLabel', { name: displayLabel.value })
);
// #endregion

// #region Methods
/**
 * Просит хост открыть модалку профиля.
 */
function handleOpenProfile(): void {
    emit('open-profile');
}

/**
 * Просит хост выполнить выход: он же показывает отказ и уводит на login.
 */
function handleLogout(): void {
    emit('logout');
}
// #endregion
</script>

<template>
    <DropdownMenuRoot v-if="isDatabaseMode && profile">
        <div :class="$style.BuilderAuthProfileMenu">
            <span v-if="props.separated" :class="$style.divider" aria-hidden="true" />

            <DropdownMenuTrigger as-child>
                <button type="button" :class="$style.trigger" :aria-label="triggerLabel">
                    <BricksAvatar size="sm" :name="displayLabel" :image-url="profile.avatarUrl" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuPortal>
                <DropdownMenuContent
                    :class="$style.menu"
                    align="end"
                    :side-offset="8"
                    position="popper"
                >
                    <div :class="$style.header">
                        <BricksAvatar
                            size="md"
                            :name="displayLabel"
                            :image-url="profile.avatarUrl"
                        />

                        <div :class="$style.identity">
                            <span :class="$style.name">{{ displayLabel }}</span>
                            <span :class="$style.summary">{{ accountSummary }}</span>
                        </div>
                    </div>

                    <div :class="$style.items">
                        <DropdownMenuItem :class="$style.item" @select="handleOpenProfile">
                            <BricksIcon icon="ta:outline-user" :class="$style.itemIcon" />
                            <span>{{ t('bricks.auth.profile.open') }}</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem :class="$style.item" @select="handleLogout">
                            <BricksIcon icon="ta:outline-logout" :class="$style.itemIcon" />
                            <span>{{ t('bricks.auth.logout') }}</span>
                        </DropdownMenuItem>
                    </div>
                </DropdownMenuContent>
            </DropdownMenuPortal>
        </div>
    </DropdownMenuRoot>
</template>

<style module lang="scss">
.BuilderAuthProfileMenu {
    display: inline-flex;
    align-items: center;
    gap: 1.2rem;
}

/* Отделяет аватар от кнопок панели билдера; в шапке дашборда не нужна —
   там он идёт за кнопкой «+ Страница», которая уже сама по себе край группы. */
.divider {
    width: 1px;
    height: 2.4rem;
    background: var(--bricks-base-200);
}

.trigger {
    display: inline-flex;
    padding: 0;
    border-radius: var(--bricks-border-radius-pill);
    border: none;
    background: transparent;
    transition: box-shadow var(--bricks-default-transition);
    cursor: pointer;

    &:hover,
    &[data-state='open'] {
        box-shadow: 0 0 0 0.2rem var(--bricks-base-200);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.menu {
    z-index: var(--bricks-z-popover);
    width: 26.8rem;
    padding: 0.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-md);

    // Появление и уход — как у остальных поповеров билдера (селектор страниц,
    // BricksActionButton). Vue-`<Transition>` здесь неприменима: контентом
    // распоряжается Presence самой reka, поэтому анимация вешается на её
    // `data-state`.
    &[data-state='open'] {
        animation: profile-menu-in 0.2s ease;
    }

    // Затухание короче появления: reka не размонтирует контент, пока играет
    // анимация closed-состояния, и всё это время меню ещё висит над шапкой.
    // `pointer-events: none` — чтобы клик по тому, что было под меню, не съедался
    // уходящим окном
    &[data-state='closed'] {
        animation: profile-menu-out 0.15s ease;
        pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
        &[data-state='open'],
        &[data-state='closed'] {
            animation: none;
        }
    }
}

// Keyframes — внутри module-блока: CSS Modules скоупит имя анимации в ссылке
// `animation:` выше, и глобальное определение с ним не совпало бы (анимация не
// проигралась бы, а reka зависла бы на closed)
@keyframes profile-menu-in {
    from {
        opacity: 0;
        transform: translateY(-0.4rem);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes profile-menu-out {
    from {
        opacity: 1;
        transform: translateY(0);
    }

    to {
        opacity: 0;
        transform: translateY(-0.4rem);
    }
}

.header {
    display: flex;
    align-items: center;
    padding: 0.6rem 0.8rem 1rem;
    border-bottom: 1px solid var(--bricks-base-200);
    gap: 1rem;
}

.identity {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

/* Длинное имя обрезается многоточием: логин под ним не обрезается никогда —
   по нему человек себя опознаёт. */
.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.items {
    display: flex;
    flex-direction: column;
    padding-top: 0.6rem;
    gap: 0.2rem;
}

.item {
    display: flex;
    align-items: center;
    height: 3.6rem;
    padding: 0 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    font-size: 1.4rem;
    color: var(--bricks-base-700);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    gap: 1rem;

    &:hover,
    &[data-highlighted] {
        background: var(--bricks-base-50);
        outline: none;
        color: var(--bricks-base-900);
    }
}

.itemIcon {
    flex-shrink: 0;
    width: 1.8rem;
    height: 1.8rem;
    color: var(--bricks-base-500);
}
</style>
