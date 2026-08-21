/**
 * Normalizes the path of a brick file, bringing the slashes to the POSIX form.
 *
 * @param path - Source path (may contain Windows separators).
 * @returns The path with forward slashes, or an empty string when the input is invalid.
 */
export function normalizeBrickPath(path: string | null | undefined): string {
    if (!path) {
        return '';
    }

    return path.replace(/\\/g, '/');
}
