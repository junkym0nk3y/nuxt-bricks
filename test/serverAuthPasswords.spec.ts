// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    hashPassword,
    verifyPassword,
    DUMMY_PASSWORD_HASH,
} from '../src/runtime/server/utils/auth/passwords';
// #endregion

describe('passwords: scrypt hash/verify', () => {
    it('roundtrip: hash → verify тем же паролем', async () => {
        const hash = await hashPassword('secret123');

        expect(hash.startsWith('scrypt:16384:8:1:')).toBe(true);
        await expect(verifyPassword('secret123', hash)).resolves.toBe(true);
    });

    it('отклоняет неверный пароль', async () => {
        const hash = await hashPassword('secret123');

        await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
    });

    it('две соли дают разные хеши одного пароля', async () => {
        const first = await hashPassword('secret123');
        const second = await hashPassword('secret123');

        expect(first).not.toBe(second);
    });

    it('malformed-хеш → false без исключения', async () => {
        await expect(verifyPassword('secret123', '')).resolves.toBe(false);
        await expect(verifyPassword('secret123', 'not-a-hash')).resolves.toBe(false);
        await expect(verifyPassword('secret123', 'bcrypt:10:salt:hash')).resolves.toBe(false);
        await expect(verifyPassword('secret123', 'scrypt:x:8:1:c2FsdA==:aGFzaA==')).resolves.toBe(
            false
        );
        // N не степень двойки — scrypt кидает, verify глотает
        await expect(
            verifyPassword('secret123', 'scrypt:12345:8:1:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);
    });

    it('DUMMY_PASSWORD_HASH — валидный формат, не матчится произвольным паролем', async () => {
        await expect(verifyPassword('secret123', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
    });

    it('verify парсит параметры из строки (совместим с хешем CLI)', async () => {
        // Хеш, сгенерированный src/cli/bricks-hash-password.mjs для пароля secret123
        const cliHash =
            'scrypt:16384:8:1:soguTg8BLm2sIG6oKSf4Sw==:mF2cEexZ1CHEvQe/cd6uDXIilNQAB+nn4jp1psoJAHrBZXeDBiNc3L7IYx7iG5qcIE2hjDh6LGjsxoww/HIa0A==';

        await expect(verifyPassword('secret123', cliHash)).resolves.toBe(true);
        await expect(verifyPassword('wrong', cliHash)).resolves.toBe(false);
    });
});
