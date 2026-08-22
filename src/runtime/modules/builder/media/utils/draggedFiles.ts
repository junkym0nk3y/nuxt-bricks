/**
 * Parsing of what a drag carries, for the drop target of the gallery.
 *
 * Kept out of the component to stay testable: on `dragenter` the browser does not
 * hand over the files themselves (`dataTransfer.files` is empty until `drop`), only
 * the list of `items` and their kind. So "how many files are being dragged" is the
 * one thing that can be known in advance, and it has to be counted exactly one way.
 */

/**
 * How many files a drag carries.
 *
 * Only the entries with `kind === 'file'` count: selected text and a dragged link
 * arrive in `items` too, but `drop` does not accept them.
 *
 * @param dataTransfer - Data of the drag event.
 * @returns The number of dragged files; 0 when there are none.
 */
export function countDraggedFiles(dataTransfer: DataTransfer | null): number {
    if (!dataTransfer) {
        return 0;
    }

    return Array.from(dataTransfer.items).filter((item) => item.kind === 'file').length;
}
