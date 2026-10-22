/**
 * The contrast of the secondary text role (`--bricks-text-muted`) in both themes and on
 * the light canvas inside a dark shell.
 *
 * Why a spec and not a review: the role appeared because the pale steps of the palette
 * were being used as text colors — `base-400` gives 2.53:1 on white, `base-300` gives
 * 1.41:1, and AA asks 4.5 for small text. A step back to one of those reads as a harmless
 * palette edit, and axe only sees the four screens of the gate.
 *
 * The values are read out of the stylesheet rather than out of a copy here: a copy is the
 * thing that drifts.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// #endregion

/** Minimum contrast of small text, WCAG 2.1 AA (1.4.3). */
const AA_SMALL_TEXT = 4.5;

const VARIABLES_PATH = resolve(
    import.meta.dirname,
    '../../src/runtime/assets/scss/shared/_variables.scss'
);

const stylesheet = readFileSync(VARIABLES_PATH, 'utf8');

/**
 * Relative luminance of a hex color (WCAG formula).
 *
 * @param hex - Color in `#rgb` or `#rrggbb`.
 * @returns Relative luminance.
 */
function readLuminance(hex: string): number {
    const value = hex.replace('#', '');
    const full =
        value.length === 3
            ? value
                  .split('')
                  .map((char) => char + char)
                  .join('')
            : value;

    const channels = [0, 2, 4].map((offset) => {
        const channel = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;

        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Contrast ratio of two colors.
 *
 * @param foreground - Text color.
 * @param background - Background color.
 * @returns The ratio, from 1 to 21.
 */
function measureContrast(foreground: string, background: string): number {
    const first = readLuminance(foreground);
    const second = readLuminance(background);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);

    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Reads a custom property out of a scope of the stylesheet.
 *
 * @param scope - Selector the scope opens with (`:root`, `.bricks-dark`, `.bricks-canvas`).
 * @param property - Name of the custom property.
 * @returns The hex value.
 */
function readScopedValue(scope: string, property: string): string {
    const scopeStart = stylesheet.indexOf(`${scope} {`);
    expect(scopeStart, `scope ${scope} is missing`).toBeGreaterThan(-1);

    const declaration = new RegExp(`${property}:\\s*(#[0-9a-f]{3,6})`, 'i');
    const match = declaration.exec(stylesheet.slice(scopeStart));
    expect(match, `${property} is missing in ${scope}`).not.toBeNull();

    return (match as RegExpExecArray)[1];
}

describe('secondary text role: contrast against the surfaces it sits on', () => {
    it('the light theme clears AA on the white, the tinted and the card surface', () => {
        const muted = readScopedValue(':root', '--bricks-text-muted');

        for (const surface of ['--bricks-base-0', '--bricks-base-50', '--bricks-base-100']) {
            const background = readScopedValue(':root', surface);

            expect(
                measureContrast(muted, background),
                `${muted} on ${surface} (${background})`
            ).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
        }
    });

    it('the dark theme clears AA, the raised surface included', () => {
        const muted = readScopedValue('.bricks-dark', '--bricks-text-muted');

        for (const surface of [
            '--bricks-base-0',
            '--bricks-base-50',
            '--bricks-base-100',
            '--bricks-surface-raised',
        ]) {
            const background = readScopedValue('.bricks-dark', surface);

            expect(
                measureContrast(muted, background),
                `${muted} on ${surface} (${background})`
            ).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
        }
    });

    it('the canvas keeps the light value: the sheet stays light inside a dark shell', () => {
        const canvasMuted = readScopedValue('.bricks-canvas', '--bricks-text-muted');
        const canvasSurface = readScopedValue('.bricks-canvas', '--bricks-base-0');

        expect(canvasMuted).toBe(readScopedValue(':root', '--bricks-text-muted'));
        expect(measureContrast(canvasMuted, canvasSurface)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
    });
});
