import type {
    IBricksSchema,
    TBricksDeviceKey,
    IBricksSchemaMeta,
} from '../../../../common/types/brick';
import { deserializeSchema, serializeSchema } from '../../utils/history';
import { stripDeviceKeysFromSchema } from '../../utils/deviceKeyCleanup';
import { useSidebarStore } from '../sidebar';
import { useHistoryStore } from '../history';
import { useNavigationStore } from '../navigation';
import type { IComponentsSchemaActions, IComponentsStore } from '../types';
import { normalizeDeviceVisibility } from '../../../../common/utils/bricks/deviceVisibility';
import { scheduleHistorySave } from './historyDebounce';

/**
 * Collects the meta the schema carries out of the navigation store.
 */
function collectSchemaMeta(): IBricksSchemaMeta | undefined {
    const navigationStore = useNavigationStore();
    const meta: IBricksSchemaMeta = {};

    if (navigationStore.hasItems) {
        meta.navigation = navigationStore.toMeta();
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Actions around exporting and importing the schema, and around the history.
 */
export const schemaActions: IComponentsSchemaActions = {
    /**
     * Turns the full-width stretching of a component on or off.
     *
     * @param id - Target component.
     * @param fullWidth - New value of the flag.
     */
    setComponentFullWidth(this: IComponentsStore, id: string, fullWidth: boolean) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        component.fullWidth = fullWidth;
        this.saveToHistory();
    },

    /**
     * Sets a custom HTML id, the one anchor navigation targets.
     *
     * @param id - Target component.
     * @param htmlId - Value of the id attribute (an empty string removes it).
     */
    setComponentHtmlId(this: IComponentsStore, id: string, htmlId: string) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        component.htmlId = htmlId || undefined;
        scheduleHistorySave(this);
    },

    /**
     * Shows or hides a component.
     *
     * @param id - Target component.
     * @param hidden - New value of the hidden flag.
     */
    setComponentHidden(this: IComponentsStore, id: string, hidden: boolean) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        component.isHidden = hidden;
        this.saveToHistory();
    },

    /**
     * Sets the visibility flag of a single device.
     *
     * @param id - Target component.
     * @param device - Device key.
     * @param value - New visibility flag.
     */
    setComponentDeviceVisibilityFlag(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey,
        value: boolean
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        const current = normalizeDeviceVisibility(component.deviceVisibility);
        component.deviceVisibility = {
            ...current,
            [device]: Boolean(value),
        };
        this.saveToHistory();
    },

    /**
     * Collects the current schema of the page.
     *
     * @returns Serialized schema of the page.
     */
    exportSchema(this: IComponentsStore) {
        return serializeSchema(this.components, collectSchemaMeta());
    },

    /**
     * Captures the current state of the schema into the history.
     */
    saveToHistory(this: IComponentsStore) {
        const historyStore = useHistoryStore();
        const schema = serializeSchema(this.components, collectSchemaMeta());
        historyStore.capture(schema);
    },

    /**
     * Undo: restores the previous schema from the history.
     */
    undo(this: IComponentsStore) {
        const historyStore = useHistoryStore();
        const schema = historyStore.undo();
        if (schema) {
            this.loadSchema(schema);
        }
    },

    /**
     * Redo: applies the schema it gets back to the current state.
     */
    redo(this: IComponentsStore) {
        const historyStore = useHistoryStore();
        const schema = historyStore.redo();
        if (schema) {
            this.loadSchema(schema);
        }
    },

    /**
     * Drops everything belonging to devices that left the set, both from the schema
     * and from the history.
     *
     * An edit of the set topology must not be undoable, and wiping the history
     * outright is not allowed either: the confirmation promises to delete the
     * overrides of that device and nothing else, while a wipe would also take away the
     * ability to undo earlier edits of text and structure. So the stored branch of the
     * history is rewritten by the same cleanup — undo keeps working, and the deleted
     * values come back neither through undo, nor through redo, nor by adding a device
     * with the same key again.
     *
     * @param removedKeys - Keys of the devices the set no longer carries.
     */
    stripDeviceKeys(this: IComponentsStore, removedKeys: ReadonlySet<string>) {
        if (removedKeys.size === 0) {
            return;
        }

        const historyStore = useHistoryStore();

        historyStore.rebase((schema) => stripDeviceKeysFromSchema(schema, removedKeys));

        this.components = deserializeSchema(
            stripDeviceKeysFromSchema(this.exportSchema(), removedKeys)
        );
    },

    /**
     * Loads a serialized schema into the store, bringing the selection in step with it
     * and resetting the history on request.
     *
     * @param schema - DTO of the canvas.
     * @param options - Extra flags (resetting the history, for one).
     */
    loadSchema(
        this: IComponentsStore,
        schema: IBricksSchema,
        options?: { resetHistory?: boolean }
    ) {
        this.components = deserializeSchema(schema);

        this.components.forEach((component) => {
            if (!component.parent && component.fullWidth === undefined) {
                component.fullWidth = false;
            }
        });

        // The navigation is brought in step with the meta
        const navigationStore = useNavigationStore();
        navigationStore.loadFromMeta(schema.meta);

        if (
            this.selectedComponent &&
            !this.components.some((component) => component.id === this.selectedComponent?.id)
        ) {
            this.selectedComponent = null;
            const sidebarStore = useSidebarStore();
            sidebarStore.hidePropertiesPanel();
        }

        if (options?.resetHistory) {
            const historyStore = useHistoryStore();
            historyStore.reset();
            historyStore.capture(serializeSchema(this.components, collectSchemaMeta()));
        }
    },
};
