// Types
import type { INavigatorWithUserAgentData } from '../../types/canvas';

/**
 * Whether the shortcuts of the interface should be captioned the Apple way (⌘ and ⌫
 * instead of Ctrl and Del).
 *
 * The client hint comes first and `navigator.userAgent` is the fallback:
 * `navigator.platform` is deprecated, and part of the browsers already answer it with a
 * frozen value, so the captions of the menu drifted away from the keys that actually
 * work. Safari has no hints at all — for it the fallback is the only source, and iPhone
 * and iPad live in the user agent string rather than in the hint.
 *
 * @returns The captions of the shortcuts follow macOS and iOS.
 */
export function isApplePlatform(): boolean {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const hintedPlatform = (navigator as INavigatorWithUserAgentData).userAgentData?.platform;

    if (hintedPlatform) {
        return /mac|ios/i.test(hintedPlatform);
    }

    return /Mac|iPhone|iPad/.test(navigator.userAgent);
}
