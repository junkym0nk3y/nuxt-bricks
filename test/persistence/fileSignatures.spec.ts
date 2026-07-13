// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    looksLikeSvgMarkup,
    sniffImageFormat,
    sniffVideoFormat,
} from '../../src/runtime/modules/persistence/server/utils/fileSignatures';
// #endregion

/**
 * Собирает буфер ISO-BMFF заголовка с указанным major brand.
 */
function buildFtypBuffer(brand: string): Buffer {
    return Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftyp', 'latin1'),
        Buffer.from(brand.padEnd(4, ' '), 'latin1'),
        Buffer.alloc(8),
    ]);
}

describe('fileSignatures: сниффинг форматов по magic bytes', () => {
    it('распознаёт растровые форматы изображений', () => {
        expect(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpeg');
        expect(
            sniffImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
        ).toBe('png');
        expect(sniffImageFormat(Buffer.from('GIF89a....', 'latin1'))).toBe('gif');
        expect(
            sniffImageFormat(
                Buffer.concat([
                    Buffer.from('RIFF', 'latin1'),
                    Buffer.alloc(4),
                    Buffer.from('WEBPVP8 ', 'latin1'),
                ])
            )
        ).toBe('webp');
        expect(sniffImageFormat(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08]))).toBe('tiff');
        expect(sniffImageFormat(Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00]))).toBe('tiff');
        expect(sniffImageFormat(Buffer.from('BM6600', 'latin1'))).toBe('bmp');
        expect(sniffImageFormat(buildFtypBuffer('heic'))).toBe('heif');
        expect(sniffImageFormat(buildFtypBuffer('avif'))).toBe('heif');
    });

    it('распознаёт SVG с прологом, DOCTYPE, комментариями и BOM', () => {
        expect(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
            'svg'
        );
        expect(
            sniffImageFormat(
                Buffer.from(
                    '﻿<?xml version="1.0"?>\n<!-- comment -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 1 1"></svg>'
                )
            )
        ).toBe('svg');
    });

    it('отвергает не-изображения', () => {
        expect(sniffImageFormat(Buffer.from('<html><body>hi</body></html>'))).toBeNull();
        expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
        expect(sniffImageFormat(Buffer.from('#!/bin/sh\nrm -rf /'))).toBeNull();
        expect(sniffImageFormat(buildFtypBuffer('isom'))).toBeNull();
    });

    it('looksLikeSvgMarkup требует границу после <svg', () => {
        expect(looksLikeSvgMarkup('<svg>')).toBe(true);
        expect(looksLikeSvgMarkup('<svg />')).toBe(true);
        expect(looksLikeSvgMarkup('<svgfoo>')).toBe(false);
        expect(looksLikeSvgMarkup('svg')).toBe(false);
    });

    it('распознаёт видео-контейнеры', () => {
        expect(sniffVideoFormat(buildFtypBuffer('isom'))).toBe('mp4');
        expect(sniffVideoFormat(buildFtypBuffer('qt'))).toBe('mp4');
        expect(sniffVideoFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]))).toBe('webm');
        expect(sniffVideoFormat(Buffer.from('OggS....', 'latin1'))).toBe('ogg');
        expect(
            sniffVideoFormat(
                Buffer.concat([
                    Buffer.from('RIFF', 'latin1'),
                    Buffer.alloc(4),
                    Buffer.from('AVI LIST', 'latin1'),
                ])
            )
        ).toBe('avi');
    });

    it('не принимает изображения и мусор за видео', () => {
        // HEIC/AVIF — ISO-BMFF с image-брендом, а не видео
        expect(sniffVideoFormat(buildFtypBuffer('heic'))).toBeNull();
        expect(sniffVideoFormat(buildFtypBuffer('avif'))).toBeNull();
        expect(
            sniffVideoFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ).toBeNull();
        expect(sniffVideoFormat(Buffer.from('<html></html>'))).toBeNull();
        expect(sniffVideoFormat(Buffer.alloc(0))).toBeNull();
    });
});
