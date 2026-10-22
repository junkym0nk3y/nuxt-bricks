import type { Nuxt, NuxtHooks } from 'nuxt/schema';

/** The client manifest the `build:manifest` hook hands over for changes */
export type TBricksClientManifest = Parameters<NuxtHooks['build:manifest']>[0];

/** `features.inlineStyles`: inline every style, none, or decide per module id */
export type TBricksInlineStyles = Nuxt['options']['features']['inlineStyles'];
