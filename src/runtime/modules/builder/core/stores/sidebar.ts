import { defineStore } from 'pinia';
import type { TSidebarView } from '../../../common/types/brick';

interface ISidebarState {
    left: {
        visible: boolean;
        width: string;
    };
    right: {
        visible: boolean;
        width: string;
    };
    /** Монтируется ли правая панель свойств вообще (см. `setPropertiesPanelAvailable`). */
    isPropertiesPanelAvailable: boolean;
    activeView: TSidebarView;
}

/**
 * Контролирует состояние сайдбаров конструктора: левого (библиотека/схема/публикация)
 * и правой панели свойств выбранного компонента.
 */
export const useSidebarStore = defineStore('bricksSidebar', {
    state: (): ISidebarState => ({
        left: {
            visible: false,
            width: '32rem',
        },
        right: {
            visible: false,
            width: '35rem',
        },
        isPropertiesPanelAvailable: true,
        activeView: 'components',
    }),

    actions: {
        /**
         * Показывает левый сайдбар и активирует нужный раздел.
         *
         * @param view - Раздел для отображения.
         */
        showSidebarView(view: TSidebarView) {
            // Сначала меняем activeView, затем показываем sidebar
            // Это предотвращает двойную анимацию при открытии скрытого sidebar
            this.activeView = view;
            this.left.visible = true;
        },

        /**
         * Переключает видимость сайдбара для выбранного раздела.
         *
         * @param view - Раздел, который нужно отобразить.
         */
        toggleSidebarView(view: TSidebarView) {
            const isSameViewVisible = this.left.visible && this.activeView === view;

            if (isSameViewVisible) {
                this.hideSidebar();
                return;
            }

            this.showSidebarView(view);
        },

        /**
         * Скрывает левый сайдбар.
         */
        hideSidebar() {
            this.left.visible = false;
        },

        /**
         * Устанавливает фиксированную ширину сайдбара.
         *
         * @param width - Значение ширины в rem/px.
         */
        setSidebarWidth(width: string) {
            this.left.width = width;
        },

        /**
         * Обновляет активный раздел без изменения видимости.
         *
         * @param view - Новый раздел.
         */
        setActiveView(view: TSidebarView) {
            this.activeView = view;
        },

        /**
         * Объявляет, монтируется ли правая панель свойств в этой сессии.
         *
         * Роли без права правки панель не рендерится вовсе, а её ширину вычитают
         * из канваса три места (ширина контейнера, смещение тулбара,
         * перецентровка). Без этого флага выбор блока — законное для наблюдателя
         * действие, это подсветка, а не правка — открывал бы `right.visible`, и
         * справа появлялось бы 35rem пустоты, под которую канвас сжимался и
         * пересчитывал масштаб. Флаг держит `right.visible` в значении «панель на
         * экране», поэтому все три расчёта верны по построению.
         *
         * @param isAvailable - Монтируется ли панель.
         */
        setPropertiesPanelAvailable(isAvailable: boolean) {
            this.isPropertiesPanelAvailable = isAvailable;

            // Панель могла быть открыта до того, как право правки отобрали
            // (роль досылается запросом в сборках без SSR)
            if (!isAvailable) {
                this.right.visible = false;
            }
        },

        /**
         * Показывает правую панель свойств выбранного компонента.
         */
        showPropertiesPanel() {
            if (!this.isPropertiesPanelAvailable) {
                return;
            }

            this.right.visible = true;
        },

        /**
         * Скрывает правую панель свойств.
         */
        hidePropertiesPanel() {
            this.right.visible = false;
        },
    },
});
