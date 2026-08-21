/**
 * Separator of the joined tags value.
 *
 * The same one for the editor (`BricksTagsEditor` measures its limit and counter
 * by it) and for the form that stores tags as a string (a page's `keywords`):
 * should they drift apart, the counter would show one length while another one
 * travels to the server, and the refusal would arrive only after the save.
 */
export const TAGS_SEPARATOR = ', ';

/**
 * Length of the string the tags will be joined into.
 *
 * @param tags - Tag list.
 * @returns Character count of the joined value.
 */
export function getTagsSerializedLength(tags: string[]): number {
    return tags.join(TAGS_SEPARATOR).length;
}
