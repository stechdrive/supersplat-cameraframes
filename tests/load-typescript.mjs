import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import * as playcanvas from 'playcanvas';
import ts from 'typescript';

// Test production TypeScript without bundling browser-only entry points.
const cache = new Map();
export const loadTypeScript = (file) => {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const nativeRequire = createRequire(file);
    const require = specifier => (specifier === 'playcanvas' ? playcanvas : specifier.startsWith('.') ? loadTypeScript(resolve(dirname(file), `${specifier}.ts`)) : nativeRequire(specifier));
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    });
    new Function('require', 'module', 'exports', outputText)(require, module, module.exports);
    return module.exports;
};
