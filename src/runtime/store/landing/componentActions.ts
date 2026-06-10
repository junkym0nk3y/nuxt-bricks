import { crudActions } from './actions/crud';
import { slotActions } from './actions/slots';
import { propertyActions } from './actions/properties';
import { selectionActions } from './actions/selection';
import { schemaActions } from './actions/schema';
import { clipboardActions } from './actions/clipboard';
import { orderActions } from './actions/order';
import { favoritesActions } from './actions/favorites';
import type { ILandingComponentsActions } from './types';

/**
 * Собирает все действия над компонентами в единый объект для подключения к стору.
 */
export const componentActions: ILandingComponentsActions = {
    ...crudActions,
    ...slotActions,
    ...propertyActions,
    ...selectionActions,
    ...schemaActions,
    ...clipboardActions,
    ...orderActions,
    ...favoritesActions,
};
