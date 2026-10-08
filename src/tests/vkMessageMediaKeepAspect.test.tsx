import {afterEach, describe, expect, it, vi} from 'vitest';
import {keepAspect} from '@/vkgram/components/MessageMedia';

// синглтон прокси при импорте стартует крипто-воркер (fetch(undefined) в jsdom) — глушим
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

// the module's Web K wrappers are irrelevant here — keepAspect works on plain DOM
vi.mock('@components/wrappers/photoTsx', () => ({default: () => <div />}));
vi.mock('@components/wrappers/videoTsx', () => ({default: () => <div />}));
vi.mock('@components/wrappers/documentTsx', () => ({default: () => <div />}));
vi.mock('@components/emptyMediaListLoader', () => ({emptyMediaListLoaderFactory: vi.fn()}));
vi.mock('@/vkgram/pages/messages/openChat', () => ({openVKChat: vi.fn()}));
vi.mock('@appManagers/utils/docs/getAudioTitles', () => ({default: vi.fn()}));

const box = (width: number, height: number) => {
  const root = document.createElement('div');
  const inner = document.createElement('div');
  inner.style.width = `${width}px`;
  inner.style.height = `${height}px`;
  root.append(inner);
  document.body.append(root);
  return {root, inner};
};

describe('keepAspect', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('turns the px pair into aspect-ratio and marks a vertical box as portrait', () => {
    const {root, inner} = box(448, 560);
    const observer = keepAspect(root);

    expect(inner.style.aspectRatio).toBe('448 / 560');
    // jsdom collapses `min(448px, 100%)` to its px part; the full value is browser-checked
    expect(inner.style.width).toMatch(/448px/);
    expect(inner.style.height).toBe('auto');
    expect(root.classList.contains('vk-media-portrait')).toBe(true);
    expect(root.classList.contains('vk-media-landscape')).toBe(false);

    observer.disconnect();
  });

  it('marks a horizontal box as landscape', () => {
    const {root} = box(560, 315);
    const observer = keepAspect(root);

    expect(root.classList.contains('vk-media-landscape')).toBe(true);
    expect(root.classList.contains('vk-media-portrait')).toBe(false);

    observer.disconnect();
  });

  it('follows Web K rewriting the box: the class follows the new dimensions', async() => {
    const {root, inner} = box(560, 315);
    const observer = keepAspect(root);
    expect(root.classList.contains('vk-media-landscape')).toBe(true);

    // a vertical preview replaces the horizontal one; the observer is async
    inner.style.width = '315px';
    inner.style.height = '560px';
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.classList.contains('vk-media-portrait')).toBe(true);
    observer.disconnect();
  });

  it('leaves a box without dimensions alone (no class until Web K sizes it)', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const observer = keepAspect(root);

    expect(root.classList.contains('vk-media-landscape')).toBe(false);
    expect(root.classList.contains('vk-media-portrait')).toBe(false);

    observer.disconnect();
  });
});
