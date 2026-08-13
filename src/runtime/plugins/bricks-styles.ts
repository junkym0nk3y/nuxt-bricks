// #region Imports
// Nuxt
import { defineNuxtPlugin } from '#imports';

// Composables
import { useBricksDevices } from '../modules/common/composables/useBricksDevices';
import { useBricksStyles } from '../modules/common/composables/useBricksStyles';
import { useResponsiveVisibilityStyles } from '../modules/layouts-blocks/composables/useResponsiveVisibilityStyles';
import { useResponsiveLayoutStyles } from '../modules/layouts-blocks/composables/useResponsiveLayoutStyles';
// #endregion

/**
 * Plugin for auto-initialization of bricks styles
 * Injects dynamic CSS (SSR-safe)
 *
 * Пишет CSS набора ПРОЕКТА — он же SSR-дефолт и покрытие любой страницы
 * потребителя, где отрисован bricks-контент. Страница со своим набором
 * (`bricks_pages.viewport_config`) регистрирует те же ключи тегов позже и
 * вытесняет эти записи; при уходе с неё проектный CSS возвращается.
 */
export default defineNuxtPlugin(() => {
    const { projectDevices } = useBricksDevices();
    const getDevices = () => projectDevices;

    useBricksStyles(getDevices);
    useResponsiveVisibilityStyles(getDevices);
    useResponsiveLayoutStyles(getDevices);
});
