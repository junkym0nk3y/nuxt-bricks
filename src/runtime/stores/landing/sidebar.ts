import { defineStore } from 'pinia';
import type { SidebarView } from '../../types/landing';

interface ILandingSidebarState {
    left: {
        visible: boolean;
        width: string;
    };
    activeView: SidebarView;
}

/**
 * Контролирует состояние левого сайдбара конструктора: его видимость, ширину и активный раздел.
 */
export const useLandingSidebarStore = defineStore('landingSidebar', {
    state: (): ILandingSidebarState => ({
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
        showSidebarView(view: SidebarView) {
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
        toggleSidebarView(view: SidebarView) {
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
        setActiveView(view: SidebarView) {
            this.activeView = view;
        },
    },
});
