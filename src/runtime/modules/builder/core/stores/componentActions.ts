import { crudActions } from './actions/crud';
import { slotActions } from './actions/slots';
import { propertyActions } from './actions/properties';
import { selectionActions } from './actions/selection';
import { schemaActions } from './actions/schema';
import { clipboardActions } from './actions/clipboard';
import { orderActions } from './actions/order';
import { favoritesActions } from './actions/favorites';
import type { TComponentsActions } from './types';

/**
 * Collects every component action into the single object the store plugs in.
 */
export const componentActions: TComponentsActions = {
    ...crudActions,
    ...slotActions,
    ...propertyActions,
    ...selectionActions,
    ...schemaActions,
    ...clipboardActions,
    ...orderActions,
    ...favoritesActions,
};
