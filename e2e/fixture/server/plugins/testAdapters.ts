/**
 * The binary storage of the fixture, registered before the first request.
 *
 * Without it an upload has nowhere to put the file and the handler answers 500, so
 * the media library of the browser suite could only ever be checked empty — and an
 * empty grid says nothing about the tiles, their keyboard or their accessibility.
 * S3 is not an option here: a browser test may not depend on a bucket.
 */

// #region Imports
// Nitro
import { defineNitroPlugin } from 'nitropack/runtime';

// Support
import { registerMemoryPublishAdapter } from '../../../support/memoryPublishAdapter';
// #endregion

export default defineNitroPlugin(() => {
    registerMemoryPublishAdapter();
});
