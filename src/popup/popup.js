  const runtimeGlobal = /** @type {{chrome?: any}} */ (globalThis);
  const tabsApi = runtimeGlobal.chrome?.tabs;
  const messaging = runtimeGlobal.chrome?.runtime;
  const state = {
    tabId: null,
    site: '',
    active: true,
    paused: false,
    adapterId: 'chatgpt',
    stats: { replaced: 0, byType: {} },
    vaultSize: 0,
    last: null,
    patch: 'ok',
  };
  const status = document.querySelector('[data-role="status"]');
  const toggle = document.querySelector('[data-role="toggle"]');
  const breakdown = document.querySelector('[data-role="breakdown"]');
  const vaultSize = document.querySelector('[data-role="vault-size"]');
  const lastMessage = document.querySelector('[data-role="last-message"]');
  const clearButton = document.querySelector('[data-role="clear"]');
  const pauseButton = document.querySelector('[data-role="pause"]');
  const verify = document.querySelector('[data-role="verify"]');

  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };

  const labels = {
    STRIPE_KEY: 'API key',
    OPENAI_KEY: 'API key',
    ANTHROPIC_KEY: 'API key',
    GITHUB_TOKEN: 'Token',
    AWS_ACCESS_KEY_ID: 'API key',
    AWS_SECRET_KEY: 'Secret',
    GENERIC_SECRET: 'Secret',
    PEM_PRIVATE_KEY: 'Private key',
    DB_URL: 'Database URL',
    EMAIL: 'Email',
    IPV4: 'IP address',
    INTERNAL_HOST: 'Host name',
    DICTIONARY: 'Client name',
  };

  const render = () => {
    setText('[data-role="site"]', state.site || 'This tab');
    setText('[data-role="state"]', state.patch === 'lost' ? 'Not protecting' : state.paused ? 'Paused' : state.active ? 'Active' : 'Off for this site');
    setText('[data-role="replaced"]', String(state.stats.replaced));
    setText('[data-role="vault-size"]', `${state.vaultSize} ${state.vaultSize === 1 ? 'entry' : 'entries'} · memory only`);
    setText('[data-role="last-message"]', state.last ? `${state.last.count} replaced · ${Math.round(state.last.latencyMs)} ms` : 'No messages protected yet');
    if (breakdown) {
      breakdown.replaceChildren();
      const entries = Object.entries(state.stats.byType);
      if (entries.length === 0) breakdown.append(document.createTextNode('No values replaced yet.'));
      for (const [type, count] of entries) {
        const item = document.createElement('span');
        item.textContent = `${labels[type] ?? 'Sensitive value'} ${count}`;
        breakdown.append(item);
      }
    }
    if (toggle instanceof HTMLInputElement) toggle.checked = state.active;
    if (pauseButton instanceof HTMLButtonElement)
      pauseButton.textContent = state.paused ? 'Resume protection' : 'Pause tab';
    document.body?.classList.toggle('is-off', !state.active);
  };

  const sendToTab = (message) => {
    if (state.tabId === null) return Promise.resolve({ ok: false });
    return new Promise((resolve) => tabsApi.sendMessage(state.tabId, message, resolve));
  };

  const load = async () => {
    if (!tabsApi?.query || !messaging?.sendMessage) {
      if (status) status.textContent = 'SanitAIze is ready.';
      return;
    }
    const tabs = await new Promise((resolve) => tabsApi.query({ active: true, currentWindow: true }, resolve));
    const tab = tabs?.[0];
    if (!tab?.id) {
      if (status) status.textContent = 'SanitAIze works on ChatGPT and Claude. Open one of them to get started.';
      return;
    }
    state.tabId = tab.id;
    const response = await new Promise((resolve) => tabsApi.sendMessage(tab.id, { type: 'GET_TAB_STATE' }, resolve));
    if (!response?.ok || !response.state) {
      if (status) status.textContent = 'SanitAIze works on ChatGPT and Claude. Open one of them to get started.';
      return;
    }
    Object.assign(state, response.state);
    if (status) status.textContent = 'Protection runs locally in this tab.';
    render();
  };

  clearButton?.addEventListener('click', () => {
    void sendToTab({ type: 'CLEAR_VAULT' }).then(() => {
      state.stats = { replaced: 0, byType: {} };
      state.vaultSize = 0;
      state.last = null;
      render();
    });
  });
  toggle?.addEventListener('change', async (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const enabled = event.target.checked;
    const response = await sendToTab({ type: 'SET_SITE_ENABLED', enabled });
    state.active = response?.enabled ?? enabled;
    render();
  });
  pauseButton?.addEventListener('click', async () => {
    const duration = state.paused ? 0 : 900_000;
    const response = await sendToTab({ type: 'PAUSE_TAB', ms: duration });
    state.paused = Boolean(response?.paused);
    render();
  });
  verify?.addEventListener('click', () => {
    if (verify instanceof HTMLDetailsElement) verify.open = true;
  });
  document.querySelector('[data-role="options"]')?.addEventListener('click', () => messaging.openOptionsPage());

  void load();

export {};

  export {};
