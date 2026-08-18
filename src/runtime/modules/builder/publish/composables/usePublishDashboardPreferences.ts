// #region Imports
// Types
import type { IUsePublishDashboardPreferencesReturn } from '../types/composables';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useCookie } from '#imports';
// #endregion

// #region Data
/** Cookie темы интерфейса — общая с редактором билдера. */
const DARK_MODE_COOKIE = 'bricks-dark-mode';

/** Год жизни cookie: выбор темы человек делает один раз. */
const DARK_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
// #endregion

/**
 * Настройки оболочки дашборда: тема интерфейса и язык.
 *
 * Тема живёт в cookie, а не в состоянии приложения, по одной причине: класс
 * `bricks-dark` обязан оказаться на `body` в ПЕРВОМ кадре — cookie читается на
 * сервере, и тёмный дашборд не мигает светлым во время гидрации. Cookie общая с
 * редактором: переход между поверхностями не должен переключать тему.
 *
 * @returns Признак тёмной темы, класс `body` и переключатели.
 */
export function usePublishDashboardPreferences(): IUsePublishDashboardPreferencesReturn {
    // #region Data
    const { locale, setLocale } = useI18n();

    const darkModeCookie = useCookie<boolean>(DARK_MODE_COOKIE, {
        default: () => false,
        maxAge: DARK_MODE_COOKIE_MAX_AGE,
    });
    // #endregion

    // #region Computed
    const isDarkMode = computed<boolean>(() => darkModeCookie.value ?? false);

    /**
     * Класс `body` — реактивный: `useHead` пересобирает атрибут при переключении,
     * и тема применяется без перезагрузки.
     */
    const bodyClass = computed<string>(() =>
        darkModeCookie.value ? 'bricks-page bricks-dark' : 'bricks-page'
    );
    // #endregion

    // #region Methods
    /**
     * Переключает тёмную и светлую тему интерфейса.
     */
    function toggleDarkMode(): void {
        darkModeCookie.value = !darkModeCookie.value;
    }

    /**
     * Переключает локаль интерфейса (ru ⇄ en); cookie `bricks-locale` пишет сам
     * i18n.
     */
    async function toggleLocale(): Promise<void> {
        await setLocale(locale.value === 'ru' ? 'en' : 'ru');
    }
    // #endregion

    return { isDarkMode, bodyClass, toggleDarkMode, toggleLocale };
}
