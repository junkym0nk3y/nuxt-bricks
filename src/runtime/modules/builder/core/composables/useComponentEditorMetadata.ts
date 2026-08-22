// #region Imports
// Types
import type { IBricksComponent } from '../../../common/types/brick';
import type {
    IComponentEditorMetadata,
    IUseComponentEditorMetadataReturn,
} from '../types/componentLibrary';

// Composables
import { useBrickMetadata } from './useBrickMetadata';
import { useComponentProperties } from './useComponentProperties';

// Utils
import { getLayoutProperties } from '../utils/layoutProperties';

// Constants
import { LAYOUT_COMPONENTS } from '../constants/layoutComponents';
// #endregion

/**
 * Properties-panel data of a canvas component.
 *
 * One resolver for both selection paths — a click on the component and a click in
 * the schema tree: each of them used to collect the properties on its own, and an
 * edit of one silently drifted away from the other.
 *
 * @returns The function that collects the properties-panel data.
 */
export function useComponentEditorMetadata(): IUseComponentEditorMetadataReturn {
    const { readBrickMetadata } = useBrickMetadata();
    const { brickValuesToProperties } = useComponentProperties();

    /**
     * Collects the description and the property definitions of a component.
     *
     * An empty result for a brick component means the manifest has not arrived yet:
     * there is deliberately no fallback to importing the brick module — a second
     * source of the same data would drift away from the first. At that moment the
     * library shows the failure and offers a retry, and the retry fills the panel
     * that is already open.
     *
     * @param component - Component taken from the page schema.
     * @returns Properties and description for the panel.
     */
    function resolveComponentEditorMetadata(component: IBricksComponent): IComponentEditorMetadata {
        if (component.type === 'layout') {
            return {
                properties: getLayoutProperties(component.componentName.toLowerCase()),
                description: LAYOUT_COMPONENTS.find(
                    (item) => item.brickPath === component.brickPath
                )?.description,
            };
        }

        const metadata = readBrickMetadata(component.brickPath);

        return {
            properties: metadata ? brickValuesToProperties(metadata.values) : [],
            description: metadata?.description,
        };
    }

    return {
        resolveComponentEditorMetadata,
    };
}
