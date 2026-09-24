import { different, randomAlphanumeric, randomBase64, shapeMockValue } from './common.js';

/** @param {any} detection @param {any} ctx */
export const pem = (detection, ctx) => {
  const lines = detection.value.split('\n');
  const first = lines[0];
  const last = lines.at(-1) ?? '';
  /** @param {string} line */
  /** @type {string[]} */
  const bodyLines = lines.slice(1, -1);
  const body = bodyLines.map((line) => {
    const width = line.length;
    return randomBase64(width, ctx.rand).slice(0, width).padEnd(width, 'A');
  });
  return { mock: different(detection.value, [first, ...body, last].join('\n')) };
};

/** @param {any} detection @param {any} ctx */
export const dburl = (detection, ctx) => {
  const value = detection.value;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { mock: shapeMockValue(value, ctx.rand) };
  }
  const user = parsed.username ? `user_${ctx.rand.lowercase(6)}` : '';
  const password = parsed.password
    ? randomAlphanumeric(Math.max(10, parsed.password.length), ctx.rand)
    : '';
  const host = /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)
    ? `10.${ctx.rand.digits(2)}.${ctx.rand.digits(2)}.${ctx.rand.digits(2)}`
    : `host-${ctx.rand.lowercase(6)}.mock.internal`;
  const database = parsed.pathname.replace(/^\//, '');
  const dbMock = database ? `db_${ctx.rand.lowercase(4)}` : '';
  const auth = user ? `${user}${password ? `:${password}` : ''}@` : '';
  const port = parsed.port ? `:${parsed.port}` : '';
  const path = dbMock ? `/${dbMock}` : parsed.pathname;
  const query = parsed.search
    ? `?${new URLSearchParams([...parsed.searchParams].map(([key]) => [key, 'synthetic'])).toString()}`
    : '';
  const mock = `${parsed.protocol}//${auth}${host}${port}${path}${query}${parsed.hash}`;
  return {
    mock: different(value, mock),
    components: [
      ...(user ? [{ real: parsed.username, mock: user, type: 'GENERIC_SECRET' }] : []),
      ...(password ? [{ real: parsed.password, mock: password, type: 'GENERIC_SECRET' }] : []),
      ...(parsed.hostname ? [{ real: parsed.hostname, mock: host, type: 'INTERNAL_HOST' }] : []),
      ...(dbMock ? [{ real: database, mock: dbMock, type: 'GENERIC_SECRET' }] : []),
    ],
  };
};

/** @param {any} detection @param {any} ctx */
export const email = (detection, ctx) => {
  const [local, domain] = detection.value.split('@');
  const domainMock = ['gmail.com', 'outlook.com', 'yahoo.com'].includes(domain.toLowerCase())
    ? domain
    : `corp-${ctx.rand.lowercase(4)}.example.com`;
  return { mock: different(detection.value, `user_${ctx.rand.lowercase(6)}@${domainMock}`) };
};

/** @param {any} detection @param {any} ctx */
export const ipv4 = (detection, ctx) => {
  const octets = detection.value.split('.').map(Number);
  const [a, b] = octets;
  /** @param {number} max */
  const randomOctet = (max) => Number(ctx.rand.digits(3)) % (max + 1);
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return { mock: `${a}.${b}.${randomOctet(255)}.${randomOctet(255)}` };
  }
  const testNet = a === 203 ? '203.0.113' : a === 198 ? '198.51.100' : '192.0.2';
  return { mock: `${testNet}.${randomOctet(255)}` };
};

/** @param {any} detection @param {any} ctx */
export const host = (detection, ctx) => {
  const value = detection.value;
  const suffix =
    value.match(/\.(?:internal|corp|intranet|lan|local|private)$/i)?.[0] ?? '.internal';
  const labelLength = Math.max(1, value.length - suffix.length);
  const label = `host-${ctx.rand.lowercase(Math.max(0, labelLength - 5))}`.slice(0, labelLength);
  return { mock: `${label}${suffix}` };
};

/** @param {any} detection @param {any} ctx */
export const entity = (detection, ctx) => {
  const uppercase = detection.value === detection.value.toUpperCase();
  const value = `Entity_${ctx.rand.choice(['A', 'B', 'C', 'D', 'E'])}_${ctx.rand.lowercase(3)}`;
  return { mock: uppercase ? value.toUpperCase() : value };
};
