// #region Imports
// Vue
import { ref, computed, onMounted, type Ref, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Interfaces
interface IPublishDetailsUrlFields {
    pagename: Ref<string>;
    urlPrefix: Ref<string>;
    subdomain: Ref<string>;
}

interface IPublishDetailsUrlReturn {
    liveUrl: ComputedRef<string>;
    copyLiveUrl: () => Promise<boolean>;
}
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
        const slug = String(fields.pagename.value ?? '').trim();
        if (!slug) {
            return '';
        }
        const prefix = String(fields.urlPrefix.value ?? '').trim();
        const sub = String(fields.subdomain.value ?? '').trim();
        const path = prefix ? `/${prefix}/${slug}` : `/${slug}`;
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
