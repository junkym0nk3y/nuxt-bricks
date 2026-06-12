import { defineStore } from 'pinia';
import type { TSidebarView } from '../../../common/types/brick';

interface ISidebarState {
    left: {
        visible: boolean;
        width: string;
    };
    activeView: TSidebarView;
}

/**
 * Контролирует состояние левого сайдбара конструктора: его видимость, ширину и активный раздел.
 */
export const useSidebarStore = defineStore('bricksSidebar', {
    state: (): ISidebarState => ({
        left: {
            visible: false,
            width: '37.2rem',
        },
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
    },
});
