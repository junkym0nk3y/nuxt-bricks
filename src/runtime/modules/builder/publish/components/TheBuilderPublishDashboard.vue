<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDashboardProps,
    IPublishDashboardEmits,
    TPublishDashboardSection,
} from '../types/dashboard';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
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
// #endregion

// #region Computed
const sectionTitle = computed<string>(() =>
    t(`bricks.publish.dashboard.nav.${props.activeSection}`)
);

const searchPlaceholder = computed<string>(() =>
    t(`bricks.publish.dashboard.search.${props.activeSection}`)
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

                <BricksButton size="md" variant="primary" @click="handleCreatePage">
                    + {{ t('bricks.publish.dashboard.createPage') }}
                </BricksButton>
            </div>
        </header>

        <div :class="$style.body">
            <BuilderPublishDashboardNav
                :active-section="props.activeSection"
                :pages-count="props.pagesCount"
                :locale="locale"
                :is-dark-mode="props.isDarkMode"
                :is-logout-visible="props.isLogoutVisible"
                @select-section="handleSelectSection"
                @open-media="handleOpenMedia"
                @open-docs="handleOpenDocs"
                @toggle-dark-mode="handleToggleDarkMode"
                @toggle-locale="handleToggleLocale"
                @logout="handleLogout"
            />

            <main :class="$style.main">
                <template v-if="props.activeSection === 'pages'">
                    <div :class="$style.listArea">
                        <slot name="list" />
                    </div>
                    <Transition name="bricks-details-slide">
                        <aside v-if="$slots.details" :class="$style.detailsArea">
                            <slot name="details" />
                        </aside>
                    </Transition>
                </template>

                <div v-else :class="$style.templatesEmpty">
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
