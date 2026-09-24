import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { fakeFixtureValues } from '../test/helpers/fake-secrets.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const fixtureDirectory = join(root, 'test', 'fixtures', 'chatgpt');
const values = fakeFixtureValues;

const conversationId = 'CONVERSATION_ID_REDACTED';
const parentMessageId = 'PARENT_MESSAGE_ID_REDACTED';
const messageId = (suffix) => `MESSAGE_ID_${suffix}`;

const textMessage = (id, text) => ({
  id,
  author: { role: 'user' },
  create_time: 1710000000,
  update_time: null,
  content: { content_type: 'text', parts: [text] },
  status: 'completed',
  end_turn: null,
  weight: 1,
  metadata: {},
});

const assistantMessage = (id, text) => ({
  id,
  author: { role: 'assistant' },
  create_time: 1710000001,
  update_time: null,
  content: { content_type: 'text', parts: [text] },
  status: 'completed',
  end_turn: null,
  weight: 1,
  metadata: {},
});

const requestBase = {
  conversation_id: conversationId,
  model: 'gpt-4o',
  stream: true,
};

const normalText = [
  `Debug the integration for ${values.clientName}.`,
  `Use the synthetic key ${values.stripeKey} and database URL ${values.dbUrl}.`,
  `The synthetic contact is ${values.email}; the documentation IP is ${values.ipv4}.`,
].join(' ');

const longText = [
  'Review this synthetic integration scenario.',
  `Client: ${values.clientName}`,
  `Stripe key: ${values.stripeKey}`,
  `AWS access key id: ${values.awsKeyId}`,
  `AWS secret key: ${values.awsSecretKey}`,
  `Database: ${values.dbUrl}`,
  'Keep the values format-valid while debugging.',
].join('\n');

const codeText = [
  'Here is a synthetic code sample:',
  '```javascript',
  `const stripeKey = '${values.stripeKey}';`,
  `const databaseUrl = '${values.dbUrl}';`,
  '```',
].join('\n');

const followUpText = `Follow up: keep ${values.stripeKey} mapped consistently.`;
const regeneratedText = `Regenerate the answer for ${values.clientName}.`;

const normalRequest = {
  ...requestBase,
  parent_message_id: parentMessageId,
  messages: [textMessage(messageId('USER_NORMAL'), normalText)],
};

const longRequest = {
  ...requestBase,
  parent_message_id: parentMessageId,
  messages: [textMessage(messageId('USER_LONG'), longText)],
};

const codeRequest = {
  ...requestBase,
  parent_message_id: parentMessageId,
  messages: [textMessage(messageId('USER_CODE'), codeText)],
};

const followUpRequest = {
  ...requestBase,
  parent_message_id: messageId('ASSISTANT_PREVIOUS'),
  messages: [
    textMessage(messageId('USER_PREVIOUS'), `The first prompt used ${values.stripeKey}.`),
    assistantMessage(
      messageId('ASSISTANT_PREVIOUS'),
      `The first answer used ${values.stripeMock} and ${values.clientMock}.`,
    ),
    textMessage(messageId('USER_FOLLOW_UP'), followUpText),
  ],
};

const regenerateRequest = {
  ...requestBase,
  parent_message_id: messageId('ASSISTANT_REGENERATE'),
  messages: [textMessage(messageId('USER_REGENERATE'), regeneratedText)],
};

const renamedFieldsRequest = {
  conversation: {
    id: conversationId,
    items: [
      {
        id: messageId('USER_RENAMED'),
        text: `The renamed field still contains ${values.stripeKey} and ${values.dbUrl}.`,
      },
    ],
  },
  stream: true,
};

const deltaEvents = [
  { p: '/message/content/parts/0', o: 'append', v: 'The synthetic key ' },
  { p: '/message/content/parts/0', o: 'append', v: values.stripeMock.slice(0, 8) },
  { p: '/message/content/parts/0', o: 'append', v: values.stripeMock.slice(8) },
  {
    p: '/message/content/parts/0',
    o: 'append',
    v: ` and the database stand-in ${values.dbMock} are format-valid.`,
  },
  { p: '/message/id', o: 'replace', v: messageId('ASSISTANT_DELTA') },
];

const deltaSse = `${deltaEvents.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;

const cumulativeSnapshots = [
  'The synthetic key ',
  `The synthetic key ${values.stripeMock}`,
  `The synthetic key ${values.stripeMock} and the database stand-in ${values.dbMock} are format-valid.`,
];
const cumulativeSse = `${cumulativeSnapshots
  .map(
    (text, index) =>
      `data: ${JSON.stringify({
        message: {
          id: messageId(`ASSISTANT_CUMULATIVE_${index}`),
          author: { role: 'assistant' },
          content: { content_type: 'text', parts: [text] },
        },
      })}\n\n`,
  )
  .join('')}data: [DONE]\n\n`;

const prettierConfig =
  (await resolveConfig(join(root, 'test/fixtures/chatgpt/request.json'))) ?? {};

/** @param {unknown} value */
async function formatJson(value) {
  return format(JSON.stringify(value), { ...prettierConfig, parser: 'json' });
}

const files = {
  'request.json': await formatJson(normalRequest),
  'request-long-multiline.json': await formatJson(longRequest),
  'request-code-block.json': await formatJson(codeRequest),
  'request-follow-up.json': await formatJson(followUpRequest),
  'request-regenerate.json': await formatJson(regenerateRequest),
  'renamed-fields.json': await formatJson(renamedFieldsRequest),
  'stream-delta.sse': deltaSse,
  'stream-cumulative.sse': cumulativeSse,
};

await mkdir(fixtureDirectory, { recursive: true });
for (const [name, contents] of Object.entries(files)) {
  await writeFile(join(fixtureDirectory, name), contents, 'utf8');
}

console.log(`Generated ${Object.keys(files).length} synthetic ChatGPT fixture files.`);
