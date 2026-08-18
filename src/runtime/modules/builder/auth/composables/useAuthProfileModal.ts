// #region Imports
// Types
import type { IUseAuthProfileModalReturn, TAuthProfileTab } from '../types/auth';

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
 * @returns Состояние модалки профиля, запрошенная вкладка и операции открытия
 * и закрытия.
 */
export function useAuthProfileModal(): IUseAuthProfileModalReturn {
    // #region Data
    const shouldMount = ref(false);
    const isOpen = ref(false);
    const requestedTab = ref<TAuthProfileTab>('profile');
    // #endregion

    // #region Methods
    /**
     * Открывает модалку, монтируя её при первом обращении.
     *
     * Вкладка передаётся вызывающим: из меню профиля открывается сам профиль, а
     * из своей строки раздела «Пользователи» — форма пароля, потому что ключ в
     * строке обещает именно её. Дефолт возвращает профиль, поэтому открытие,
     * пришедшее однажды за паролем, не остаётся паролем навсегда.
     *
     * @param tab - Вкладка, с которой открыть модалку.
     */
    function open(tab: TAuthProfileTab = 'profile'): void {
        requestedTab.value = tab;
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

    return { shouldMount, isOpen, requestedTab, open, close };
}
