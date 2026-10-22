/**
 * The project device set is resolved once per build, and both consumers — the
 * public runtimeConfig and the SCSS map of the mixins — are fed that one result.
 *
 * A second independent call would not fail the build: it would merely let the two
 * surfaces answer the same option differently one day. The identity check below is
 * the discriminating half — it is fed a set that is NOT the default one, so a
 * consumer that resolves again lands on `DEFAULT_BRICKS_DEVICES` instead and the
 * pass-through is visible.
 */

// #region Imports
// Node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TBricksProjectDeviceSet } from '../../src/runtime/modules/common/types/devices';

// Constants
import { DEFAULT_BRICKS_DEVICES } from '../../src/runtime/modules/common/constants/devices';

// Utils
import { applyBricksRuntimeConfig } from '../../src/module-runtime-config';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from '../../src/runtime/modules/common/utils/bricks/routePaths';
// #endregion

// #region Data
/** The build-time layer: every production call site of the resolver lives in these */
const BUILD_TIME_SOURCES = [
    fileURLToPath(new URL('../../src/module.ts', import.meta.url)),
    fileURLToPath(new URL('../../src/module-runtime-config.ts', import.meta.url)),
];

/** A call of the resolver, as opposed to its declaration */
const RESOLVER_CALL = /(?<!function\s)\bresolveBricksDevices\s*\(/g;
// #endregion

describe('device set: resolved once per build', () => {
    it('runtimeConfig passes through the set it is given instead of resolving again', () => {
        const runtimeConfig: Record<string, unknown> = {};
        // A copy, not `DEFAULT_BRICKS_DEVICES` itself: a second resolve would return
        // the default object and the identity check would pass on the old code
        const devices = DEFAULT_BRICKS_DEVICES.map((device) => ({
            ...device,
        })) as TBricksProjectDeviceSet;

        applyBricksRuntimeConfig(runtimeConfig, {}, DEFAULT_BRICKS_ROUTE_PREFIXES, true, devices);

        const publicConfig = runtimeConfig.public as Record<string, unknown>;

        expect(publicConfig.bricksDevices).toBe(devices);
    });

    it('the build-time layer calls the resolver exactly once', () => {
        const calls = BUILD_TIME_SOURCES.flatMap((path) => [
            ...readFileSync(path, 'utf8').matchAll(RESOLVER_CALL),
        ]);

        expect(calls).toHaveLength(1);
    });
});
