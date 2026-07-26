// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    parseGridTracks,
    resolveGridTrackIndex,
    resolveUniformTrackIndex,
} from '../../src/runtime/modules/layouts-blocks/utils/gridDropPlacement';

describe('grid drop placement', () => {
    describe('parseGridTracks', () => {
        it('разбирает computed-значение треков в размеры', () => {
            expect(parseGridTracks('120px 240px 60px')).toEqual([120, 240, 60]);
        });

        it('отдаёт пустой список для none и пустой строки', () => {
            expect(parseGridTracks('none')).toEqual([]);
            expect(parseGridTracks('')).toEqual([]);
            expect(parseGridTracks(undefined)).toEqual([]);
        });
    });

    describe('resolveGridTrackIndex', () => {
        const TRACKS = [100, 300, 50];
        const GAP = 10;

        it('находит трек по фактическому размеру, а не по равным полосам', () => {
            // Равномерное деление (450 + gap) / 3 отправило бы 200px во второй трек,
            // хотя фактически это середина большого второго трека.
            expect(resolveGridTrackIndex(50, TRACKS, GAP)).toBe(0);
            expect(resolveGridTrackIndex(200, TRACKS, GAP)).toBe(1);
            expect(resolveGridTrackIndex(430, TRACKS, GAP)).toBe(2);
        });

        it('относит зазор к треку перед ним', () => {
            expect(resolveGridTrackIndex(105, TRACKS, GAP)).toBe(0);
            expect(resolveGridTrackIndex(110, TRACKS, GAP)).toBe(1);
        });

        it('прижимает точки за пределами к крайним трекам', () => {
            expect(resolveGridTrackIndex(-40, TRACKS, GAP)).toBe(0);
            expect(resolveGridTrackIndex(10_000, TRACKS, GAP)).toBe(2);
        });

        it('без треков отдаёт первый индекс', () => {
            expect(resolveGridTrackIndex(120, [], GAP)).toBe(0);
        });
    });

    describe('resolveUniformTrackIndex', () => {
        it('делит область на равные треки, когда фактических размеров нет', () => {
            // Пустой грид: треки 0px, но контейнер растянут своим min-height.
            expect(resolveUniformTrackIndex(10, 2, 200, 0)).toBe(0);
            expect(resolveUniformTrackIndex(150, 2, 200, 0)).toBe(1);
        });

        it('относит зазор к треку перед ним — как и расчёт по фактическим трекам', () => {
            // Треки по 90px: [0..90], зазор [90..110], второй трек [110..200].
            expect(resolveUniformTrackIndex(95, 2, 200, 20)).toBe(0);
            expect(resolveUniformTrackIndex(105, 2, 200, 20)).toBe(0);
            expect(resolveUniformTrackIndex(115, 2, 200, 20)).toBe(1);
        });

        it('для одного трека всегда отдаёт нулевой индекс', () => {
            expect(resolveUniformTrackIndex(500, 1, 200, 0)).toBe(0);
        });

        it('не выходит за пределы при нулевом размере области', () => {
            expect(resolveUniformTrackIndex(80, 3, 0, 0)).toBe(0);
        });
    });
});
