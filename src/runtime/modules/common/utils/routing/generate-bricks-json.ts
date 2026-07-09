import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { globby } from 'globby';
import { join } from 'pathe';
import type { IBrickObject, IBricksManifest } from './types.d.ts';

/**
 * Извлекает категорию компонента из содержимого brick-файла.
 */
function extractCategory(content: string): string | null {
    const categoryMatch = content.match(/category\s*:\s*(['"])(.*?)\1/);
    return categoryMatch ? categoryMatch[2] : null;
}

/**
 * Считает SHA-256 хеш строки.
 */
function computeHash(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Сканирует проект на `*.brick.ts` brick-файлы и собирает манифест `public/bricks.json`.
 * Копия для CLI — `src/cli/generate-bricks-json.mjs` (запускается node'ом напрямую).
 */
export default async function generateBricksJson(isPlayground = false): Promise<void> {
    console.warn('Generating bricks.json...');
    const bricks: IBrickObject[] = [];

    // Nuxt 4 (app/) паттерны включены всегда — если директории нет, globby просто вернёт пустой результат
    const files = await globby(
        [
            'components/**/*.brick.ts',
            'layers/**/*.brick.ts',
            'app/components/**/*.brick.ts',
            'app/layers/**/*.brick.ts',
            'playground/components/**/*.brick.ts',
            'playground/layers/**/*.brick.ts',
        ],
        {
            cwd: process.cwd(),
            absolute: true,
            gitignore: false,
            onlyFiles: true,
        }
    );

    if (files.length === 0) {
        console.warn('No files found. Please check the glob pattern and paths.');
        return;
    }

    for (const fullPath of files) {
        let relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

        if (isPlayground) {
            relativePath = relativePath.replace(/^playground\//, '');
        }

        // Nuxt 4: strip app/ prefix (автоматически, если файл в app/)
        relativePath = relativePath.replace(/^app\//, '');

        const componentName = path.basename(fullPath, '.brick.ts');
        const content = fs.readFileSync(fullPath, 'utf-8');

        let brickPath = `/${relativePath}`;
        if (fullPath.includes('playground')) {
            brickPath = `../${relativePath}`;
        }

        bricks.push({
            name: componentName,
            category: extractCategory(content) || 'Common',
            brickPath: brickPath,
        });
    }

    const bricksJson: IBricksManifest = {
        bricks,
        hash: computeHash(JSON.stringify(bricks)),
    };

    const outputDir = join(process.cwd(), '/public');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(`${outputDir}/bricks.json`, JSON.stringify(bricksJson, null, 2));

    console.log('Routes generated successfully with hash:', bricksJson.hash);
}
