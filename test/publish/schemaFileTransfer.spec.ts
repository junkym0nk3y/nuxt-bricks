// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksComponent, IBricksSchema } from '../../src/runtime/modules/common/types/brick';
import type { ISchemaFileInput } from '../../src/runtime/modules/builder/publish/types/composables';
// #endregion

/**
 * Чтение JSON-файла схемы отдаёт исход возвращаемым значением, а не колбэком: у
 * панели деталей и модалки создания разные жизненные циклы — одна применяет
 * схему сразу, вторая держит файл до сабмита.
 */

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));
// #endregion

import { useSchemaFileTransfer } from '../../src/runtime/modules/builder/publish/composables/useSchemaFileTransfer';

/**
 * Собирает компонент схемы, проходящий структурный контракт графа.
 *
 * @param id - Идентификатор компонента.
 * @param type - Тип компонента.
 * @param componentName - Имя компонента.
 * @returns Компонент схемы.
 */
function buildComponent(
    id: string,
    type: 'layout' | 'component',
    componentName: string
): IBricksComponent {
    return {
        id,
        type,
        componentName,
        brickPath: `/components/${componentName}`,
        zIndex: 1,
        props: {},
        children: [],
    };
}

/**
 * Собирает файловый input с выбранным файлом.
 *
 * @param name - Имя файла.
 * @param content - Содержимое файла.
 * @returns Input в форме, которую читает композабл.
 */
function buildFileInput(name: string, content: string): ISchemaFileInput {
    return {
        files: [new File([content], name, { type: 'application/json' })],
        // Браузер держит здесь путь к выбранному файлу; композабл обязан его сбросить
        value: `C:\\fakepath\\${name}`,
    };
}

describe('чтение файла схемы: исход возвращается вызывающему', () => {
    it('валидный файл отдаёт схему, имя и число блоков', async () => {
        const { readSelectedFile } = useSchemaFileTransfer();
        const schema: IBricksSchema = {
            components: [
                buildComponent('grid-1', 'layout', 'grid'),
                buildComponent('text-1', 'component', 'BlockText'),
            ],
        };

        const result = await readSelectedFile(buildFileInput('promo.json', JSON.stringify(schema)));

        expect(result?.status).toBe('success');

        if (result?.status !== 'success') {
            return;
        }

        expect(result.file.schema).toEqual(schema);
        expect(result.file.filename).toBe('promo.json');
        // Число блоков показывает строка выбранного файла в модалке создания
        expect(result.file.blocksCount).toBe(2);
    });

    it('битый JSON отдаёт ошибку разбора, а не бросает', async () => {
        const { readSelectedFile } = useSchemaFileTransfer();

        const result = await readSelectedFile(buildFileInput('broken.json', '{ components: '));

        expect(result).toEqual({
            status: 'error',
            message: 'bricks.schema.importErrorParse',
        });
    });

    it('JSON без массива components отдаёт ошибку структуры', async () => {
        const { readSelectedFile } = useSchemaFileTransfer();

        const result = await readSelectedFile(
            buildFileInput('empty.json', JSON.stringify({ title: 'no schema' }))
        );

        expect(result).toEqual({
            status: 'error',
            message: 'bricks.schema.importErrorInvalid',
        });
    });

    it('файл не с расширением .json до чтения не доходит', async () => {
        const { readSelectedFile } = useSchemaFileTransfer();

        const result = await readSelectedFile(
            buildFileInput('schema.txt', JSON.stringify({ components: [] }))
        );

        expect(result).toEqual({
            status: 'error',
            message: 'bricks.schema.importErrorFileType',
        });
    });

    it('без выбранного файла исхода нет — диалог просто отменили', async () => {
        const { readSelectedFile } = useSchemaFileTransfer();

        const result = await readSelectedFile({ files: null, value: '' });

        expect(result).toBeNull();
    });

    it('input очищается на любом исходе — тот же файл можно выбрать повторно', async () => {
        const { readSelectedFile } = useSchemaFileTransfer();

        // Отклонённый импорт: без сброса значения повторный выбор того же файла
        // не поднял бы change, и кнопка выглядела бы неработающей
        const rejected = buildFileInput('broken.json', 'not json');
        await readSelectedFile(rejected);
        expect(rejected.value).toBe('');

        const accepted = buildFileInput('promo.json', JSON.stringify({ components: [] }));
        await readSelectedFile(accepted);
        expect(accepted.value).toBe('');
    });

    it('ошибки двух экземпляров не смешиваются: состояния у композабла нет', async () => {
        const details = useSchemaFileTransfer();
        const createModal = useSchemaFileTransfer();

        const brokenResult = await details.readSelectedFile(
            buildFileInput('broken.json', 'not json')
        );
        const validResult = await createModal.readSelectedFile(
            buildFileInput('promo.json', JSON.stringify({ components: [] }))
        );

        expect(brokenResult?.status).toBe('error');
        expect(validResult?.status).toBe('success');
    });
});
