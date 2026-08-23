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
 * The live URL of a page built out of the current values of the details panel form
 * (pagename/urlPrefix/subdomain), plus copying it to the clipboard.
 * The host is taken from `window.location` on mount (SSR-safe); until then a
 * domain stub stands in.
 *
 * @param fields - The reactive fields of the form that take part in the URL.
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
        // The path of the address comes from the shared helper rather than from a
        // joining of segments of our own: a third copy of the rule would part ways
        // with the address the page really opens under, and the panel would show a
        // link to something else
        const path = getPublishedPagePath(address);
        const domain = host.value || t('bricks.publish.domainStub');
        return sub ? `${sub}.${domain}${path}` : `${domain}${path}`;
    });
    // #endregion

    // #region Methods
    /**
     * Copies the live URL to the clipboard.
     *
     * @returns `true` on success, `false` when the clipboard is unavailable or
     * blocked.
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
