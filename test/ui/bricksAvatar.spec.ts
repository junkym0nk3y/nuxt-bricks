/**
 * @vitest-environment happy-dom
 *
 * Аватар: запасной вариант — не заглушка, а полноценное состояние.
 *
 * Фото необязательно, а ссылка на него живёт в колонке учётки отдельно от файла в
 * хранилище: объект могли снести уборкой бакета. Без возврата к букве в углу
 * экрана остался бы пустой квадрат — и человек не отличил бы «фото нет» от
 * «интерфейс сломался».
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';
// #endregion

import BricksAvatar from '../../src/runtime/modules/ui/base/avatar/BricksAvatar.vue';

describe('BricksAvatar', () => {
    it('без ссылки показывает первую букву подписи', () => {
        const wrapper = mount(BricksAvatar, { props: { name: 'сергей' } });

        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.text()).toBe('СЕРГЕЙ'.slice(0, 1));
    });

    it('со ссылкой показывает фото', () => {
        const wrapper = mount(BricksAvatar, {
            props: { name: 'Сергей', imageUrl: 'https://cdn/avatar.webp' },
        });

        expect(wrapper.find('img').attributes('src')).toBe('https://cdn/avatar.webp');
    });

    it('недоступное фото возвращает букву', async () => {
        const wrapper = mount(BricksAvatar, {
            props: { name: 'Сергей', imageUrl: 'https://cdn/gone.webp' },
        });

        await wrapper.find('img').trigger('error');

        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.text()).toBe('С');
    });

    it('новая ссылка снимает прежний отказ: компонент живёт всю сессию', async () => {
        const wrapper = mount(BricksAvatar, {
            props: { name: 'Сергей', imageUrl: 'https://cdn/gone.webp' },
        });

        await wrapper.find('img').trigger('error');
        await wrapper.setProps({ imageUrl: 'https://cdn/fresh.webp' });

        expect(wrapper.find('img').attributes('src')).toBe('https://cdn/fresh.webp');
    });

    // Имя пишет человек, и первым символом бывает эмодзи или буква вне BMP:
    // индексация по code unit разрезала бы её на половину суррогатной пары
    it('составной первый символ не разрезается пополам', () => {
        const wrapper = mount(BricksAvatar, { props: { name: '𝒮ергей' } });

        expect(wrapper.text()).toBe('𝒮');
    });

    it('пустая подпись оставляет круг без буквы, а не с «undefined»', () => {
        const wrapper = mount(BricksAvatar, { props: { name: '   ' } });

        expect(wrapper.text()).toBe('');
    });
});
