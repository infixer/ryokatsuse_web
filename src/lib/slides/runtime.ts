/**
 * スライドページのクライアント側の動き。
 * - ←→・Space・PageUp/Down・Home/End・スワイプ・クリックで移動
 * - N でノート、P で発表者ビュー（別ウィンドウ。BroadcastChannel で同期）、F で全画面、T でテーマ切り替え
 * - YouTube などの埋め込みは表示中のスライドだけ読み込み、離れたら止める
 * - URL の #3 で 3 枚目から開く。?theme=paper でプリセットを試せる
 * - はみ出すスライドは文字を縮めて収める（fit.ts）
 */

import { fitSlides } from './fit';

interface Position {
  index: number;
  step: number;
}

export function startSlides() {
  const deck = document.querySelector<HTMLElement>('.deck');
  if (!deck) return;
  const slides = [...deck.querySelectorAll<HTMLElement>(':scope > .slide')];
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const isPresenter = params.has('presenter');
  const themes = (deck.dataset.themes ?? '').split(',').filter(Boolean);

  const counter = document.querySelector<HTMLElement>('[data-current]');
  const progress = document.querySelector<HTMLElement>('.progress > span');
  const notesPanel = document.querySelector<HTMLElement>('.notes-panel');
  const notesPanelBody =
    document.querySelector<HTMLElement>('.notes-panel-body');
  const notesButton = document.querySelector<HTMLButtonElement>(
    '[data-action="notes"]',
  );
  const presenter = document.querySelector<HTMLElement>('.presenter');
  const presenterNext = document.querySelector<HTMLElement>(
    '.presenter-next-stage',
  );
  const presenterNotes = document.querySelector<HTMLElement>(
    '.presenter-notes-body',
  );
  const timerLabel = document.querySelector<HTMLElement>('.presenter-timer');

  const themeParam = params.get('theme');
  if (themeParam && themes.includes(themeParam))
    root.dataset.theme = themeParam;

  const stepsOf = (index: number) => Number(slides[index]?.dataset.steps ?? 0);
  let position: Position = { index: -1, step: 0 };

  const channel =
    'BroadcastChannel' in window
      ? new BroadcastChannel(`slides:${deck.dataset.deck}`)
      : undefined;

  function render(next: Position, { broadcast = true } = {}) {
    const index = Math.min(Math.max(next.index, 0), slides.length - 1);
    const step = Math.min(Math.max(next.step, 0), stepsOf(index));
    if (index === position.index && step === position.step) return;

    deck!.dataset.direction = index < position.index ? 'backward' : 'forward';
    const changedSlide = index !== position.index;
    position = { index, step };

    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.classList.toggle('is-past', i < index);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
      // 埋め込み（YouTube など）は表示中のスライドだけ読み込む。離れたら外して再生を止める
      slide
        .querySelectorAll<HTMLIFrameElement>('iframe[data-src]')
        .forEach((iframe) => {
          if (active && !iframe.hasAttribute('src')) {
            iframe.src = iframe.dataset.src!;
          } else if (!active && iframe.hasAttribute('src')) {
            iframe.removeAttribute('src');
          }
        });
      slide.querySelectorAll<HTMLElement>('[data-step]').forEach((item) => {
        item.classList.toggle(
          'is-shown',
          Number(item.dataset.step) <= (active ? step : stepsOf(i)),
        );
      });
    });

    if (counter) counter.textContent = String(index + 1);
    if (progress)
      progress.style.transform = `scaleX(${slides.length > 1 ? index / (slides.length - 1) : 1})`;
    if (changedSlide) {
      history.replaceState(null, '', `#${index + 1}`);
      const notesHtml = slides[index].querySelector('.notes')?.innerHTML ?? '';
      if (notesPanelBody) notesPanelBody.innerHTML = notesHtml;
      if (presenterNotes) presenterNotes.innerHTML = notesHtml;
      if (isPresenter) renderNextPreview(index);
    }
    if (broadcast) channel?.postMessage(position);
  }

  function renderNextPreview(index: number) {
    if (!presenterNext) return;
    presenterNext.replaceChildren();
    const next = slides[index + 1];
    if (!next) {
      presenterNext.textContent = '最後のスライドです';
      return;
    }
    const clone = next.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('iframe')
      .forEach((iframe) => iframe.removeAttribute('src'));
    clone.classList.add('is-active', 'is-static');
    clone
      .querySelectorAll('[data-step]')
      .forEach((item) => item.classList.add('is-shown'));
    clone.inert = true;
    presenterNext.append(clone);
  }

  const forward = () => {
    if (position.step < stepsOf(position.index))
      render({ index: position.index, step: position.step + 1 });
    else if (position.index < slides.length - 1)
      render({ index: position.index + 1, step: 0 });
  };
  const backward = () => {
    if (position.step > 0)
      render({ index: position.index, step: position.step - 1 });
    else if (position.index > 0)
      render({ index: position.index - 1, step: stepsOf(position.index - 1) });
  };
  const goTo = (index: number) =>
    render({ index, step: index < position.index ? stepsOf(index) : 0 });

  function toggleNotes(force?: boolean) {
    if (!notesPanel) return;
    const show = force ?? notesPanel.hidden;
    notesPanel.hidden = !show;
    notesButton?.setAttribute('aria-pressed', String(show));
  }

  function openPresenter() {
    const url = new URL(location.href);
    url.searchParams.set('presenter', '');
    window.open(
      url,
      `presenter:${deck!.dataset.deck}`,
      'popup,width=1200,height=760',
    );
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.requestFullscreen?.();
  }

  function cycleTheme() {
    const current = themes.indexOf(root.dataset.theme ?? '');
    root.dataset.theme = themes[(current + 1) % themes.length];
    // プリセットで書体や余白が変わるので測り直す
    fit();
  }

  // はみ出し調整。書体の読み込み・画面サイズの変化・画像の読み込みのあとにも測り直す
  const fit = () => fitSlides(slides);
  let fitFrame: number | undefined;
  const refit = () => {
    if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      fitFrame = undefined;
      fit();
    });
  };
  window.addEventListener('resize', refit);
  void document.fonts?.ready.then(refit);
  deck.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', refit, { once: true });
  });

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (
      (event.target as HTMLElement).closest(
        'input, textarea, [contenteditable]',
      )
    )
      return;
    const actions: Record<string, () => void> = {
      ArrowRight: forward,
      ArrowDown: forward,
      PageDown: forward,
      ' ': forward,
      Enter: forward,
      ArrowLeft: backward,
      ArrowUp: backward,
      PageUp: backward,
      Backspace: backward,
      Home: () => goTo(0),
      End: () => goTo(slides.length - 1),
      n: () => toggleNotes(),
      p: openPresenter,
      f: toggleFullscreen,
      t: cycleTheme,
    };
    // ボタンにフォーカスがあるときの Space / Enter はボタンの操作を優先する
    if (
      (event.key === ' ' || event.key === 'Enter') &&
      (event.target as HTMLElement).closest('button, a')
    )
      return;
    const action =
      actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-action]',
    );
    if (button) {
      const buttonActions: Record<string, () => void> = {
        prev: backward,
        next: forward,
        notes: () => toggleNotes(),
        presenter: openPresenter,
        fullscreen: toggleFullscreen,
        'reset-timer': resetTimer,
      };
      buttonActions[button.dataset.action ?? '']?.();
      return;
    }
    // スライド上のクリック：左 1/3 で戻る、それ以外で進む（リンクや文字選択は邪魔しない）
    const target = event.target as HTMLElement;
    if (
      isPresenter ||
      !target.closest('.deck') ||
      target.closest('a, pre, figure, table')
    )
      return;
    if (getSelection()?.toString()) return;
    if (event.clientX < innerWidth / 3) backward();
    else forward();
  });

  let touchStart: { x: number; y: number } | undefined;
  deck.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  deck.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = undefined;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) forward();
    else backward();
  });

  // マウスを動かしたときだけ操作 UI を出す
  let hideTimer: number | undefined;
  document.addEventListener('mousemove', () => {
    root.classList.add('show-ui');
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => root.classList.remove('show-ui'), 2000);
  });

  channel?.addEventListener('message', (event: MessageEvent<Position>) => {
    render(event.data, { broadcast: false });
  });

  window.addEventListener('hashchange', () => {
    const index = Number(location.hash.slice(1)) - 1;
    if (Number.isInteger(index) && index !== position.index) goTo(index);
  });

  // 発表者ビュー
  let startedAt = Date.now();
  function resetTimer() {
    startedAt = Date.now();
    tick();
  }
  function tick() {
    if (!timerLabel) return;
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    timerLabel.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  if (isPresenter) {
    root.classList.add('is-presenter');
    if (presenter) presenter.hidden = false;
    setInterval(tick, 1000);
  }

  fit();

  const initial = Number(location.hash.slice(1)) - 1;
  render(
    { index: Number.isInteger(initial) ? initial : 0, step: 0 },
    { broadcast: false },
  );
  root.classList.add('is-ready');
}
