// #region Imports
// Types
import type {
    IUsePublishDashboardSectionsOptions,
    IUsePublishDashboardSectionsReturn,
    TPublishDashboardSection,
} from '../types/dashboard';

// Vue
import { computed, ref, watch } from 'vue';
// #endregion

/**
 * Открытый раздел дашборда и строка поиска этого раздела.
 *
 * Запрос у каждого раздела свой: списки разные, и общая строка искала бы в одном
 * по запросу, набранному для другого — раздел выглядел бы сломанным. Поле в
 * шапке при этом одно, поэтому маршрутизация ввода собрана здесь, а не
 * россыпью условий в хосте.
 *
 * @param options - Строка поиска страниц, доступность раздела учёток и уход с
 *   медиатеки.
 * @returns Активный раздел, запросы разделов и переключатели.
 */
export function usePublishDashboardSections(
    options: IUsePublishDashboardSectionsOptions
): IUsePublishDashboardSectionsReturn {
    // #region Data
    const activeSection = ref<TPublishDashboardSection>('pages');
    const usersSearchQuery = ref('');
    const templatesSearchQuery = ref('');
    const mediaSearchQuery = ref('');
    // #endregion

    // #region Computed
    /** Запрос из поля шапки — того раздела, который открыт. */
    const activeSearchQuery = computed<string>(() => {
        if (activeSection.value === 'users') {
            return usersSearchQuery.value;
        }

        if (activeSection.value === 'templates') {
            return templatesSearchQuery.value;
        }

        return activeSection.value === 'media'
            ? mediaSearchQuery.value
            : options.pagesSearchQuery.value;
    });
    // #endregion

    // #region Methods
    /**
     * Переключает активный раздел рейла.
     *
     * Раздел, которого нет в этой установке, не открывается даже по прямому
     * вызову: пункт рейла при выключенном разделе не рисуется, но состояние
     * `unavailable` может прийти уже после того, как человек в разделе оказался.
     *
     * @param section - Ключ раздела.
     */
    function selectSection(section: TPublishDashboardSection): void {
        if (section === 'users' && !options.isUsersSectionVisible.value) {
            return;
        }

        activeSection.value = section;
    }

    /**
     * Пишет запрос поиска в тот раздел, который открыт.
     *
     * @param value - Введённый запрос.
     */
    function setSearchQuery(value: string): void {
        if (activeSection.value === 'users') {
            usersSearchQuery.value = value;
            return;
        }

        if (activeSection.value === 'templates') {
            templatesSearchQuery.value = value;
            return;
        }

        if (activeSection.value === 'media') {
            mediaSearchQuery.value = value;
            return;
        }

        options.pagesSearchQuery.value = value;
    }
    // #endregion

    // #region Lifecycle
    // Раздел учёток мог исчезнуть под руками: 403 или 404 на его ручках
    // означают, что в этой установке его нет, — оставшийся открытым, он
    // показывал бы пустой экран без объяснения
    watch(options.isUsersSectionVisible, (isVisible) => {
        if (!isVisible && activeSection.value === 'users') {
            activeSection.value = 'pages';
        }
    });

    // Уход с медиатеки закрывает сессию работы с ней: выбранный файл, категория
    // и параметры загрузки обязаны вернуться к исходным — иначе следующее
    // открытие раздела грузило бы файлы в чужую категорию и с чужими
    // настройками оптимизации. Запрос сбрасывается здесь же
    watch(activeSection, (section, previousSection) => {
        if (previousSection === 'media' && section !== 'media') {
            mediaSearchQuery.value = '';
            options.onLeaveMedia();
            return;
        }

        // Вход в раздел досылает список файлов: первое чтение идёт на старте
        // дашборда и могло не дойти, а раздел без данных показывает «медиатека
        // пуста» — то есть врёт про состав. Повторное чтение отсекает снимок
        if (section === 'media') {
            options.onEnterMedia();
        }
    });
    // #endregion

    return {
        activeSection,
        usersSearchQuery,
        templatesSearchQuery,
        mediaSearchQuery,
        activeSearchQuery,
        selectSection,
        setSearchQuery,
    };
}
