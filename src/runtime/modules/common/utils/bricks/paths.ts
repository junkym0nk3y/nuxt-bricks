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

/**
 * Key of a brick file in the client manifest of the build.
 *
 * The manifest keys a module by its path relative to the Vite root, and the loader map
 * of the brick files (useBrickImports) keys it by the root-absolute path — the same
 * path with a leading slash. Both rely on `vite.root === srcDir`.
 *
 * @param brickPath - Path of the brick file as the loader map has it.
 * @returns The key of the file in the client manifest.
 */
export function toBrickManifestKey(brickPath: string): string {
    return normalizeBrickPath(brickPath).replace(/^\/+/, '');
}
