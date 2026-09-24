import { chatgptAdapter } from './chatgpt.js';
import { claudeAdapter, localDevClaudeAdapter } from './claude.js';
import { localDevChatgptAdapter } from './local-dev.js';

const ADAPTERS = [localDevChatgptAdapter, localDevClaudeAdapter, chatgptAdapter, claudeAdapter];

/** @param {any} input @param {any} init */
export function matchAdapter(input, init) {
  return ADAPTERS.find((adapter) => adapter.matchRequest(input, init)) ?? null;
}

export { chatgptAdapter, claudeAdapter, localDevClaudeAdapter };
export const adapters = ADAPTERS;
