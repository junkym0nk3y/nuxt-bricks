/**
 * The documents the media library accepts — one table for the upload endpoint, the
 * gallery and the property editors.
 *
 * Macro-enabled formats (`docm`, `xlsm`) are left out on purpose: a landing hands its
 * files to anonymous visitors, and a document that runs code on opening is not
 * something a page should give away. The server refuses an embedded VBA project under an
 * innocent extension as well — see `sniffDocumentFormat`; Excel 4.0 macro sheets of an
 * XLS and a template fetched over an external link are not looked for.
 */

// Types
import type { IMediaGalleryPickFilter, TMediaDocumentExtension } from '../types/media';

/** Canonical MIME type of every accepted document, by its extension */
export const MEDIA_DOCUMENT_MIME_TYPES: Readonly<Record<TMediaDocumentExtension, string>> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Extensions of the accepted documents, for the `accept` of the upload input */
const MEDIA_DOCUMENT_EXTENSIONS = Object.keys(
    MEDIA_DOCUMENT_MIME_TYPES
) as TMediaDocumentExtension[];

/**
 * The `accept` of the upload input. A document is listed by its extension as well as by
 * its MIME: on a machine without an office suite the system knows no MIME for
 * `.doc`/`.xls`, and a list of MIME types alone would grey those files out in the dialog.
 */
export const MEDIA_UPLOAD_ACCEPT = [
    'image/*',
    'video/*',
    ...MEDIA_DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`),
    ...Object.values(MEDIA_DOCUMENT_MIME_TYPES),
].join(',');

/** Icon of a document tile, by its extension */
export const MEDIA_DOCUMENT_ICONS: Readonly<Record<TMediaDocumentExtension, string>> = {
    pdf: 'ta:outline-file-type-pdf',
    doc: 'ta:outline-file-type-doc',
    docx: 'ta:outline-file-type-docx',
    xls: 'ta:outline-file-type-xls',
    xlsx: 'ta:outline-file-spreadsheet',
};

/**
 * What a picker of a picture or a video offers: every surface that picked from the
 * library before documents existed (an image or a video property, a picture inserted
 * into text, the social image of a page). A document there would end up in an `<img>`.
 */
export const MEDIA_PICK_FILTER_VISUAL: Readonly<IMediaGalleryPickFilter> = {
    kinds: ['image', 'video'],
};

/** What a picker of a downloadable file offers by default: documents */
export const MEDIA_PICK_FILTER_DOCUMENTS: Readonly<IMediaGalleryPickFilter> = {
    kinds: ['document'],
};

/** Every file of the library — a link in text may point at any of them */
export const MEDIA_PICK_FILTER_ANY: Readonly<IMediaGalleryPickFilter> = {
    kinds: ['image', 'video', 'document'],
};
