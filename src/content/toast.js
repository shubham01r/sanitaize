import { element } from './bridge.js';
import { errorCopy, successCopy } from './copy.js';

/** @param {any} root */
export function createToast(root) {
  const toast = element(root, 'aside', 'sz-toast');
  toast.hidden = true;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  const message = element(root, 'div', 'sz-toast-message');
  const code = element(root, 'div', 'sz-toast-code');
  const actions = element(root, 'div', 'sz-toast-actions');
  const close = element(root, 'button', 'sz-button', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  const action = element(root, 'button', 'sz-button', 'See what changed');
  action.type = 'button';
  action.dataset.variant = 'quiet';
  actions.append(action, close);
  toast.append(message, code, actions);
  root.append(toast);
  let timer = null;
  let onAction = null;
  let persistent = false;

  const dismiss = () => {
    toast.hidden = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    onAction = null;
  };
  const schedule = () => {
    if (persistent) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(dismiss, 4000);
  };
  const show = ({ text, code: errorCode, kind = 'success', actionHandler = null, keepOpen = false }) => {
    message.textContent = text;
    code.textContent = errorCode ? `Code ${errorCode}` : '';
    code.hidden = !errorCode;
    toast.dataset.kind = kind;
    toast.setAttribute('role', kind === 'blocked' ? 'alert' : 'status');
    toast.hidden = false;
    onAction = actionHandler;
    action.hidden = !actionHandler;
    action.onclick = () => {
      onAction?.();
      dismiss();
    };
    persistent = keepOpen;
    schedule();
  };
  close.addEventListener('click', dismiss);
  toast.addEventListener('mouseenter', () => {
    if (timer !== null) clearTimeout(timer);
  });
  toast.addEventListener('mouseleave', schedule);
  toast.addEventListener('focusin', () => {
    if (timer !== null) clearTimeout(timer);
  });
  toast.addEventListener('focusout', schedule);
  return {
    element: toast,
    showSuccess(count, actionHandler) {
      show({ text: successCopy(count), actionHandler });
    },
    showBlocked(errorCode) {
      show({ text: errorCopy(errorCode), code: errorCode, kind: 'blocked', keepOpen: true });
    },
    showWarning(errorCode) {
      show({ text: errorCopy(errorCode), code: errorCode, kind: 'warning' });
    },
    showInfo(text, kind = 'warning') {
      show({ text, kind });
    },
    dismiss,
  };
}
