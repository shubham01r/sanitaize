import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const isDev = process.argv.includes('--dev');

/** @param {string} file */
const fromRoot = (file) => join(root, file);

/** @param {Record<string, unknown>} manifest */
async function writeManifest(manifest) {
  await writeFile(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function copyStaticFiles() {
  const staticFiles = [
    ['src/managed_schema.json', 'managed_schema.json'],
    ['src/popup/popup.html', 'popup/popup.html'],
    ['src/popup/popup.css', 'popup/popup.css'],
    ['src/options/options.html', 'options/options.html'],
    ['src/onboarding/onboarding.html', 'onboarding/onboarding.html'],
  ];

  for (const [source, destination] of staticFiles) {
    await mkdir(dirname(join(dist, destination)), { recursive: true });
    await cp(fromRoot(source), join(dist, destination));
  }

  await mkdir(join(dist, 'icons'), { recursive: true });
  await cp(fromRoot('src/assets/icons'), join(dist, 'icons'), { recursive: true });
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const packageJson = JSON.parse(await readFile(fromRoot('package.json'), 'utf8'));
  const manifestTemplate = JSON.parse(
    await readFile(fromRoot('src/manifest.template.json'), 'utf8'),
  );
  const manifest = {
    ...manifestTemplate,
    version: packageJson.version,
  };

  if (isDev) {
    const devMatch = 'http://localhost:4173/*';
    manifest.content_scripts = manifest.content_scripts.map((entry) => ({
      ...entry,
      matches: [...entry.matches, devMatch],
    }));
  }

  const shared = {
    bundle: true,
    sourcemap: isDev,
    minify: !isDev,
    target: 'es2022',
    platform: 'browser',
    logLevel: 'info',
    legalComments: 'none',
    define: {
      'globalThis.__SANITAIZE_DEV__': JSON.stringify(isDev),
    },
  };

  await build({
    ...shared,
    entryPoints: {
      inject: 'src/main-world/inject.js',
      content: 'src/content/content.js',
    },
    outdir: dist,
    format: 'iife',
  });

  await build({
    ...shared,
    entryPoints: { background: 'src/background/service-worker.js' },
    outdir: dist,
    format: 'esm',
  });

  await build({
    ...shared,
    entryPoints: {
      'popup/popup': 'src/popup/popup.js',
      'options/options': 'src/options/options.js',
      'onboarding/onboarding': 'src/onboarding/onboarding.js',
    },
    outdir: dist,
    format: 'iife',
  });

  await copyStaticFiles();
  await writeManifest(manifest);
  console.log(`Built SanitAIze ${packageJson.version} (${isDev ? 'development' : 'production'}).`);
}

await main();
