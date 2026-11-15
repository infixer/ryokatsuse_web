// 日記の投稿画面（SNS の投稿欄のような操作感）
// - 文字はそのまま書くだけ
// - 画像はボタンから選ぶ（貼り付け・ドロップも可）。ブラウザで縮小し EXIF を落としてから送る
// - URL だけを貼ると、その場でリンクカードになる
// - 新規投稿の書きかけは localStorage に自動保存する

type UploadedImage = {
  key: string;
  width: number;
  height: number;
  url: string;
};
type Draft = { body: string; images: UploadedImage[]; links: string[] };

const DRAFT_KEY = 'diary-draft-v1';
// 長辺の最大ピクセル。表示幅（最大 736px）の 2 倍強
const MAX_EDGE = 1600;
const QUALITY = 0.85;

const SINGLE_URL = /^https?:\/\/\S+$/;

const loadDraft = (): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
};

const saveDraft = (draft: Draft) => {
  try {
    if (
      !draft.body.trim() &&
      draft.images.length === 0 &&
      draft.links.length === 0
    ) {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  } catch {
    // プライベートブラウズなどで保存できなくても投稿はできるようにする
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 何もしない
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めません'));
    };
    image.src = url;
  });

/**
 * 画像を長辺 MAX_EDGE まで縮小して WebP（未対応なら JPEG）にする。
 * canvas に描き直すので、位置情報などの EXIF はここで消える。
 * GIF はアニメーションを残すため、そのまま送る。
 */
const prepareImage = async (
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> => {
  const source: ImageBitmap | HTMLImageElement = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  }).catch(() => loadImageElement(file));
  const sourceWidth = source.width;
  const sourceHeight = source.height;

  if (file.type === 'image/gif') {
    return { blob: file, width: sourceWidth, height: sourceHeight };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像を処理できません');
  context.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  // Safari は WebP に書き出せず PNG を返すので、そのときは JPEG にする
  let blob = await canvasToBlob(canvas, 'image/webp');
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg');
  }
  if (!blob) throw new Error('画像を変換できません');
  return { blob, width, height };
};

const closeIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>';

export const initComposer = (form: HTMLFormElement) => {
  const mode = form.dataset.mode === 'edit' ? 'edit' : 'new';
  const postId = form.dataset.postId;
  const maxImages = Number(form.dataset.maxImages) || 4;

  const textarea = form.querySelector<HTMLTextAreaElement>('#composer-body')!;
  const imagesEl = form.querySelector<HTMLElement>('#composer-images')!;
  const linksEl = form.querySelector<HTMLElement>('#composer-links')!;
  const statusEl = form.querySelector<HTMLElement>('#composer-status')!;
  const addImageButton = form.querySelector<HTMLButtonElement>(
    '#composer-add-image',
  )!;
  const fileInput = form.querySelector<HTMLInputElement>('#composer-file')!;
  const submitButton =
    form.querySelector<HTMLButtonElement>('#composer-submit')!;

  let submitting = false;

  // ---- 状態は DOM から読む ----

  const imageItems = () =>
    Array.from(imagesEl.querySelectorAll<HTMLElement>('.composer-image'));
  const linkItems = () =>
    Array.from(linksEl.querySelectorAll<HTMLElement>('.composer-link'));

  const uploadedImages = (): UploadedImage[] =>
    imageItems()
      .filter((item) => item.dataset.key)
      .map((item) => ({
        key: item.dataset.key!,
        width: Number(item.dataset.width),
        height: Number(item.dataset.height),
        url: item.dataset.url!,
      }));

  const links = () => linkItems().map((item) => item.dataset.url!);

  const isBusy = () =>
    imageItems().some((item) => item.dataset.state === 'uploading') ||
    linkItems().some((item) => item.dataset.state === 'loading');

  const hasContent = () =>
    textarea.value.trim().length > 0 ||
    uploadedImages().length > 0 ||
    links().length > 0;

  const update = () => {
    submitButton.disabled = submitting || isBusy() || !hasContent();
    addImageButton.disabled = imageItems().length >= maxImages;
    if (mode === 'new') {
      saveDraft({
        body: textarea.value,
        images: uploadedImages(),
        links: links(),
      });
    }
  };

  const setStatus = (message: string, isError = false) => {
    statusEl.textContent = message;
    statusEl.classList.toggle('text-red-600', isError);
    statusEl.classList.toggle('dark:text-red-400', isError);
  };

  // field-sizing: content 未対応のブラウザ向けに高さを合わせる
  const autosize = () => {
    if (CSS.supports('field-sizing', 'content')) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  // ---- 画像 ----

  const createImageItem = (src: string) => {
    const item = document.createElement('div');
    item.className =
      'composer-image relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-neutral-800';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.className = 'h-full w-full object-cover';
    const overlay = document.createElement('div');
    overlay.className =
      'composer-image-overlay absolute inset-0 hidden items-center justify-center bg-black/50 text-sm font-bold text-white';
    overlay.textContent = 'アップロード中…';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className =
      'composer-remove absolute right-1.5 top-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
    remove.setAttribute('aria-label', '画像を削除');
    remove.innerHTML = closeIcon;
    item.append(img, overlay, remove);
    imagesEl.append(item);
    return item;
  };

  const setImageUploading = (item: HTMLElement, uploading: boolean) => {
    item.dataset.state = uploading ? 'uploading' : 'done';
    const overlay = item.querySelector<HTMLElement>('.composer-image-overlay')!;
    overlay.classList.toggle('hidden', !uploading);
    overlay.classList.toggle('flex', uploading);
  };

  const showUploaded = (image: UploadedImage) => {
    const item = createImageItem(image.url);
    Object.assign(item.dataset, {
      key: image.key,
      width: String(image.width),
      height: String(image.height),
      url: image.url,
      state: 'done',
    });
  };

  const addImages = async (files: File[]) => {
    const room = maxImages - imageItems().length;
    const accepted = files
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, room);
    if (files.length > room) setStatus(`画像は ${maxImages} 枚までです`, true);
    if (accepted.length === 0) return;

    await Promise.all(
      accepted.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        const item = createImageItem(previewUrl);
        setImageUploading(item, true);
        update();

        try {
          const { blob, width, height } = await prepareImage(file);
          const body = new FormData();
          body.append('file', blob, file.name);
          body.append('width', String(width));
          body.append('height', String(height));
          const response = await fetch('/api/admin/diary/media', {
            method: 'POST',
            body,
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error ?? 'アップロードに失敗しました');

          Object.assign(item.dataset, {
            key: data.key,
            width: String(data.width),
            height: String(data.height),
            url: data.url,
          });
          setImageUploading(item, false);
        } catch (error) {
          item.remove();
          setStatus(
            error instanceof Error
              ? error.message
              : 'アップロードに失敗しました',
            true,
          );
        } finally {
          URL.revokeObjectURL(previewUrl);
          update();
        }
      }),
    );
  };

  // ---- リンクカード ----

  const addLink = async (url: string) => {
    if (links().includes(url)) {
      setStatus('このリンクはもう追加されています');
      return;
    }

    const placeholder = document.createElement('div');
    placeholder.className =
      'composer-link mt-3 flex h-[180px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-neutral-600 dark:text-neutral-400';
    placeholder.dataset.url = url;
    placeholder.dataset.state = 'loading';
    placeholder.textContent = 'リンクカードを読み込み中…';
    linksEl.append(placeholder);
    update();

    try {
      const response = await fetch(
        `/admin/diary/link-card?url=${encodeURIComponent(url)}`,
      );
      if (!response.ok) throw new Error();
      const template = document.createElement('template');
      template.innerHTML = (await response.text()).trim();
      const card = template.content.firstElementChild;
      if (!card) throw new Error();
      placeholder.replaceWith(card);
    } catch {
      placeholder.remove();
      // カードにできなかった URL は本文に戻して、書いた内容を失わないようにする
      insertText(url);
      setStatus('リンクカードを作れなかったので、本文に貼り付けました', true);
    } finally {
      update();
    }
  };

  /** カードの OGP を取り直す（サイトの情報が更新されたときや、うまく取れなかったとき用） */
  const refreshLink = async (item: HTMLElement) => {
    const url = item.dataset.url;
    if (!url) return;
    item.dataset.state = 'loading';
    item.classList.add('opacity-50');
    update();
    setStatus('リンクカードを取り直しています…');

    try {
      const response = await fetch(
        `/admin/diary/link-card?url=${encodeURIComponent(url)}&refresh=1`,
      );
      if (!response.ok) throw new Error();
      const template = document.createElement('template');
      template.innerHTML = (await response.text()).trim();
      const card = template.content.firstElementChild;
      if (!card) throw new Error();
      item.replaceWith(card);
      setStatus('リンクカードを取り直しました');
    } catch {
      delete item.dataset.state;
      item.classList.remove('opacity-50');
      setStatus('リンクカードを取り直せませんでした', true);
    } finally {
      update();
    }
  };

  const insertText = (text: string) => {
    textarea.focus();
    textarea.setRangeText(
      text,
      textarea.selectionStart,
      textarea.selectionEnd,
      'end',
    );
    textarea.dispatchEvent(new Event('input'));
  };

  // ---- イベント ----

  textarea.addEventListener('input', () => {
    autosize();
    update();
  });

  textarea.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    if (!data) return;

    const files = Array.from(data.files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (files.length > 0) {
      event.preventDefault();
      void addImages(files);
      return;
    }

    // URL だけを貼ったときはリンクカードにする（文章の中に URL を混ぜたいときは手で打てばよい）
    const text = data.getData('text/plain').trim();
    if (SINGLE_URL.test(text)) {
      event.preventDefault();
      void addLink(text);
    }
  });

  // ⌘ / Ctrl + Enter で投稿
  textarea.addEventListener('keydown', (event) => {
    if (
      event.key === 'Enter' &&
      (event.metaKey || event.ctrlKey) &&
      !event.isComposing
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  addImageButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    void addImages(Array.from(fileInput.files ?? []));
    fileInput.value = '';
  });

  // 画像のドラッグ＆ドロップ（PC 向け）
  form.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  form.addEventListener('drop', (event) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    void addImages(files);
  });

  // リンクカードの再取得ボタン・画像とリンクカードの削除ボタン
  form.addEventListener('click', (event) => {
    const refresh = (event.target as Element).closest('.composer-refresh');
    if (refresh) {
      event.preventDefault();
      const item = refresh.closest<HTMLElement>('.composer-link');
      if (item) void refreshLink(item);
      return;
    }

    const button = (event.target as Element).closest('.composer-remove');
    if (!button) return;
    event.preventDefault();
    button.closest('.composer-image, .composer-link')?.remove();
    update();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;

    submitting = true;
    update();
    setStatus(mode === 'edit' ? '更新しています…' : '投稿しています…');

    try {
      const response = await fetch(
        mode === 'edit'
          ? `/api/admin/diary/posts/${postId}`
          : '/api/admin/diary/posts',
        {
          method: mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: textarea.value,
            images: uploadedImages().map(({ key, width, height }) => ({
              key,
              width,
              height,
            })),
            links: links(),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '保存に失敗しました');

      if (mode === 'edit') {
        location.href = `/feed/${postId}`;
        return;
      }
      clearDraft();
      // 一覧に新しい投稿を出すため読み直す
      location.reload();
    } catch (error) {
      submitting = false;
      setStatus(
        error instanceof Error ? error.message : '保存に失敗しました',
        true,
      );
      update();
    }
  });

  /**
   * Android の「共有」からホーム画面の日記アプリに送られてきた内容を取り込む（manifest の share_target）。
   * URL はリンクカードにし、URL 以外の文章があれば本文の末尾に足す。ページタイトルはカードに出るので使わない。
   */
  const applySharedContent = () => {
    const params = new URLSearchParams(location.search);
    const sharedText = params.get('text')?.trim() ?? '';
    const sharedUrl =
      params.get('url')?.trim() ||
      sharedText.match(/https?:\/\/\S+/)?.[0] ||
      '';
    if (!sharedText && !sharedUrl) return;

    const rest = sharedText.replace(sharedUrl, '').trim();
    if (rest) {
      textarea.value = textarea.value ? `${textarea.value}\n${rest}` : rest;
    }
    if (SINGLE_URL.test(sharedUrl)) void addLink(sharedUrl);

    // 再読み込みで二重に取り込まないよう、URL からクエリを消す
    history.replaceState(null, '', location.pathname);
  };

  // ---- 初期表示 ----

  const initialImages = JSON.parse(form.dataset.initialImages ?? '[]') as Omit<
    UploadedImage,
    'url'
  >[];
  for (const image of initialImages)
    showUploaded({ ...image, url: `/media/${image.key}` });

  if (mode === 'new') {
    const draft = loadDraft();
    if (draft) {
      textarea.value = draft.body;
      for (const image of draft.images) showUploaded(image);
      for (const url of draft.links) void addLink(url);
      if (draft.body || draft.images.length || draft.links.length) {
        setStatus('書きかけの投稿を復元しました');
      }
    }
    applySharedContent();
    textarea.focus();
  }

  autosize();
  update();
};
