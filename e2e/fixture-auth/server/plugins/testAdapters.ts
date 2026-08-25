/**
 * Both storages of the fixture are replaced before the first request.
 *
 * The accounts go into memory (`createFakeAuthAdapter`), the pages and the media
 * into the same fake backend the basic fixture talks to — reached through the HTTP
 * adapter of the package itself, so the data path stays the shipped one and only
 * its far end is a double. Registering an adapter is the public way in: the
 * `nuxt-bricks/persistence` entry exists for exactly this.
 *
 * The default factory of the external mode is deliberately NOT installed: database
 * auth refuses to work next to it, and that refusal is a guard rather than an
 * accident.
 */

// #region Imports
// Nitro
import { defineNitroPlugin } from 'nitropack/runtime';

// Persistence registry
import {
    setBricksAuthAdapter,
    setBricksStorageAdapter,
} from '../../../../src/runtime/modules/persistence/server/registry';
import { createHttpStorageAdapter } from '../../../../src/runtime/modules/persistence/server/http/httpStorageAdapter';

// Utils
import { createFakeAuthAdapter } from '../utils/fakeAuthAdapter';

// Support
import { registerMemoryPublishAdapter } from '../../../support/memoryPublishAdapter';
// #endregion

export default defineNitroPlugin(() => {
    setBricksAuthAdapter(createFakeAuthAdapter());
    // The binary storage as well: an upload made by a logged-in person has to have
    // somewhere to land here too, otherwise the first media test written against this
    // fixture answers 500 for a reason that has nothing to do with what it checks
    registerMemoryPublishAdapter();
    setBricksStorageAdapter(
        createHttpStorageAdapter({
            baseUrl: process.env.E2E_AUTH_BACKEND_URL ?? '',
            token: process.env.E2E_AUTH_BACKEND_TOKEN ?? '',
        })
    );
});
