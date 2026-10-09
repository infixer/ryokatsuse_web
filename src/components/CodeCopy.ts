const RESET_DELAY = 2000;
const DEFAULT_LABEL = 'コードをコピー';

const setLabel = (button: HTMLButtonElement, label: string): void => {
  button.setAttribute('aria-label', label);
  button.title = label;
};

/** src/integrations/code-copy-button.ts が埋め込んだコピーボタンを動かす */
export const registerCodeCopy = (): void => {
  document.addEventListener('click', async (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '.code-copy-button',
    );
    const code = button?.parentElement?.querySelector('pre code');
    if (!button || !code) return;

    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      button.dataset.copied = 'true';
      setLabel(button, 'コピーしました');
    } catch {
      setLabel(button, 'コピーできませんでした');
    }
    clearTimeout(Number(button.dataset.timer));
    button.dataset.timer = String(
      setTimeout(() => {
        delete button.dataset.copied;
        setLabel(button, DEFAULT_LABEL);
      }, RESET_DELAY),
    );
  });
};
