/**
 * The `Content-Disposition` a stored document is served with: `attachment`, under the
 * name the person uploaded it with rather than the `<uuid>.pdf` of its key.
 *
 * Two parameters, because one of them cannot carry the name on its own. `filename*`
 * (RFC 5987/6266) holds the name exactly — Cyrillic included — percent-encoded as
 * UTF-8, and every current browser reads it. `filename` is the ASCII fallback for a
 * client that does not: a raw non-ASCII byte in a header value is not allowed by HTTP,
 * and S3 refuses to sign such a header in the first place.
 */

// #region Constants
/** Control characters: a CR/LF in a header value would split the header */
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/**
 * What the quoted ASCII fallback cannot hold: anything outside printable ASCII, the
 * quote and the backslash that would end or escape the quoted string
 */
const NON_FALLBACK_CHARACTERS = /[^\u0020-\u007e]|["\\]/g;

/**
 * Characters `encodeURIComponent` leaves as they are while the `attr-char` of RFC 5987
 * does not allow them
 */
const NON_ATTR_CHARACTERS = /['()*]/g;

/** The name of a file whose own name is empty after the cleanup */
const DEFAULT_FILENAME = 'file';
// #endregion

/**
 * Builds the `attachment` disposition for a file name from the upload form.
 *
 * The name is untrusted: the path a browser may prepend is cut down to the last
 * segment, and control characters are removed before anything else.
 *
 * @param filename - The original file name.
 * @returns The header value, ASCII only.
 */
export function buildAttachmentContentDisposition(filename: string): string {
    const lastSegment = filename.replace(CONTROL_CHARACTERS, '').split(/[\\/]/).pop() ?? '';
    const name = lastSegment.trim() || DEFAULT_FILENAME;
    const fallback = name.replace(NON_FALLBACK_CHARACTERS, '_');
    const encoded = encodeURIComponent(name).replace(
        NON_ATTR_CHARACTERS,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );

    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
