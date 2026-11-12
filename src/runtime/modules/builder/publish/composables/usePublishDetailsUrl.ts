// #region Imports
// Types
import type {
    IPublishDetailsUrlFields,
    IPublishDetailsUrlParts,
    IPublishDetailsUrlReturn,
} from '../types/composables';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';
// #endregion

/**
 * The live URL of a page built out of its address fields (pagename/urlPrefix/
 * subdomain), plus copying it to the clipboard.
 * The host and the scheme are taken from `window.location` on mount (SSR-safe); until
 * then a domain stub stands in for the text, and there is no link to follow.
 *
 * @param fields - The reactive fields that take part in the URL.
 */
export function usePublishDetailsUrl(fields: IPublishDetailsUrlFields): IPublishDetailsUrlReturn {
    // #region Data
    const { t } = useI18n();
    const { withBase } = useBricksRoutePaths();
    const host = ref('');
    const protocol = ref('');
    // #endregion

    // #region Computed
    /**
     * The host and the path of the page — the part shared by the text and the link.
     * The path carries `app.baseURL`: an application mounted under a prefix
     * (`/landings/`) serves its pages there, and a URL without the prefix led to the
     * neighbor that owns the root of the domain.
     */
    const hostAndPath = computed<IPublishDetailsUrlParts | null>(() => {
        const address = toPageAddress(String(fields.pagename.value ?? ''), fields.urlPrefix.value);

        if (!address.pagename) {
            return null;
        }

        const sub = String(fields.subdomain.value ?? '').trim();
        // The path of the address comes from the shared helper rather than from a
        // joining of segments of our own: a third copy of the rule would part ways
        // with the address the page really opens under, and the panel would show a
        // link to something else
        const path = withBase(getPublishedPagePath(address));
        const domain = host.value || t('bricks.publish.domainStub');

        return { host: sub ? `${sub}.${domain}` : domain, path };
    });

    const liveUrl = computed<string>(() =>
        hostAndPath.value ? `${hostAndPath.value.host}${hostAndPath.value.path}` : ''
    );

    /**
     * The URL with its scheme, for the link and the clipboard. Empty until the host is
     * known: a link built on the domain stub would lead nowhere. The scheme is the one
     * the builder is open under rather than a hardcoded `https`, which handed a local
     * `http` setup a link that did not open.
     */
    const liveHref = computed<string>(() =>
        hostAndPath.value && host.value ? `${protocol.value}//${liveUrl.value}` : ''
    );
    // #endregion

    // #region Methods
    /**
     * Copies the live URL to the clipboard.
     *
     * @returns `true` on success, `false` when there is no URL yet or the clipboard is
     * unavailable or blocked.
     */
    async function copyLiveUrl(): Promise<boolean> {
        if (!liveHref.value) {
            return false;
        }

        try {
            await navigator.clipboard.writeText(liveHref.value);
            return true;
        } catch {
            return false;
        }
    }
    // #endregion

    // #region Lifecycle
    onMounted(() => {
        host.value = window.location.host;
        protocol.value = window.location.protocol;
    });
    // #endregion

    return {
        liveUrl,
        liveHref,
        copyLiveUrl,
    };
}
