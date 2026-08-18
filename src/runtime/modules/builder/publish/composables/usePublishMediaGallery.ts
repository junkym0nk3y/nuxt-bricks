// #region Imports
// Types
import type {
    IUsePublishMediaGalleryReturn,
    TPublishMediaGalleryContext,
} from '../types/composables';

// Vue
import { ref } from 'vue';
// #endregion

/**
 * Открытие медиа-галереи с дашборда: латч монтирования, видимость и роль, в
 * которой её открыли.
 *
 * Роль (`manager` или `properties`) — не украшение: пикер обязан вернуть
 * выбранный файл в форму панели деталей, а менеджер — не возвращать ничего, и
 * без различия первое открытие «просто посмотреть» подставляло бы картинку в
 * SEO-поля открытой страницы.
 *
 * Латч монтирования обратно не снимается: галерея на старте дашборда тянула бы
 * списки файлов и категорий, которых у неоткрытой галереи никто не спрашивает, а
 * пересоздание компонента после закрытия теряло бы анимацию.
 *
 * @returns Состояние галереи и способы её открыть.
 */
export function usePublishMediaGallery(): IUsePublishMediaGalleryReturn {
    // #region Data
    const shouldMount = ref(false);
    const isOpen = ref(false);
    const context = ref<TPublishMediaGalleryContext>('manager');
    // #endregion

    // #region Methods
    /**
     * Открывает галерею как менеджер файлов (пункт рейла).
     */
    function openAsManager(): void {
        context.value = 'manager';
        shouldMount.value = true;
        isOpen.value = true;
    }

    /**
     * Открывает галерею как пикер OG-изображения панели деталей.
     */
    function openAsPicker(): void {
        context.value = 'properties';
        shouldMount.value = true;
        isOpen.value = true;
    }

    /**
     * Закрывает галерею, оставляя компонент смонтированным.
     */
    function close(): void {
        isOpen.value = false;
    }
    // #endregion

    return { shouldMount, isOpen, context, openAsManager, openAsPicker, close };
}
