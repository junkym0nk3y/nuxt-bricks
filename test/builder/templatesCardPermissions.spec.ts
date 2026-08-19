/**
 * @vitest-environment happy-dom
 *
 * Права роли на карточке шаблона.
 *
 * Матрица прав здесь та же, что у страницы: создание — редактору и выше,
 * удаление — администратору, чтение — всем. Проверяется в интерфейсе, а не только
 * на сервере: карточка, показавшая наблюдателю «Создать страницу», вела бы его к
 * отказу ручки, а кнопка удаления у редактора — к 403 после подтверждения.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed } from 'vue';

// Test utils
import { mount } from '@vue/test-utils';

// Types
import type { TBricksTemplateSummary } from '../../src/runtime/modules/common/types/templates';
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';
// #endregion

// #region Mocks
const { permissions } = vi.hoisted(() => ({
    permissions: { role: 'admin' as TBricksUserRole },
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({
        canEdit: computed(() => permissions.role !== 'viewer'),
        canDelete: computed(() => permissions.role === 'admin'),
    }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key} ${JSON.stringify(params)}` : key,
    }),
}));
// #endregion

import BuilderTemplatesCard from '../../src/runtime/modules/builder/templates/components/BuilderTemplatesCard.vue';

// #region Fixtures
/** Сводка шаблона со снимком. */
const TEMPLATE: TBricksTemplateSummary = {
    id: 3,
    name: 'Лендинг продукта',
    description: 'Герой, тарифы и форма',
    thumbnailUrl: 'https://bucket.example/template-uuid.webp',
    blocksCount: 12,
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T10:00:00.000Z',
};

/**
 * Монтирует карточку под заданной ролью.
 *
 * @param role - Роль сессии.
 * @returns Обёртка теста.
 */
function mountCard(role: TBricksUserRole) {
    permissions.role = role;

    return mount(BuilderTemplatesCard, { props: { template: TEMPLATE } });
}
// #endregion

describe('BuilderTemplatesCard: права роли', () => {
    beforeEach(() => {
        permissions.role = 'admin';
    });

    it('администратору доступны просмотр, правка подписи и удаление', () => {
        const wrapper = mountCard('admin');
        const labels = wrapper.findAll('button').map((button) => button.attributes('aria-label'));

        expect(labels).toContain('bricks.templates.card.preview');
        expect(labels).toContain('bricks.templates.card.rename');
        expect(labels).toContain('bricks.templates.card.delete');
    });

    it('у редактора нет удаления, но есть создание страницы', () => {
        const wrapper = mountCard('editor');
        const labels = wrapper.findAll('button').map((button) => button.attributes('aria-label'));

        expect(labels).toContain('bricks.templates.card.rename');
        expect(labels).not.toContain('bricks.templates.card.delete');
        expect(wrapper.text()).toContain('bricks.templates.card.createPage');
    });

    it('наблюдателю остаётся только просмотр снимка', () => {
        const wrapper = mountCard('viewer');
        const labels = wrapper.findAll('button').map((button) => button.attributes('aria-label'));

        expect(labels).toContain('bricks.templates.card.preview');
        expect(labels).not.toContain('bricks.templates.card.rename');
        expect(labels).not.toContain('bricks.templates.card.delete');
        expect(wrapper.text()).not.toContain('bricks.templates.card.createPage');
    });

    it('клик по карточке наблюдателя открывает снимок, а не создание страницы', async () => {
        // Кнопки создания у него нет вовсе, и клик по карточке обязан вести туда,
        // куда ему можно, — иначе действие молча ничего не делает
        const wrapper = mountCard('viewer');

        await wrapper.find('article').trigger('click');

        expect(wrapper.emitted('preview-thumbnail')).toHaveLength(1);
        expect(wrapper.emitted('create-page')).toBeUndefined();
    });

    it('клик по карточке редактора ведёт к созданию страницы', async () => {
        const wrapper = mountCard('editor');

        await wrapper.find('article').trigger('click');

        expect(wrapper.emitted('create-page')).toHaveLength(1);
    });

    it('занятая карточка (идёт операция) действий не выполняет', async () => {
        const wrapper = mount(BuilderTemplatesCard, {
            props: { template: TEMPLATE, isPending: true },
        });

        await wrapper.find('article').trigger('click');

        expect(wrapper.emitted('create-page')).toBeUndefined();
    });
});
