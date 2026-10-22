// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksInputProps } from '../../src/runtime/modules/ui/inputs/types.d.ts';

// Vue
import { reactive } from 'vue';

// Composables
import { useBricksInput } from '../../src/runtime/modules/ui/inputs/composables/useBricksInput';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('vee-validate', () => ({
    validate: async () => ({ errors: [] as string[] }),
}));
// #endregion

// #region Helpers
/**
 * Поднимает композабл с дефолтами BricksInput, как это делает withDefaults.
 *
 * @param overrides - Пропсы, переопределяющие дефолты.
 */
function setup(overrides: Partial<IBricksInputProps> = {}) {
    const props = reactive<IBricksInputProps>({
        value: '',
        type: 'password',
        disabled: false,
        required: false,
        maxLength: 120,
        step: 1,
        clearable: false,
        revealable: true,
        errorMessage: null,
        ...overrides,
    });

    const emit = vi.fn();
    return { props, api: useBricksInput(props, emit) };
}
// #endregion

describe('BricksInput: кнопка показа пароля', () => {
    it('не показывается, пока поле пустое', () => {
        const { api } = setup();

        expect(api.showRevealButton.value).toBe(false);

        api.handleInput({ target: { value: 'secret' } } as unknown as Event);

        expect(api.showRevealButton.value).toBe(true);

        api.handleClear();

        expect(api.showRevealButton.value).toBe(false);
    });

    it('не показывается у выключенного поля — _disabled гасит pointer-events всему компоненту', () => {
        const { api } = setup({ value: 'secret', disabled: true });

        expect(api.showRevealButton.value).toBe(false);
    });

    it('не показывается при revealable=false', () => {
        const { api } = setup({ value: 'secret', revealable: false });

        expect(api.showRevealButton.value).toBe(false);
    });

    it('не показывается у полей других типов', () => {
        const { api } = setup({ value: 'secret', type: 'text' });

        expect(api.showRevealButton.value).toBe(false);
    });

    it('переключение раскрывает значение нативным type=text и возвращает обратно', () => {
        const { api } = setup({ value: 'secret' });

        expect(api.inputAttributes.value.type).toBe('password');

        api.togglePasswordVisibility();

        expect(api.isPasswordVisible.value).toBe(true);
        expect(api.inputAttributes.value.type).toBe('text');

        api.togglePasswordVisibility();

        expect(api.inputAttributes.value.type).toBe('password');
    });

    it('раскрытый пароль остаётся текстовым полем, но сохраняет ограничение длины', () => {
        const { api } = setup({ value: 'secret', maxLength: 1024 });

        api.togglePasswordVisibility();

        expect(api.inputAttributes.value.maxlength).toBe(1024);
        expect(api.inputAttributes.value.inputmode).toBe('text');
    });
});
