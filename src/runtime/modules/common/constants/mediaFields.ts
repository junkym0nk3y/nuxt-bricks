/**
 * Length bounds of the editable fields of a media file — a single source for the server
 * validation of `PATCH /api/bricks/media/:id` and for the fields of the media panels.
 * The panels used to keep the default 120 of the kit field and flagged a name or an alt
 * text the server accepts.
 */
export const MEDIA_FILENAME_MAX_LENGTH = 255;
export const MEDIA_ALT_MAX_LENGTH = 512;
