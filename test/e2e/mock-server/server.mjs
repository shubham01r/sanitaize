import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const page = await readFile(join(directory, 'chatgpt.html'), 'utf8');
const claudePage = await readFile(join(directory, 'claude.html'), 'utf8');
const port = 4173;
let requests = [];

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new Error('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function findMock(body) {
  return (
    JSON.stringify(body).match(/sk_test_[A-Za-z0-9]+/)?.[0] ?? 'sk_test_mockfixture7x9q2m4k6p8r'
  );
}

function sseData(value) {
  return `data: ${JSON.stringify({ p: '/message/content/parts/0', o: 'append', v: value })}\n\n`;
}

function sendChatgptStream(response, mock, streamMode) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  if (streamMode === 'malformed') response.write('data: {not-json}\n\n');
  response.write(sseData('Reply uses '));
  const splitAt = Math.min(5, mock.length);
  response.write(sseData(mock.slice(0, splitAt)));
  response.write(sseData(mock.slice(splitAt)));
  response.end('data: [DONE]\n\n');
}

function claudeSseData(value) {
  return `data: ${JSON.stringify({ completion: value })}\n\n`;
}

function sendClaudeStream(response, mock) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  response.write(claudeSseData('Claude reply uses '));
  response.write(claudeSseData(mock.slice(0, 5)));
  response.write(claudeSseData(mock.slice(5)));
  response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(page);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/claude') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(claudePage);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/__test/reset') {
    requests = [];
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/__test/state') {
    sendJson(response, 200, { requests });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/backend-api/conversation') {
    try {
      const text = await readBody(request);
      const body = JSON.parse(text);
      requests.push({ body });
      sendChatgptStream(response, findMock(body), body.stream_mode);
    } catch {
      sendJson(response, 400, { ok: false });
    }
    return;
  }
  if (
    request.method === 'POST' &&
    /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(?:retry_completion|completion)$/.test(url.pathname)
  ) {
    try {
      const text = await readBody(request);
      const body = JSON.parse(text);
      requests.push({ body, site: 'claude' });
      sendClaudeStream(response, findMock(body));
    } catch {
      sendJson(response, 400, { ok: false });
    }
    return;
  }
  sendJson(response, 404, { ok: false });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local mock ChatGPT server listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
