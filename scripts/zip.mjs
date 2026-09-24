import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');
const packageJson = JSON.parse(
  await (await import('node:fs/promises')).readFile(join(root, 'package.json'), 'utf8'),
);
const output = join(root, `sanitaize-v${packageJson.version}.zip`);
await rm(output, { force: true });
await mkdir(dist, { recursive: true });

const command = process.platform === 'win32' ? 'powershell.exe' : 'zip';
const args =
  process.platform === 'win32'
    ? [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${dist}\\*' -DestinationPath '${output}' -Force`,
      ]
    : ['-qr', output, 'dist'];

const child = spawn(command, args, { stdio: 'inherit', cwd: root });
child.on('exit', (code) => {
  if (code === 0) console.log(`Created ${output}`);
  process.exitCode = code ?? 1;
});
