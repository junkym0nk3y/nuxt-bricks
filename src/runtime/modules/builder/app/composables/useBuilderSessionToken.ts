// #region Imports
// Types
import type { IBuilderSessionToken } from '../types/composables';

// Vue
import { computed, ref } from 'vue';
// #endregion

/**
 * Токен сессии билдера — общая точка отсечения для операций, которые начинаются в
 * одной сессии, а завершаются в другой. Операция снимает токен на старте
 * (`capture`) и сверяет его (`isCurrent`) перед тем, как применить результат или
 * побочный эффект; `invalidate` гасит все начатые операции разом.
 *
 * Владелец инкрементов один — `useBuilderSession` (вход в открытие сессии и
 * `onScopeDispose` экземпляра). Остальные потребители получают токен из
 * composition root'а и только читают, поэтому счётчик на страницу ровно один.
 *
 * Токен намеренно локален экземпляру страницы, а не глобален: незавершённая
 * операция переживает unmount (сторы живут на уровне приложения), и гасит её
 * именно инкремент на dispose — новый экземпляр начинает со своим счётчиком, а
 * операции покойного остаются отсечёнными по своему (BM-24, BM-26).
 */
export function useBuilderSessionToken(): IBuilderSessionToken {
    const token = ref(0);

    return {
        token: computed(() => token.value),

        /**
         * Снимает токен на старте операции.
         *
         * @returns Значение токена, с которым операция началась.
         */
        capture(): number {
            return token.value;
        },

        /**
         * Проверяет, что сессия, в которой операция началась, всё ещё актуальна.
         *
         * @param captured - Токен, снятый на старте операции.
         * @returns Можно ли применять результат и побочные эффекты.
         */
        isCurrent(captured: number): boolean {
            return captured === token.value;
        },

        /**
         * Гасит все начатые операции: их `isCurrent` с этого момента ложен.
         */
        invalidate(): void {
            token.value += 1;
        },
    };
}
