const BYTES_IN_KB = 1024;
const BYTES_IN_MB = 1024 * 1024;

/**
 * Formats a file size into a human-readable form (B / KB / MB).
 */
export function formatFileSize(bytes: number): string {
    if (bytes < BYTES_IN_KB) {
        return `${bytes} B`;
    }

    if (bytes < BYTES_IN_MB) {
        return `${(bytes / BYTES_IN_KB).toFixed(1)} KB`;
    }

    return `${(bytes / BYTES_IN_MB).toFixed(1)} MB`;
}
