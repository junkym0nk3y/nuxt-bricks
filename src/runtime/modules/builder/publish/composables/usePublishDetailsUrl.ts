// #region Imports
// Types
import type { IPublishDetailsUrlFields, IPublishDetailsUrlReturn } from '../types/composables';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * Live-URL страницы от текущих значений формы панели деталей
 * (pagename/urlPrefix/subdomain) + копирование его в буфер обмена.
 * Хост берётся из `window.location` на mount (SSR-safe), до этого — стаб домена.
 *
 * @param fields - Реактивные поля формы, участвующие в URL.
 */
export function usePublishDetailsUrl(fields: IPublishDetailsUrlFields): IPublishDetailsUrlReturn {
    // #region Data
    const { t } = useI18n();
    const host = ref('');
    // #endregion

    // #region Computed
    const liveUrl = computed<string>(() => {
        const address = toPageAddress(String(fields.pagename.value ?? ''), fields.urlPrefix.value);

        if (!address.pagename) {
            return '';
        }

        const sub = String(fields.subdomain.value ?? '').trim();
        // Путь адреса — общим хелпером, а не своей склейкой сегментов: третья
        // копия правила разошлась бы с адресом, по которому страница реально
        // открывается, и панель показывала бы ссылку не на неё
        const path = getPublishedPagePath(address);
        const domain = host.value || t('bricks.publish.domainStub');
        return sub ? `${sub}.${domain}${path}` : `${domain}${path}`;
    });
    // #endregion

    // #region Methods
    /**
     * Копирует live-URL в буфер обмена.
     *
     * @returns `true` при успехе, `false` — если clipboard недоступен/запрещён.
     */
    async function copyLiveUrl(): Promise<boolean> {
        try {
            await navigator.clipboard.writeText(`https://${liveUrl.value}`);
            return true;
        } catch {
            return false;
        }
    }
    // #endregion

    // #region Lifecycle
    onMounted(() => {
        host.value = window.location.host;
    });
    // #endregion

    return {
        liveUrl,
        copyLiveUrl,
    };
}
