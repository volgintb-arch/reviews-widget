#!/usr/bin/env node
/**
 * Build widget bundle:
 *   widget/src/widget.js  →  widget/dist/widget.js   (minified, production URL)
 *   widget/src/widget.html →  widget/dist/widget.html (Tilda snippet, unchanged)
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { minify } from 'terser';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC_JS = path.join(here, 'src', 'widget.js');
const SRC_HTML = path.join(here, 'src', 'widget.html');
const DIST = path.join(here, 'dist');
const OUT_JS = path.join(DIST, 'widget.js');
const OUT_HTML = path.join(DIST, 'widget.html');

const PROD_API = process.env.PUBLIC_API_BASE || 'https://reviews.questlegends.ru';

async function main() {
  await mkdir(DIST, { recursive: true });

  const source = await readFile(SRC_JS, 'utf8');
  const withApi = source.replace(/__API_BASE__/g, PROD_API);

  const result = await minify(withApi, {
    compress: { passes: 2, ecma: 2020 },
    mangle: true,
    format: { comments: /^!/ },
    ecma: 2020,
  });

  if (!result.code) throw new Error('terser produced no output');

  await writeFile(OUT_JS, result.code, 'utf8');
  await copyFile(SRC_HTML, OUT_HTML);

  const kb = (Buffer.byteLength(result.code, 'utf8') / 1024).toFixed(2);
  console.log(`✓ widget.js   ${kb} KB  →  ${path.relative(process.cwd(), OUT_JS)}`);
  console.log(`✓ widget.html        →  ${path.relative(process.cwd(), OUT_HTML)}`);
  console.log(`  API base: ${PROD_API}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
