// #region Imports
// Types
import type {
    IUsePublishDashboardSectionsOptions,
    IUsePublishDashboardSectionsReturn,
    TPublishDashboardSection,
} from '../types/dashboard';

// Constants
import { BRICKS_DASHBOARD_SECTION_QUERY_KEY } from '../../../common/constants/routes';

// Vue
import { computed, onMounted, ref, watch } from 'vue';

// Nuxt
import { useRoute, useRouter } from '#imports';
// #endregion

/**
 * Every section of the rail, for reading the query. A record rather than an array: a
 * section added to the type and forgotten here fails the type check instead of being
 * silently refused by the URL.
 */
const DASHBOARD_SECTIONS: Record<TPublishDashboardSection, true> = {
    pages: true,
    templates: true,
    users: true,
    media: true,
};

/** The section the dashboard opens on; its URL carries no section key at all */
const DEFAULT_DASHBOARD_SECTION: TPublishDashboardSection = 'pages';

/**
 * Tells whether a query value names a section of the rail.
 *
 * @param value - The value of the section key, as the router hands it over.
 * @returns Whether it is a section key.
 */
function isDashboardSection(value: unknown): value is TPublishDashboardSection {
    return typeof value === 'string' && Object.hasOwn(DASHBOARD_SECTIONS, value);
}

/**
 * The open section of the dashboard and the search string of that section.
 *
 * Every section has a query of its own: the lists are different, and one shared
 * string would search in one of them by a query typed for another — the section
 * would look broken. The field in the header is single, though, so the routing of
 * the input is gathered here rather than scattered as conditions across the host.
 *
 * The open section lives in the URL (`?section=`), so a reload opens the dashboard where
 * it was. A switch replaces the entry rather than pushing one: "Back" leaves the
 * dashboard instead of walking through the tabs. The pages write no key — a bare
 * dashboard URL stays bare — and any other query parameter is carried over untouched.
 *
 * @param options - The page search string, the availability of the accounts
 *   section and the leaving of the media library.
 * @returns The active section, the queries of the sections and the switches.
 */
export function usePublishDashboardSections(
    options: IUsePublishDashboardSectionsOptions
): IUsePublishDashboardSectionsReturn {
    // #region Data
    const route = useRoute();
    const router = useRouter();
    const querySection = route.query[BRICKS_DASHBOARD_SECTION_QUERY_KEY];
    /**
     * The section picked on the rail or named by the URL; an unknown name opens the
     * pages. The media library named by the URL needs no entry of its own: the dashboard
     * reads the files at its start whatever the section is.
     */
    const selectedSection = ref<TPublishDashboardSection>(
        isDashboardSection(querySection) ? querySection : DEFAULT_DASHBOARD_SECTION
    );
    // The URL is written only once the dashboard is mounted: before that the section may
    // still change under the role arriving, and a navigation sent from an unfinished
    // setup would race the one that is rendering the dashboard
    let isSectionQuerySynced = false;
    const usersSearchQuery = ref('');
    const templatesSearchQuery = ref('');
    const mediaSearchQuery = ref('');
    // #endregion

    // #region Computed
    /**
     * The open section. The accounts section named by the URL waits for its visibility
     * rather than being dropped at the start: in a build without SSR the role arrives
     * after this composable is set up, and until then even an administrator has no
     * right to the section — a check made once would send them to the pages on every
     * reload. While the section is not visible, the pages are open.
     */
    const activeSection = computed<TPublishDashboardSection>(() =>
        selectedSection.value === 'users' && !options.isUsersSectionVisible.value
            ? DEFAULT_DASHBOARD_SECTION
            : selectedSection.value
    );

    /** The query from the header field — of whichever section is open */
    const activeSearchQuery = computed<string>(() => {
        if (activeSection.value === 'users') {
            return usersSearchQuery.value;
        }

        if (activeSection.value === 'templates') {
            return templatesSearchQuery.value;
        }

        return activeSection.value === 'media'
            ? mediaSearchQuery.value
            : options.pagesSearchQuery.value;
    });
    // #endregion

    // #region Methods
    /**
     * Switches the active section of the rail.
     *
     * A section absent from this installation does not open even on a direct call:
     * the rail item of a turned-off section is not drawn, but the `unavailable`
     * state may arrive after a person has already ended up in the section.
     *
     * @param section - Section key.
     */
    function selectSection(section: TPublishDashboardSection): void {
        if (section === 'users' && !options.isUsersSectionVisible.value) {
            return;
        }

        selectedSection.value = section;
    }

    /**
     * Puts the open section into the URL. A failed navigation costs only the restore
     * after a reload, so it is logged rather than thrown: the section itself has already
     * switched.
     *
     * There is no "already there" shortcut: `route.query` lags behind a replace still in
     * flight, so a quick switch back would be skipped while the pending replace went on to
     * write the section just left. The router drops a duplicate on its own, and cancels
     * the pending navigation while doing so.
     */
    async function syncSectionQuery(): Promise<void> {
        // The router may already be on the next page while Suspense still shows the
        // dashboard waiting for it to load. The route of the dashboard is frozen then, and
        // a replace with no path would put the section on the address of that page
        if (router.currentRoute.value.path !== route.path) {
            return;
        }

        const value =
            activeSection.value === DEFAULT_DASHBOARD_SECTION ? undefined : activeSection.value;
        const query = { ...route.query };

        if (value === undefined) {
            delete query[BRICKS_DASHBOARD_SECTION_QUERY_KEY];
        } else {
            query[BRICKS_DASHBOARD_SECTION_QUERY_KEY] = value;
        }

        try {
            await router.replace({ query });
        } catch (error: unknown) {
            console.warn('[Publish] Failed to put the dashboard section into the URL:', error);
        }
    }

    /**
     * Writes the search query into whichever section is open.
     *
     * @param value - The query that was typed.
     */
    function setSearchQuery(value: string): void {
        if (activeSection.value === 'users') {
            usersSearchQuery.value = value;
            return;
        }

        if (activeSection.value === 'templates') {
            templatesSearchQuery.value = value;
            return;
        }

        if (activeSection.value === 'media') {
            mediaSearchQuery.value = value;
            return;
        }

        options.pagesSearchQuery.value = value;
    }
    // #endregion

    // #region Lifecycle
    // The first write also brings the URL in line with what is open: an unknown name, a
    // `?section=pages` or the accounts section of a role without it give way to the
    // section actually shown
    onMounted(async () => {
        isSectionQuerySynced = true;
        await syncSectionQuery();
    });

    watch(activeSection, async () => {
        if (isSectionQuerySynced) {
            await syncSectionQuery();
        }
    });

    // The accounts section may have vanished under one's hands: a 403 or a 404 on
    // its endpoints means it is absent from this installation. The computed above
    // already shows the pages; the pick itself is dropped too, or the section would
    // come back by surprise should the endpoints answer again
    watch(options.isUsersSectionVisible, (isVisible) => {
        if (!isVisible && selectedSection.value === 'users') {
            selectedSection.value = DEFAULT_DASHBOARD_SECTION;
        }
    });

    // Leaving the media library closes the session of working with it: the
    // selected file, the category and the upload parameters are obliged to return
    // to their initial values — otherwise the next opening of the section would
    // upload files into the wrong category and with the wrong optimization
    // settings. The query is reset right here
    watch(activeSection, (section, previousSection) => {
        if (previousSection === 'media' && section !== 'media') {
            mediaSearchQuery.value = '';
            options.onLeaveMedia();
            return;
        }

        // Entering the section sends for the file list: the first read runs at the
        // start of the dashboard and may never have arrived, and a section with no
        // data says "the media library is empty" — that is, it lies about the
        // contents. A repeated read is cut off by the snapshot
        if (section === 'media') {
            options.onEnterMedia();
        }
    });
    // #endregion

    return {
        activeSection,
        usersSearchQuery,
        templatesSearchQuery,
        mediaSearchQuery,
        activeSearchQuery,
        selectSection,
        setSearchQuery,
    };
}
