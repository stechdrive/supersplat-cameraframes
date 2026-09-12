import { createReadStream } from 'node:fs';
import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const results = join(root, '.v3-proof/migration-results');
await mkdir(results, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
createServer(async (req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        // One bounded, ignored large artifact. Streaming avoids the browser's
        // OPFS quota during the optional multi-million-Gaussian round trip.
        if (path === '/__large/project.ssproj') {
            const target = join(results, 'legacy-roundtrip.ssproj');
            if (req.method === 'PUT' || req.method === 'PATCH') {
                if (req.headers.origin !== 'http://127.0.0.1:3341') throw new Error('公開範囲外です');
                if (req.method === 'PUT') await writeFile(target, new Uint8Array());
                let length = (await stat(target)).size;
                for await (const chunk of req) {
                    length += chunk.length;
                    if (length > 2 * 1024 * 1024 * 1024) throw new Error('検証パッケージが2GiBを超えました');
                    await appendFile(target, chunk);
                }
                res.writeHead(201).end();
            } else if (req.method === 'GET') {
                const info = await stat(target);
                res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
                createReadStream(target).pipe(res);
            } else res.writeHead(405).end();
            return;
        }
        // Optional, ignored legacy fixture. This route is confined to the local
        // validation server and never ships in the product or test artifacts.
        if (path === '/__legacy/project.ssproj') {
            const file = join(root, 'test/test_ape100.ssproj');
            const info = await stat(file);
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
            createReadStream(file).pipe(res);
            return;
        }
        if (path.startsWith('/__result/')) {
            const name = path.slice('/__result/'.length);
            if (!/^[\w-]+\.[a-z0-9]+$/i.test(name)) throw new Error('不正なファイル名');
            const target = join(results, name);
            if (req.method === 'POST') {
                if (req.headers.origin !== 'http://127.0.0.1:3341') throw new Error('公開範囲外です');
                const chunks = [];
                let length = 0;
                for await (const chunk of req) {
                    length += chunk.length;
                    if (length > 64 * 1024 * 1024) throw new Error('結果が64MiBを超えました');
                    chunks.push(chunk);
                }
                await writeFile(target, Buffer.concat(chunks));
                res.writeHead(201).end();
            } else createReadStream(target).on('error', () => res.destroy()).pipe(res);
            return;
        }
        const fixture = path.startsWith('/__fixture/');
        const publicRoot = fixture ? join(root, '.v3-proof/fixtures') : join(root, 'dist');
        const relative = fixture ? path.slice('/__fixture'.length) : path;
        const file = resolve(publicRoot, `.${relative === '/' ? '/index.html' : relative}`);
        if (!file.startsWith(publicRoot + sep) || !(await stat(file)).isFile()) throw new Error('公開範囲外です');
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
    } catch {
        res.writeHead(404).end();
    }
}).listen(3341, '127.0.0.1', () => console.log('移行検証: http://127.0.0.1:3341/'));
