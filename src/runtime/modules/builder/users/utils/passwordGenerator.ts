// #region Data
/**
 * Длина генерируемого пароля.
 *
 * Заметно больше серверного минимума (8) намеренно: минимум — граница того, что
 * примут от человека, а генератор ставит пароль, который человек не запоминает,
 * а копирует один раз, и экономить на его длине нечем.
 */
const GENERATED_PASSWORD_LENGTH = 20;

/**
 * Алфавит генератора: латиница, цифры и часть знаков — без визуально
 * неотличимых символов (`0`, `O`, `o`, `1`, `l`, `I`) и без кавычек, слешей и
 * пробела.
 *
 * Причина не в стойкости, а в передаче: сгенерированный пароль администратор
 * диктует или вставляет в чат, и `l` вместо `1` превращается в «пароль не
 * подходит» без объяснения. Кавычки и слеши выбиты, потому что ломают вставку в
 * командную строку и в JSON.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_.+@';
// #endregion

/**
 * Генерирует пароль для новой учётки и для сброса чужого пароля.
 *
 * Источник случайности — `crypto.getRandomValues`, а не `Math.random`: второй
 * предсказуем по нескольким выданным значениям, а здесь генерируется реальный
 * доступ в систему. Выбор символа идёт через отбраковку остатка (`rejection
 * sampling`): взятие остатка от деления без неё сделало бы первые символы
 * алфавита вероятнее прочих, потому что 256 на длину алфавита не делится.
 *
 * @returns Пароль длиной `GENERATED_PASSWORD_LENGTH`.
 */
export function generateUserPassword(): string {
    const alphabetLength = PASSWORD_ALPHABET.length;
    // Потолок принимаемых байтов: значения выше отбраковываются, иначе
    // распределение перекосилось бы в начало алфавита
    const acceptableCeiling = Math.floor(256 / alphabetLength) * alphabetLength;
    const password: string[] = [];

    while (password.length < GENERATED_PASSWORD_LENGTH) {
        const bytes = new Uint8Array(GENERATED_PASSWORD_LENGTH);
        globalThis.crypto.getRandomValues(bytes);

        for (const byte of bytes) {
            if (byte >= acceptableCeiling) {
                continue;
            }

            password.push(PASSWORD_ALPHABET[byte % alphabetLength]);

            if (password.length === GENERATED_PASSWORD_LENGTH) {
                break;
            }
        }
    }

    return password.join('');
}
