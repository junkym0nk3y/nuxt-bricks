// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    hashPassword,
    needsPasswordRehash,
    verifyPassword,
    DUMMY_PASSWORD_HASH,
} from '../../src/runtime/server/utils/auth/passwords';
// #endregion

describe('passwords: scrypt hash/verify', () => {
    it('roundtrip: hash → verify тем же паролем', async () => {
        const hash = await hashPassword('secret123');

        expect(hash.startsWith('scrypt:16384:8:5:')).toBe(true);
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

    // The OWASP parameters are taken in the shape that keeps the memory of one
    // derivation at 16 MiB: `p` multiplies the time, not the table. The `N=2^17, p=1`
    // variant of the same strength asks for 128 MiB — a quarter of a gigabyte on
    // logins alone at two derivations at once
    it('дефолт пишет параметры минимума OWASP', async () => {
        const hash = await hashPassword('secret123');
        const [, n, r, p] = hash.split(':');

        expect([Number(n), Number(r), Number(p)]).toEqual([16384, 8, 5]);
        // 128 * r * (N + 2) + 128 * r * p is what OpenSSL asks for: it has to fit
        // into the 32 MiB ceiling, or scrypt would have refused this very call
        expect(128 * 8 * (16384 + 2) + 128 * 8 * 5).toBeLessThan(32 * 1024 * 1024);
    });

    it('verify принимает хеш прежних параметров: сброса паролей не требуется', async () => {
        // The hash of secret123 written by the previous default of the package (p=1)
        const legacyHash =
            'scrypt:16384:8:1:soguTg8BLm2sIG6oKSf4Sw==:mF2cEexZ1CHEvQe/cd6uDXIilNQAB+nn4jp1psoJAHrBZXeDBiNc3L7IYx7iG5qcIE2hjDh6LGjsxoww/HIa0A==';

        await expect(verifyPassword('secret123', legacyHash)).resolves.toBe(true);
    });

    it('отвергает строку с мусором в параметрах, а не читает из неё число', async () => {
        // `parseInt` would read `16384junk` as 16384: a hash whose parameters are not
        // what they look like must not reach the derivation at all
        await expect(
            verifyPassword('secret123', 'scrypt:16384junk:8:5:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);
        await expect(verifyPassword('secret123', 'scrypt:0:8:5:c2FsdA==:aGFzaA==')).resolves.toBe(
            false
        );
        await expect(
            verifyPassword('secret123', 'scrypt: 16384:8:5:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);
    });

    // The memory ceiling is passed explicitly although it repeats the default of
    // node: the parameters of the derivation are chosen by the string from the store,
    // and the ceiling is what stands between a hostile row and an allocation of any
    // size
    it('строка, просящая памяти выше потолка, отвергается без исключения', async () => {
        // N=2^20 at r=8 asks for a gigabyte
        await expect(
            verifyPassword('secret123', 'scrypt:1048576:8:1:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);
    });

    describe('needsPasswordRehash: решение обновлять хеш', () => {
        it('обновляет прежний дефолт: та же память, впятеро меньше работы', () => {
            expect(needsPasswordRehash('scrypt:16384:8:1:c2FsdA==:aGFzaA==')).toBe(true);
        });

        it('не обновляет хеш нынешних параметров', async () => {
            expect(needsPasswordRehash(await hashPassword('secret123'))).toBe(false);
            expect(needsPasswordRehash(DUMMY_PASSWORD_HASH)).toBe(false);
        });

        // A rule of "any difference of parameters" would weaken such a row down to the
        // current profile while looking like maintenance
        it('не понижает хеш, посчитанный более дорогими параметрами', () => {
            expect(needsPasswordRehash('scrypt:131072:8:1:c2FsdA==:aGFzaA==')).toBe(false);
            expect(needsPasswordRehash('scrypt:16384:8:9:c2FsdA==:aGFzaA==')).toBe(false);
        });

        it('на нечитаемой строке отвечает «нет», а не кидает', () => {
            expect(needsPasswordRehash('')).toBe(false);
            expect(needsPasswordRehash('not-a-hash')).toBe(false);
        });
    });

    it('verify парсит параметры из строки (совместим с хешем CLI)', async () => {
        // Хеш пароля secret123, посчитанный сторонним прогоном scrypt с теми же
        // параметрами: verify обязан принимать чужую строку своего формата
        const cliHash =
            'scrypt:16384:8:1:soguTg8BLm2sIG6oKSf4Sw==:mF2cEexZ1CHEvQe/cd6uDXIilNQAB+nn4jp1psoJAHrBZXeDBiNc3L7IYx7iG5qcIE2hjDh6LGjsxoww/HIa0A==';

        await expect(verifyPassword('secret123', cliHash)).resolves.toBe(true);
        await expect(verifyPassword('wrong', cliHash)).resolves.toBe(false);
    });
});
