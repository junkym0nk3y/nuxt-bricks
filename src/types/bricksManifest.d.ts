/**
 * Types of the brick component manifest generator (`src/bricks-manifest.ts`):
 * scan options and the contract of the serialized queue. The manifest itself is
 * a contract shared with the runtime, in
 * `runtime/modules/common/types/brickManifest.d.ts`.
 */
import type { IBricksManifest } from '../runtime/modules/common/types/brickManifest';

/** Manifest generation options */
export interface IBricksManifestOptions {
    /** `nuxt.options.srcDir` — the base both for the file search and for loader keys */
    srcDir: string;
    /** Manifest directory (see resolveBricksManifestDir) */
    manifestDir: string;
}

/** Serialized manifest generation queue (see createBricksManifestQueue) */
export interface IBricksManifestQueue {
    /**
     * Queues a generation run. The returned promise always belongs to a scan that
     * started after the call; after `dispose()` it resolves to `undefined`.
     */
    enqueue: () => Promise<IBricksManifest | undefined>;
    /**
     * Closes the queue and waits for an unfinished scan.
     * Requests arriving after the call are not served.
     */
    dispose: () => Promise<void>;
}
