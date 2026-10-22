// #region Imports
// Node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Pathe
import { join, relative } from 'pathe';

// TypeScript
import ts from 'typescript';
// #endregion

// #region Data
const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));
const RUNTIME_MODULES_DIR = join(SRC_DIR, 'runtime/modules');
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
 * Обход рекурсивный: объявление в теле функции нарушает правило так же, как
 * top-level, и было бы способом обойти проверку, а не законным исключением.
 *
 * @param filePath - Абсолютный путь модуля.
 * @returns Имена объявленных интерфейсов и type-алиасов.
 */
function findDeclaredTypeNames(filePath: string): string[] {
    return collectDeclaredTypeNames(
        ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, false)
    );
}

/**
 * The names of the type declarations of a parsed source.
 *
 * Only an `InterfaceDeclaration` and a `TypeAliasDeclaration` are caught. The object
 * literal inside `defineProps<{…}>` is a `TypeLiteralNode` rather than a declaration:
 * a ban on that would be a different, stricter rule, and today it would catch
 * legitimate places in `ui`.
 *
 * @param source - The parsed file.
 * @returns The names of the interfaces and type aliases declared.
 */
function collectDeclaredTypeNames(source: ts.SourceFile): string[] {
    const typeNames: string[] = [];

    /**
     * Собирает имена объявлений типов из узла и его поддерева.
     *
     * @param node - Узел AST.
     */
    function collectFrom(node: ts.Node): void {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
            typeNames.push(node.name.text);
        }

        ts.forEachChild(node, collectFrom);
    }

    ts.forEachChild(source, collectFrom);

    return typeNames;
}

/**
 * Пути implementation-модулей композаблов во всех рантайм-доменах.
 *
 * Файлы типов из выборки исключены: правило разрешает и `*.d.ts`, и `types.ts`
 * (второе — когда рядом с типами лежит рантайм-код).
 *
 * @param directory - Каталог, с которого начинается обход.
 * @returns Абсолютные пути найденных модулей.
 */
function collectComposableModules(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            return collectComposableModules(entryPath);
        }

        const isComposableModule =
            directory.endsWith('/composables') &&
            entry.name.endsWith('.ts') &&
            !entry.name.endsWith('.d.ts') &&
            entry.name !== 'types.ts';

        return isComposableModule ? [entryPath] : [];
    });
}

/**
 * The paths of the SFC of every runtime domain.
 *
 * @param directory - The directory the walk starts at.
 * @returns Absolute paths of the `.vue` files found.
 */
function collectSfcModules(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            return collectSfcModules(entryPath);
        }

        return entry.name.endsWith('.vue') ? [entryPath] : [];
    });
}

/**
 * The bodies of the `<script setup>` blocks of an SFC.
 *
 * The whole file cannot be parsed as TypeScript — `<template>` and `<style>` are
 * syntactic rubbish to the parser. The block is pulled out with a regexp rather than
 * with `@vue/compiler-sfc`: the project has no direct dependency on the compiler, it
 * lies in the tree transitively, and a guard must not depend on somebody else's
 * transitive version.
 *
 * @param source - The contents of the SFC.
 * @returns The contents of every `<script setup>` block of the file.
 */
function extractScriptSetupBlocks(source: string): string[] {
    const pattern = /<script\b(?=[^>]*\bsetup\b)[^>]*>([\s\S]*?)<\/script>/giu;

    return Array.from(source.matchAll(pattern), (match) => match[1] ?? '');
}

/**
 * The names of the types declared in the `<script setup>` of a component.
 *
 * @param filePath - The absolute path of the SFC.
 * @returns The names of the interfaces and type aliases declared.
 */
function findDeclaredTypeNamesInSfc(filePath: string): string[] {
    const source = readFileSync(filePath, 'utf8');

    return extractScriptSetupBlocks(source).flatMap((block) =>
        collectDeclaredTypeNames(
            ts.createSourceFile(
                `${filePath}.ts`,
                block,
                ts.ScriptTarget.Latest,
                false,
                ts.ScriptKind.TS
            )
        )
    );
}
// #endregion

/**
 * Охват кейсов — build-time слой, композаблы рантайма и `<script setup>` всех SFC.
 * `stores/`, `utils/` и серверный слой под проверку пока не попадают: там
 * объявления ещё не разнесены по `types/`, и включать их сейчас значило бы либо
 * красный набор, либо baseline-список исключений, который надо чинить руками.
 */
describe('типы живут в файлах типов, а не в implementation-модулях', () => {
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

    it('композаблы рантайм-доменов не объявляют типов', () => {
        const composableModules = collectComposableModules(RUNTIME_MODULES_DIR).map((filePath) =>
            relative(SRC_DIR, filePath)
        );

        // Та же страховка: обход, ничего не нашедший, прошёл бы как зелёный
        expect(composableModules).toContain(
            'runtime/modules/common/composables/useBrickImports.ts'
        );

        const offenders = composableModules.flatMap((relativePath) =>
            findDeclaredTypeNames(join(SRC_DIR, relativePath)).map(
                (typeName) => `${relativePath}: ${typeName}`
            )
        );

        expect(offenders).toEqual([]);
    });

    it('компоненты не объявляют типов в <script setup>', () => {
        const sfcModules = collectSfcModules(RUNTIME_MODULES_DIR).map((filePath) =>
            relative(SRC_DIR, filePath)
        );

        // A walk that found nothing would pass as green
        expect(sfcModules).toContain('runtime/modules/render/components/RendererCloseButton.vue');
        // And a second safeguard — a file with an inline `defineProps<{…}>` has to be
        // in the selection: without one the case would not prove that a literal does
        // not count as a declaration
        expect(sfcModules).toContain('runtime/modules/ui/inputs/BricksToolbarEditableSelect.vue');

        const offenders = sfcModules.flatMap((relativePath) =>
            findDeclaredTypeNamesInSfc(join(SRC_DIR, relativePath)).map(
                (typeName) => `${relativePath}: ${typeName}`
            )
        );

        expect(offenders).toEqual([]);
    });
});
