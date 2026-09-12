import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = join(root, '.v3-proof/upstream/dist');
const results = join(root, '.v3-proof/results');
await mkdir(results, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
createServer(async (req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const prefix = '/__proof/artifact/';
        if (path.startsWith(prefix)) {
            const name = path.slice(prefix.length);
            if (!/^[\w-]+\.[a-z0-9]+$/i.test(name)) throw new Error('不正なファイル名');
            const target = join(results, name);
            if (req.method === 'POST') {
                if (!['http://127.0.0.1:3340', 'http://localhost:3340'].includes(req.headers.origin)) {
                    res.writeHead(403).end();
                    return;
                }
                const chunks = [];
                let length = 0;
                for await (const chunk of req) {
                    length += chunk.length;
                    if (length > 64 * 1024 * 1024) throw new Error('実証結果が64MiBを超えました');
                    chunks.push(chunk);
                }
                await writeFile(target, Buffer.concat(chunks));
                res.writeHead(201).end();
            } else {
                res.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
                createReadStream(target).on('error', () => res.destroy()).pipe(res);
            }
            return;
        }
        const variant = ['baseline', 'legacy'].find(name => path.startsWith(`/${name}/`));
        const publicRoot = variant ? join(root, '.v3-proof', variant, 'dist') : directory;
        const relativePath = variant ? path.slice(variant.length + 1) : path;
        const file = resolve(publicRoot, `.${relativePath === '/' ? '/index.html' : relativePath}`);
        if (!file.startsWith(publicRoot + sep)) throw new Error('公開範囲外です');
        if (!(await stat(file)).isFile()) throw new Error('ファイルではありません');
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
    } catch {
        res.writeHead(404).end();
    }
}).listen(3340, '127.0.0.1', () => console.log('v3実証: http://127.0.0.1:3340/?proof&run'));
