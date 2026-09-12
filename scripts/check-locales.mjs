/**
 * Locale consistency check.
 *
 * Verifies required keys and their order against the English reference.
 * locale-fallbacks.json explicitly records the existing product translations
 * which fall back to English in languages other than Japanese.
 * Reports any key that is:
 *   - missing from a translation (the UI would silently fall back to English), or
 *   - stale (present in a translation but no longer in en.json), or
 *   - out of order (locale files use a shared component/UI layout).
 *
 * This is a pure JSON key comparison — it does not scan source, so it has no
 * false positives and needs no dependencies. It deliberately does NOT check for
 * unused or undefined keys, since that requires resolving dynamic localize()
 * call sites and is not worth the complexity. Run via `npm run lint:locales`.
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'locales');
const referenceFile = 'en.json';
const fallback = JSON.parse(readFileSync(new URL('./locale-fallbacks.json', import.meta.url), 'utf8'));
const fallbackKeys = new Set(fallback.keys);

const keysOf = file => Object.keys(JSON.parse(readFileSync(join(localesDir, file), 'utf8')));

const referenceKeys = keysOf(referenceFile);
const referenceKeySet = new Set(referenceKeys);
const localeFiles = readdirSync(localesDir).filter(f => f.endsWith('.json') && f !== referenceFile);

let failed = false;
for (const key of fallbackKeys) {
    if (!referenceKeySet.has(key)) {
        console.error(`英語fallbackの一覧に古いキーがあります: ${key}`);
        failed = true;
    }
}

for (const file of localeFiles) {
    const keys = keysOf(file);
    const keySet = new Set(keys);
    // 製品拡張の既知の未翻訳キーだけ、指定言語で英語fallbackを認める。
    // 日本語と本家由来のキーは例外にせず、今後の欠落も検出する。
    const optional = fallback.languages.includes(file.slice(0, -5)) ? fallbackKeys : new Set();
    const missing = referenceKeys.filter(k => !keySet.has(k) && !optional.has(k));
    const expectedKeys = referenceKeys.filter(k => keySet.has(k));
    const stale = keys.filter(k => !referenceKeySet.has(k));
    const orderMismatch = missing.length === 0 && stale.length === 0 ?
        keys.findIndex((key, index) => key !== expectedKeys[index]) : -1;

    if (missing.length || stale.length || orderMismatch !== -1) {
        failed = true;
        console.error(`\n${file}:`);
        missing.forEach(k => console.error(`  missing (untranslated): ${k}`));
        stale.forEach(k => console.error(`  stale (not in ${referenceFile}): ${k}`));
        if (orderMismatch !== -1) {
            console.error(`  out of order at key ${orderMismatch + 1}: expected ${expectedKeys[orderMismatch]}, found ${keys[orderMismatch]}`);
        }
    }
}

if (failed) {
    console.error(`\n✖ Locale check failed. Update static/locales so every language has the required keys as ${referenceFile}.`);
    process.exit(1);
}

console.log(`✔ All ${localeFiles.length} locales match the required keys and order (${referenceKeys.length} reference keys, ${fallbackKeys.size} explicit product fallbacks).`);
