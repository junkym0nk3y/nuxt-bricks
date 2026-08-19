<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDashboardProps,
    IPublishDashboardEmits,
    TPublishDashboardSection,
} from '../types/dashboard';

// Utils
import { markLeavingInert } from '../../../common/utils/transitionInert';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BuilderAuthProfileMenu from '../../auth/components/BuilderAuthProfileMenu.vue';
import BuilderLogo from '../../core/components/BuilderLogo.vue';
import BuilderPublishDashboardNav from './BuilderPublishDashboardNav.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksSearchInput from '../../../ui/inputs/BricksSearchInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDashboardProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDashboardEmits>();
// #endregion

// #region Data
const { t, locale } = useI18n();
const { canEdit, canManageUsers } = useBuilderPermissions();
// #endregion

// #region Computed
const sectionTitle = computed<string>(() =>
    t(`bricks.publish.dashboard.nav.${props.activeSection}`)
);

const searchPlaceholder = computed<string>(() =>
    t(`bricks.publish.dashboard.search.${props.activeSection}`)
);

/**
 * Первичная кнопка шапки принадлежит разделу, а не панели: в страницах она
 * создаёт страницу, в учётках — учётку, в шаблонах её нет вовсе (сохранить
 * шаблон можно только из готовой страницы). Одна кнопка на все разделы
 * предлагала бы создать страницу из списка людей.
 */
const isCreatePageVisible = computed<boolean>(
    () => props.activeSection === 'pages' && canEdit.value
);

const isCreateUserVisible = computed<boolean>(
    () => props.activeSection === 'users' && canManageUsers.value
);
// #endregion

// #region Methods
/**
 * Пробрасывает ввод строки поиска наверх.
 *
 * @param value - Введённый запрос.
 */
function onSearchInput(value: string): void {
    emit('update:searchQuery', value);
}

/**
 * Пробрасывает выбор раздела рейла.
 *
 * @param section - Ключ раздела.
 */
function handleSelectSection(section: TPublishDashboardSection): void {
    emit('select-section', section);
}

/**
 * Открывает создание страницы.
 */
function handleCreatePage(): void {
    emit('create-page');
}

/**
 * Открывает создание учётки.
 */
function handleCreateUser(): void {
    emit('create-user');
}

/**
 * Открывает медиа-галерею.
 */
function handleOpenMedia(): void {
    emit('open-media');
}

/**
 * Открывает документацию.
 */
function handleOpenDocs(): void {
    emit('open-docs');
}

/**
 * Переключает тёмную/светлую тему интерфейса.
 */
function handleToggleDarkMode(): void {
    emit('toggle-dark-mode');
}

/**
 * Переключает локаль интерфейса.
 */
function handleToggleLocale(): void {
    emit('toggle-locale');
}

/**
 * Пробрасывает выход из database-auth сессии наверх.
 */
function handleLogout(): void {
    emit('logout');
}

/**
 * Пробрасывает запрос модалки профиля наверх: монтирует её хост.
 */
function handleOpenProfile(): void {
    emit('open-profile');
}

/**
 * Гасит интерактивность уходящего экрана: при `mode="out-in"` он живёт в DOM всю
 * фазу leave, а переход бывает и не по клику человека, то есть фокус внутри
 * возможен. `pointer-events` из transitions.scss закрывает только указатель.
 *
 * @param element - Корневой элемент уходящего экрана.
 */
function onViewLeave(element: Element): void {
    markLeavingInert(element);
}
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderPublishDashboard">
        <header :class="$style.header">
            <div :class="$style.headerLeft">
                <BuilderLogo :class="$style.logo" text="" :to="null" />
                <h1 :class="$style.title">{{ sectionTitle }}</h1>
            </div>

            <div :class="$style.headerRight">
                <BricksSearchInput
                    :class="$style.search"
                    :value="props.searchQuery"
                    :placeholder="searchPlaceholder"
                    @update:value="onSearchInput"
                />

                <!-- Создание страницы — запись: наблюдателю ручка откажет -->
                <BricksButton
                    v-if="isCreatePageVisible"
                    size="md"
                    variant="primary"
                    @click="handleCreatePage"
                >
                    + {{ t('bricks.publish.dashboard.createPage') }}
                </BricksButton>

                <BricksButton
                    v-else-if="isCreateUserVisible"
                    size="md"
                    variant="primary"
                    @click="handleCreateUser"
                >
                    + {{ t('bricks.users.createUser') }}
                </BricksButton>

                <!--
                    Аватар — последний в правой группе, как в тулбаре билдера: он
                    не действие панели, а «кем вошёл». Вне database-режима не
                    рисуется сам
                -->
                <BuilderAuthProfileMenu @open-profile="handleOpenProfile" @logout="handleLogout" />
            </div>
        </header>

        <!--
            Полоса-предупреждение (дефолтный пароль) — между шапкой и телом:
            выше рейла и списка, но ниже логотипа, чтобы не подменять собой
            заголовок раздела. Слот пустует всё остальное время и места не
            занимает.
        -->
        <slot name="notice" />

        <div :class="$style.body">
            <BuilderPublishDashboardNav
                :active-section="props.activeSection"
                :pages-count="props.pagesCount"
                :users-count="props.usersCount"
                :is-users-section-visible="props.isUsersSectionVisible"
                :locale="locale"
                :is-dark-mode="props.isDarkMode"
                @select-section="handleSelectSection"
                @open-media="handleOpenMedia"
                @open-docs="handleOpenDocs"
                @toggle-dark-mode="handleToggleDarkMode"
                @toggle-locale="handleToggleLocale"
            />

            <main :class="$style.main">
                <!--
                    Смена раздела рейла — `mode="out-in"` с ключом на каждой
                    ветке: без ключей Vue переиспользует один и тот же div
                    (ветки v-if/v-else-if/v-else одного тега) и перехода нет
                    вовсе, а без `out-in` уходящий раздел наложился бы на
                    приходящий — списки страниц и учёток разной высоты.
                -->
                <Transition name="bricks-view-switch" mode="out-in" @leave="onViewLeave">
                    <!--
                        Обёртка обязана быть одним элементом: у `<Transition>`
                        ровно один потомок, а раздел страниц состоит из списка и
                        панели деталей
                    -->
                    <div
                        v-if="props.activeSection === 'pages'"
                        key="pages"
                        :class="$style.pagesArea"
                    >
                        <div :class="$style.listArea">
                            <slot name="list" />
                        </div>
                        <Transition name="bricks-details-slide">
                            <aside v-if="$slots.details" :class="$style.detailsArea">
                                <slot name="details" />
                            </aside>
                        </Transition>
                    </div>

                    <!--
                        Раздел учёток панели деталей не имеет: у учётки нет
                        содержимого, которое стоило бы разворачивать сбоку
                    -->
                    <div
                        v-else-if="props.activeSection === 'users'"
                        key="users"
                        :class="$style.listArea"
                    >
                        <slot name="users" />
                    </div>

                    <div v-else key="templates" :class="$style.templatesEmpty">
                        <div :class="$style.emptyIconCircle">
                            <BricksIcon icon="ta:outline-package" :class="$style.emptyIcon" />
                        </div>
                        <h2 :class="$style.emptyTitle">
                            {{ t('bricks.publish.dashboard.templates.emptyTitle') }}
                        </h2>
                        <p :class="$style.emptyDescription">
                            {{ t('bricks.publish.dashboard.templates.emptyDescription') }}
                        </p>
                        <BricksButton size="md" variant="secondary" disabled>
                            {{ t('bricks.publish.dashboard.templates.saveCurrent') }}
                        </BricksButton>
                    </div>
                </Transition>
            </main>
        </div>
    </div>
</template>

<style module lang="scss">
.TheBuilderPublishDashboard {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: var(--bricks-base-50);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    height: 6rem;
    padding: 0 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.headerLeft {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.logo {
    flex-shrink: 0;
    width: 3.2rem;
}

.title {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.headerRight {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.search {
    width: 28rem;
}

.body {
    overflow: hidden;
    display: flex;
    flex: 1;
}

.main {
    overflow: hidden;
    display: flex;
    flex: 1;
}

/* Раздел страниц целиком: список плюс панель деталей. Повторяет раскладку
   `.main`, потому что встал между ним и своим содержимым — обёртку потребовал
   переход между разделами. */
.pagesArea {
    overflow: hidden;
    display: flex;
    flex: 1;
}

.listArea {
    overflow-y: auto;
    flex: 1;
    padding: 2rem 2.4rem;
}

.detailsArea {
    overflow: hidden;
    display: flex;
    flex-shrink: 0;
    width: 34rem;
    border-left: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    flex-direction: column;
}

.templatesEmpty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    flex-direction: column;
    gap: 0.8rem;
    padding: 2.4rem;
}

.emptyIconCircle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 6.4rem;
    height: 6.4rem;
    margin-bottom: 1.2rem;
    border-radius: 50%;
    background: var(--bricks-base-100);
}

.emptyIcon {
    width: 2.8rem;
    height: 2.8rem;
    color: var(--bricks-base-400);
}

.emptyTitle {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.emptyDescription {
    max-width: 32rem;
    margin: 0 0 1.6rem;
    text-align: center;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}
</style>
