import {afterEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderChatTips} from '@components/chatTips';

// jsdom без IntersectionObserver: его требует AnimationIntersector из графа chatTips
vi.hoisted(() => {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  (globalThis as any).IntersectionObserver = IntersectionObserverStub;
});

const rootScopeMock = vi.hoisted(() => ({
  managers: {appStateManager: {setByKey: vi.fn(async() => {})}},
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

const appImManagerMock = vi.hoisted(() => ({
  // чат не открыт — колода подсказок и её кнопка должны смонтироваться
  chat: {peerId: undefined as PeerId | undefined},
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

vi.mock('@lib/rootScope', () => ({default: rootScopeMock}));

// колода рисуется только шире 925px; сам стор тянет themeController-граф
vi.mock('@helpers/mediaSizes', () => {
  const sizes = {isLessThanFloatingLeftSidebar: false, isMobile: false};
  return {useMediaSizes: () => sizes};
});

// useHotReloadGuard и провайдер тянут весь Web K (mediaViewer, popups, apiManagerProxy) —
// в тесте нужны только три поля гарда
vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({
    appImManager: appImManagerMock,
    rootScope: rootScopeMock,
    themeController: {applyHighlightingColor: vi.fn()}
  })
}));
vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  default: (props: {children: any}) => props.children
}));

// карточки подсказок тянут темы/стикеры/топ-пиров через менеджеров — для кнопки они не нужны
const cardStubs = vi.hoisted(() => {
  const stub = (): null => null;
  return {appearance: stub, stickers: stub, chats: stub};
});
vi.mock('@components/chatTips/appearanceCard', () => ({default: cardStubs.appearance}));
vi.mock('@components/chatTips/stickersCard', () => ({default: cardStubs.stickers}));
vi.mock('@components/chatTips/chatsCard', () => ({default: cardStubs.chats}));

const settle = () => new Promise((resolve) => setTimeout(resolve));

const mountDeck = () => {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  renderChatTips(anchor);
};

afterEach(() => {
  document.querySelectorAll('.chat-tips-mount').forEach((el) => {
    (el as any).disposeChatTips?.();
    el.remove();
  });
  document.body.querySelectorAll('button.chat-tips-toggle').forEach((el) => el.remove());
  vi.clearAllMocks();
});

describe('Web K chat tips — corner toggle', () => {
  it('порталлится в body со стабильным классом, по которому VKgram её прячет', async() => {
    mountDeck();
    await settle();

    // кнопка живёт в <body> (Portal), вне колоды в шелле Web K — класс обязан быть
    // немодульным: хэш _toggleButton_gm1ss_49 нестабилен между сборками
    const toggle = document.body.querySelector('button.chat-tips-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBeTruthy();
  });

  it('кнопка остаётся проводкой самой колоды: aria-controls указывает на карусель', async() => {
    mountDeck();
    await settle();

    const toggle = document.body.querySelector('button.chat-tips-toggle');
    const carouselId = toggle.getAttribute('aria-controls');
    expect(carouselId).toBeTruthy();
    // карусель живёт в шелле Web K, кнопка — в body; связь только по id
    expect(document.getElementById(carouselId)).toBeTruthy();
  });

  it('vk-base.scss прячет кнопку вне раздела «Телеграм»', () => {
    const scss = readFileSync(resolve(process.cwd(), 'src/vkgram/styles/vk-base.scss'), 'utf8');
    // правило живёт в конце файла (каскад vk-base: селекторы стилизуются по три раза,
    // новые перекрытия — только в конец); класс html — vkgram-telegram-active, который
    // ставит VKPageTelegram, пока шелл Web K на экране
    expect(scss).toContain('html.is-vkgram:not(.vkgram-telegram-active) .chat-tips-toggle');
  });
});
