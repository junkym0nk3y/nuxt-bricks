/**
 * The maximum content width of Section is one rule for the canvas and the published page:
 * a section limiting its content on some device becomes a grid of one centered column on
 * every device, and a section that limits nothing stays the flex column it always was.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    hasSectionContentLimit,
    sectionLayoutStyle,
    toSectionMaxWidth,
} from '../../src/runtime/modules/layouts-blocks/utils/sectionContentWidth';
// #endregion

describe('toSectionMaxWidth', () => {
    it('turns a limit into rem, rounded the way every rem of the block is', () => {
        expect(toSectionMaxWidth(172)).toBe('172rem');
        expect(toSectionMaxWidth(120.46)).toBe('120.5rem');
    });

    it('treats zero, garbage and a width that rounds to zero as no limit', () => {
        // A column of `0rem` would leave the content no room at all
        for (const value of [0, 0.04, -10, 'wide', undefined, null]) {
            expect(toSectionMaxWidth(value), String(value)).toBe('100%');
        }
    });
});

describe('hasSectionContentLimit', () => {
    it('sees a limit on the base device and on any other one', () => {
        expect(hasSectionContentLimit({ maxWidth: 120 })).toBe(true);
        expect(
            hasSectionContentLimit({ maxWidth: 0, responsive: { tablet: { maxWidth: 80 } } })
        ).toBe(true);
    });

    it('sees none in a value that rounds to zero', () => {
        // Such a value draws a column of the full width, so a grid for it would limit
        // nothing and only take the flex behavior away from the children
        expect(hasSectionContentLimit({ maxWidth: 0.04 })).toBe(false);
        expect(
            hasSectionContentLimit({ maxWidth: 0, responsive: { tablet: { maxWidth: 0.04 } } })
        ).toBe(false);
    });

    it('sees none when every device leaves the width alone', () => {
        expect(hasSectionContentLimit({ maxWidth: 0 })).toBe(false);
        expect(
            hasSectionContentLimit({ maxWidth: 0, responsive: { mobile: { paddingX: 2 } } })
        ).toBe(false);
    });
});

describe('sectionLayoutStyle', () => {
    it('keeps the flex column of a section without a limit', () => {
        expect(sectionLayoutStyle(null)).toEqual({ display: 'flex', flexDirection: 'column' });
    });

    it('limits the content by a centered column measured against the section itself', () => {
        expect(sectionLayoutStyle('120rem')).toEqual({
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 120rem)',
            justifyContent: 'center',
            alignContent: 'start',
        });
    });
});
