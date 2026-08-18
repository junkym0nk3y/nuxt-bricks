// #region Imports
// Types
import type { IUseAuthProfileModalReturn } from '../types/auth';

// Vue
import { ref } from 'vue';
// #endregion

/**
 * Монтирование и открытость модалки своего профиля.
 *
 * Живёт композаблом, а не парой ref'ов в каждом хосте: модалку монтируют обе
 * поверхности — дашборд и билдер, — и латч монтирования у них обязан работать
 * одинаково. Латч обратно не снимается (как у медиа-галереи): пересоздание
 * компонента теряло бы анимацию закрытия, а чанк, уже приехавший в браузер,
 * второй раз не грузится.
 *
 * @returns Состояние модалки профиля и операции открытия/закрытия.
 */
export function useAuthProfileModal(): IUseAuthProfileModalReturn {
    // #region Data
    const shouldMount = ref(false);
    const isOpen = ref(false);
    // #endregion

    // #region Methods
    /**
     * Открывает модалку, монтируя её при первом обращении.
     */
    function open(): void {
        shouldMount.value = true;
        isOpen.value = true;
    }

    /**
     * Закрывает модалку, оставляя компонент смонтированным.
     */
    function close(): void {
        isOpen.value = false;
    }
    // #endregion

    return { shouldMount, isOpen, open, close };
}
