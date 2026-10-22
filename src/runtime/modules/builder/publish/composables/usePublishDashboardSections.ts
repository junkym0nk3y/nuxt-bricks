// #region Imports
// Types
import type {
    IUsePublishDashboardSectionsOptions,
    IUsePublishDashboardSectionsReturn,
    TPublishDashboardSection,
} from '../types/dashboard';

// Vue
import { computed, ref, watch } from 'vue';
// #endregion

/**
 * The open section of the dashboard and the search string of that section.
 *
 * Every section has a query of its own: the lists are different, and one shared
 * string would search in one of them by a query typed for another — the section
 * would look broken. The field in the header is single, though, so the routing of
 * the input is gathered here rather than scattered as conditions across the host.
 *
 * @param options - The page search string, the availability of the accounts
 *   section and the leaving of the media library.
 * @returns The active section, the queries of the sections and the switches.
 */
export function usePublishDashboardSections(
    options: IUsePublishDashboardSectionsOptions
): IUsePublishDashboardSectionsReturn {
    // #region Data
    const activeSection = ref<TPublishDashboardSection>('pages');
    const usersSearchQuery = ref('');
    const templatesSearchQuery = ref('');
    const mediaSearchQuery = ref('');
    // #endregion

    // #region Computed
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

        activeSection.value = section;
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
    // The accounts section may have vanished under one's hands: a 403 or a 404 on
    // its endpoints means it is absent from this installation — left open, it
    // would show an empty screen with no explanation
    watch(options.isUsersSectionVisible, (isVisible) => {
        if (!isVisible && activeSection.value === 'users') {
            activeSection.value = 'pages';
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
