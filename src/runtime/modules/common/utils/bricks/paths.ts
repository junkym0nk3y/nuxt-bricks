/**
 * Нормализует путь к brick-файлу, приводя слэши к POSIX-формату.
 *
 * @param path - Исходный путь (может содержать символы Windows).
 * @returns Путь с прямыми слэшами или пустая строка, если вход невалидный.
 */
export function normalizeBrickPath(path: string | null | undefined): string {
    if (!path) {
        return '';
    }

    return path.replace(/\\/g, '/');
}
