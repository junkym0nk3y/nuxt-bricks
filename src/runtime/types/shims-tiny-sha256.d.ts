declare module 'tiny-sha256' {
    /**
     * Вычисляет sha256-хэш строки и возвращает hex-представление.
     */
    const sha256: (input: string) => string;
    export default sha256;
}
