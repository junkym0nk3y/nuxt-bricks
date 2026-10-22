/**
 * Утилиты раздела учёток: подпись строки, даты и генератор пароля.
 *
 * Что здесь сторожится:
 *
 * 1. «Сегодня» и «вчера» считаются по КАЛЕНДАРЮ, а не разностью в сутки: вход в
 *    23:50 не должен называться сегодняшним на следующее утро.
 * 2. Отсутствие входа отличается от выдуманного дня: и `null`, и битое значение
 *    дают `null` — строка показывает «ни разу не входил», а не сегодняшнюю дату.
 * 3. Генератор берёт случайность из Web Crypto, а не из `Math.random`: он
 *    выдаёт реальный доступ в систему, а второй предсказуем по нескольким
 *    выданным значениям.
 */

// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksUserSummary } from '../../src/runtime/modules/common/types/auth';
// #endregion

import {
    formatUserLoginDate,
    resolveUserLabel,
} from '../../src/runtime/modules/builder/users/utils/userFormatting';
import { generateUserPassword } from '../../src/runtime/modules/builder/users/utils/passwordGenerator';

/** Подписи относительных дней — в приложении приходят из переводов. */
const DAY_LABELS = { today: 'сегодня', yesterday: 'вчера' };

/**
 * Учётка с переопределяемыми полями.
 *
 * @param overrides - Поля, отличающиеся от дефолтных.
 * @returns Учётка.
 */
function makeUser(overrides: Partial<IBricksUserSummary> = {}): IBricksUserSummary {
    return {
        id: 1,
        username: 'anna.editor',
        role: 'editor',
        isActive: true,
        displayName: null,
        avatarUrl: null,
        createdAt: '2026-04-02T10:00:00.000Z',
        lastLoginAt: null,
        ...overrides,
    };
}

describe('resolveUserLabel: подпись учётки', () => {
    it('отображаемое имя важнее логина', () => {
        expect(resolveUserLabel(makeUser({ displayName: 'Анна Ким' }))).toBe('Анна Ким');
    });

    it('имя из пробелов равно его отсутствию', () => {
        expect(resolveUserLabel(makeUser({ displayName: '   ' }))).toBe('anna.editor');
    });
});

describe('formatUserLoginDate: последний вход', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([null, undefined, 'не дата'])('значение %s не даёт дня: возвращается null', (value) => {
        expect(formatUserLoginDate(value, DAY_LABELS)).toBeNull();
    });

    it('сегодняшний вход показывается временем', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 18, 14, 0, 0));

        expect(formatUserLoginDate(new Date(2026, 7, 18, 9, 24, 0).toISOString(), DAY_LABELS)).toBe(
            'сегодня, 09:24'
        );
    });

    // Календарная граница: вход в 23:50 и «сейчас» 00:10 разделены двадцатью
    // минутами, но это разные дни — и человек ищет глазами именно «вчера»
    it('вход поздним вечером назавтра называется вчерашним', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 18, 0, 10, 0));

        expect(
            formatUserLoginDate(new Date(2026, 7, 17, 23, 50, 0).toISOString(), DAY_LABELS)
        ).toBe('вчера, 23:50');
    });

    // Дата без времени приходит из общего форматтера панели: замена его формата
    // обязана доехать и сюда — второй копии DD.MM.YYYY у раздела учёток нет
    it('вход старше двух дней показывается датой без времени', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 18, 14, 0, 0));

        expect(formatUserLoginDate(new Date(2026, 7, 7, 18, 40, 0).toISOString(), DAY_LABELS)).toBe(
            '07.08.2026'
        );
    });

    // Часы сервера могут уйти вперёд относительно браузера: дата из будущего
    // безобиднее как «сегодня», чем как день, которого ещё не было
    it('дата из будущего считается сегодняшней', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 18, 14, 0, 0));

        expect(formatUserLoginDate(new Date(2026, 7, 19, 10, 5, 0).toISOString(), DAY_LABELS)).toBe(
            'сегодня, 10:05'
        );
    });
});

describe('generateUserPassword: генератор пароля', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('берёт случайность из Web Crypto', () => {
        const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues');

        generateUserPassword();

        expect(getRandomValues).toHaveBeenCalled();
    });

    it('длина заметно выше серверного минимума, символы — из безопасного алфавита', () => {
        const password = generateUserPassword();

        expect(password.length).toBeGreaterThanOrEqual(16);
        expect(password).toMatch(/^[A-Za-z0-9\-_.+@]+$/);
        // Визуально неотличимые символы выбиты: сгенерированный пароль диктуют и
        // вставляют, и `l` вместо `1` превращается в «пароль не подходит»
        expect(password).not.toMatch(/[0O1lIo]/);
    });

    it('два вызова не совпадают', () => {
        expect(generateUserPassword()).not.toBe(generateUserPassword());
    });
});
