/**
 * Which dependencies Vite prebundles for which deploy.
 *
 * The slider block belongs to a published page, so a render-only deploy needs its
 * dependency prebundled even though the builder is never built — kept in the
 * builder-only list it cost the dev server a cold re-optimize on the first page
 * carrying a slider. The mirror case matters too: with both surfaces off the
 * module renders no page at all, and prebundling anything is work for a deploy
 * that never reaches it.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksSurfaces } from '../../src/types/moduleSetup';

// Utils
import { resolveViteOptimizeInclude } from '../../src/module-setup';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from '../../src/runtime/modules/common/utils/bricks/routePaths';
// #endregion

// #region Data
/** A dependency of the slider block — a published page reaches it without the builder */
const RENDER_DEPENDENCY = 'swiper/vue';

/** A dependency of the builder UI alone */
const BUILDER_DEPENDENCY = '@tiptap/core';

/**
 * The CommonJS-only sanitizer behind the text, accordion and SVG blocks: the dev
 * optimizer does not discover it inside node_modules, and served raw it breaks the page
 */
const COMMONJS_RENDER_DEPENDENCY = 'xss';
// #endregion

// #region Methods
/**
 * Builds a surface set with the given feature flags.
 *
 * @param isBuilderEnabled - Whether the builder is registered.
 * @param arePublishedPagesEnabled - Whether the live render is registered.
 * @returns Surfaces for the resolver.
 */
function surfaces(isBuilderEnabled: boolean, arePublishedPagesEnabled: boolean): IBricksSurfaces {
    return {
        routePrefixes: DEFAULT_BRICKS_ROUTE_PREFIXES,
        isBuilderEnabled,
        arePublishedPagesEnabled,
    };
}
// #endregion

describe('vite prebundle list follows the active surfaces', () => {
    it('a render-only deploy still prebundles the render dependency', () => {
        const include = resolveViteOptimizeInclude(surfaces(false, true));

        expect(include).toContain(RENDER_DEPENDENCY);
        expect(include).not.toContain(BUILDER_DEPENDENCY);
    });

    it('a builder deploy prebundles both the render and the builder dependencies', () => {
        const include = resolveViteOptimizeInclude(surfaces(true, true));

        expect(include).toContain(RENDER_DEPENDENCY);
        expect(include).toContain(BUILDER_DEPENDENCY);
    });

    it('a builder without the live render still prebundles the render dependency', () => {
        // The preview lives behind the builder prefix and mounts the same blocks
        expect(resolveViteOptimizeInclude(surfaces(true, false))).toContain(RENDER_DEPENDENCY);
    });

    it('a render-only deploy prebundles the CommonJS sanitizer', () => {
        expect(resolveViteOptimizeInclude(surfaces(false, true))).toContain(
            COMMONJS_RENDER_DEPENDENCY
        );
    });

    it('both surfaces off prebundles nothing at all', () => {
        expect(resolveViteOptimizeInclude(surfaces(false, false))).toEqual([]);
    });
});
