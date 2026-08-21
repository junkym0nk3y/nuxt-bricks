// #region Imports
// Types
import type { IUsePublishMediaGalleryReturn } from '../types/composables';

// Vue
import { ref } from 'vue';
// #endregion

/**
 * Модалка медиа-галереи на дашборде: латч монтирования и видимость.
 *
 * Роль у неё осталась одна — пикер OG-изображения панели деталей страницы:
 * выбор файла здесь шаг внутри другой работы, поэтому окно поверх формы уместно.
 * Менеджером файлов работает раздел рейла «Медиатека», и различать контексты
 * больше не нужно.
 *
 * Латч монтирования обратно не снимается: галерея на старте дашборда тянула бы
 * списки файлов и категорий, которых у неоткрытой галереи никто не спрашивает, а
 * пересоздание компонента после закрытия теряло бы анимацию.
 *
 * @returns Состояние галереи и способ её открыть.
 */
export function usePublishMediaGallery(): IUsePublishMediaGalleryReturn {
    // #region Data
    const shouldMount = ref(false);
    const isOpen = ref(false);
    // #endregion

    // #region Methods
    /**
     * Открывает галерею пикером OG-изображения.
     */
    function open(): void {
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

    return { shouldMount, isOpen, open, close };
}
