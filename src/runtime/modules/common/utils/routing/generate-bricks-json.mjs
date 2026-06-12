#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { globby } from 'globby';
import { join } from 'pathe';
import { fileURLToPath } from 'url';

// Function to extract category from file content using regular expressions
function extractCategory(content) {
    const categoryMatch = content.match(/category\s*:\s*(['"])(.*?)\1/);
    return categoryMatch ? categoryMatch[2] : null;
}

function computeHash(data) {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export default async function generateBricksJson(isPlayground = false) {
    console.warn('Generating bricks.json...');
    const bricksJson = { bricks: [] };

    // Find files based on the glob pattern
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

        // Read the file content to extract category
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Generate path that matches glob pattern
        let brickPath = `/${relativePath}`;
        if (fullPath.includes('playground')) {
            brickPath = `../${relativePath}`;
        }

        bricksJson.bricks.push({
            name: componentName,
            category: extractCategory(content) || 'Common',
            brickPath: brickPath,
        });
    }

    // Generate the hash of bricksJson
    const hash = computeHash(JSON.stringify(bricksJson.bricks));

    // Add hash to the JSON data
    bricksJson.hash = hash;

    const outputDir = join(process.cwd(), '/public');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(`${outputDir}/bricks.json`, JSON.stringify(bricksJson, null, 2));

    console.log('Routes generated successfully with hash:', hash);
}

// Run the function when executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    generateBricksJson();
}
