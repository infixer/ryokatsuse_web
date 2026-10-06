import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import type { Image, Root } from 'mdast';
import sharp from 'sharp';
import { responsiveMarkdownImages } from '../src/integrations/responsive-markdown-images';

let root: string;
let publicDir: string;
let contentPath: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'responsive-images-'));
  publicDir = join(root, 'public');
  contentPath = join(root, 'src/content/blog/2026/example.mdx');
  await mkdir(join(publicDir, 'images'), { recursive: true });
  for (const [name, width, height, orientation] of [
    ['photo.JPG', 2400, 1600, 1],
    ['small.png', 160, 80, 1],
    ['portrait.jpg', 1200, 600, 6],
  ] as const) {
    await sharp({ create: { width, height, channels: 3, background: '#abc' } })
      .withMetadata({ orientation })
      .toFile(join(publicDir, 'images', name));
  }
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function transform(node: Image) {
  const tree: Root = {
    type: 'root',
    children: [{ type: 'paragraph', children: [node] }],
  };
  await responsiveMarkdownImages({ publicDir })(tree, { path: contentPath });
  return node;
}

test('local public photos use Astro imports and responsive sizes without losing text', async () => {
  const image = await transform({
    type: 'image',
    url: '/images/photo.JPG',
    alt: '写真の説明',
    title: '撮影記録',
  });
  assert.equal(
    resolve(dirname(contentPath), image.url),
    join(publicDir, 'images/photo.JPG'),
  );
  assert.equal(image.alt, '写真の説明');
  assert.equal(image.title, '撮影記録');
  assert.equal(image.data?.hProperties?.format, 'webp');
  assert.equal(image.data?.hProperties?.width, 736);
  assert.deepEqual(image.data?.hProperties?.widths, [368, 736, 1104, 1472]);
  assert.equal(
    image.data?.hProperties?.sizes,
    '(min-width: 768px) 736px, calc(100vw - 32px)',
  );
});

test('small images are never enlarged', async () => {
  const image = await transform({
    type: 'image',
    url: '/images/small.png',
    alt: '',
  });
  assert.equal(image.data?.hProperties?.width, 160);
  assert.deepEqual(image.data?.hProperties?.widths, [160]);
});

test('the first image loads eagerly and later images are deferred', async () => {
  const images: Image[] = [
    { type: 'image', url: '/images/photo.JPG', alt: '最初の画像' },
    { type: 'image', url: '/images/small.png', alt: '後続の画像' },
  ];
  const tree: Root = {
    type: 'root',
    children: [{ type: 'paragraph', children: images }],
  };
  await responsiveMarkdownImages({ publicDir })(tree, { path: contentPath });
  assert.equal(images[0].data?.hProperties?.loading, 'eager');
  assert.equal(images[1].data?.hProperties?.loading, 'lazy');
});

test('EXIF rotation determines the displayed width', async () => {
  const image = await transform({
    type: 'image',
    url: '/images/portrait.jpg',
    alt: '',
  });
  assert.equal(image.data?.hProperties?.width, 600);
  assert.deepEqual(image.data?.hProperties?.widths, [368, 600]);
});

test('external URLs, animations, query strings and traversal remain untouched', async () => {
  for (const url of [
    'https://example.com/photo.jpg',
    '/images/animation.gif',
    '/images/icon.svg',
    '/images/photo.JPG?v=1',
    '/images/%2e%2e/private.jpg',
  ]) {
    const original: Image = { type: 'image', url, alt: '説明' };
    const image = await transform({ ...original });
    assert.deepEqual(image, original);
  }
});

test('explicit loading and accessibility properties survive optimization', async () => {
  const image = await transform({
    type: 'image',
    url: '/images/photo.JPG',
    alt: '',
    data: { hProperties: { loading: 'eager', className: ['photo'] } },
  });
  assert.equal(image.data?.hProperties?.loading, 'eager');
  assert.deepEqual(image.data?.hProperties?.className, ['photo']);
  assert.equal(image.alt, '');
});
