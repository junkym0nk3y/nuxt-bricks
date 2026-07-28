// #region Imports
// Node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Pathe
import { join } from 'pathe';

// TypeScript
import ts from 'typescript';
// #endregion

// #region Data
const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));
// #endregion

// #region Methods
/**
 * Имена типов, объявленных в модуле.
 *
 * Экспорт роли не играет: локальное объявление нельзя переиспользовать, не
 * переписав его рядом, а две копии расходятся молча — поэтому в `types/` уходят
 * и «нужные только здесь» типы.
 *
 * Разбор идёт по AST, а не по тексту: `export declare interface`,
 * `export default interface` и перенос строки между `export` и `interface` —
 * легальный TS, который любой шаблон по строкам пропускает, а объявление внутри
 * комментария или шаблонной строки, наоборот, ловит ложно.
 * Ре-экспорт (`export type { IFoo }`) — `ExportDeclaration`, а не объявление,
 * поэтому под правило не попадает.
 *
 * @param filePath - Абсолютный путь модуля.
 * @returns Имена объявленных интерфейсов и type-алиасов.
 */
function findDeclaredTypeNames(filePath: string): string[] {
    const source = ts.createSourceFile(
        filePath,
        readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        false
    );

    return source.statements
        .filter(
            (statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
                ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
        )
        .map((statement) => statement.name.text);
}
// #endregion

describe('типы build-time слоя живут в src/types', () => {
    it('модули src/*.ts не объявляют типов', () => {
        const buildTimeModules = readdirSync(SRC_DIR, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
            .map((entry) => entry.name);

        // Страховка от переезда файлов: пустой список сделал бы кейс бессмысленным
        expect(buildTimeModules).toContain('module.ts');

        const offenders = buildTimeModules.flatMap((name) =>
            findDeclaredTypeNames(join(SRC_DIR, name)).map((typeName) => `${name}: ${typeName}`)
        );

        expect(offenders).toEqual([]);
    });
});
