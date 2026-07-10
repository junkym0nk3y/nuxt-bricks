// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Constants
import { BRICKS_SESSION_COOKIE_NAME } from '../src/runtime/modules/common/constants/auth';

// Utils
import { stripCookieByName } from '../src/runtime/modules/common/utils/cookieHeader';
// #endregion

describe('stripCookieByName', () => {
    it('вырезает пару по имени, сохраняя прочие в исходном порядке', () => {
        const header = `csrftoken=abc; ${BRICKS_SESSION_COOKIE_NAME}=secret-token; sessionid=xyz`;

        expect(stripCookieByName(header, BRICKS_SESSION_COOKIE_NAME)).toBe(
            'csrftoken=abc; sessionid=xyz'
        );
    });

    it('возвращает пустую строку, если вырезаемая cookie была единственной', () => {
        expect(stripCookieByName('bricks-session=secret', 'bricks-session')).toBe('');
    });

    it('не трогает cookie с именем-надстройкой и значением, содержащим имя', () => {
        const header = 'bricks-session-shadow=1; other=bricks-session; bricks-session=secret';

        expect(stripCookieByName(header, 'bricks-session')).toBe(
            'bricks-session-shadow=1; other=bricks-session'
        );
    });

    it('переживает пробелы вокруг пар и значения со знаком равенства', () => {
        const header = '  a=1 ;bricks-session=se=cret==;  b=2=2  ';

        expect(stripCookieByName(header, 'bricks-session')).toBe('a=1; b=2=2');
    });

    it('возвращает заголовок как есть (нормализованным), если имени нет', () => {
        expect(stripCookieByName('a=1; b=2', 'absent')).toBe('a=1; b=2');
    });

    it('вырезает все дубли одного имени', () => {
        const header = 'bricks-session=one; a=1; bricks-session=two';

        expect(stripCookieByName(header, 'bricks-session')).toBe('a=1');
    });
});
