import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import VKComposer from '@/vkgram/components/VKComposer';
import * as nativeVideoRecorder from '@helpers/videoRecorder/nativeVideoRecorder';

const managers = vi.hoisted(() => ({
  appMessagesManager: {
    canSendToPeer: vi.fn(async() => true),
    sendText: vi.fn(async() => ({})),
    sendFile: vi.fn(async() => ({})),
    sendGrouped: vi.fn(async() => ({})),
    editMessage: vi.fn(async() => ({})),
    setTyping: vi.fn(async() => ({}))
  },
  appDraftsManager: {
    getDraft: vi.fn(async() => undefined),
    setDraft: vi.fn(async() => ({})),
    clearDraft: vi.fn(async() => ({}))
  },
  appPeersManager: {
    getPeer: vi.fn(() => undefined)
  },
  appStickersManager: {
    getAllStickers: vi.fn(async() => ({sets: []})),
    saveRecentSticker: vi.fn(async() => ({}))
  },
  appGifsManager: {
    getGifs: vi.fn(async() => []),
    searchGifs: vi.fn(async() => ({documents: []})),
    addRecentGif: vi.fn(async() => ({}))
  }
}));

vi.mock('@lib/rootScope', () => ({
  default: {managers, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

// the attach menu is Web K's own widget, out of scope here
vi.mock('@components/buttonMenuToggle', () => ({default: vi.fn()}));
vi.mock('@components/wrappers/videoTsx', () => ({default: (): null => null}));
vi.mock('@lib/opusDecodeController', () => ({
  default: {decode: vi.fn(async() => ({blob: new Blob(['a'], {type: 'audio/ogg'})})), setKeepAlive: vi.fn()}
}));

// jsdom has no 2d canvas — the poster would throw like it does for Web K's own capture
vi.mock('@helpers/createPoster', () => ({
  createPosterFromMedia: vi.fn(async() => ({blob: new Blob(['p'], {type: 'image/jpeg'}), size: {width: 400, height: 400}}))
}));

vi.mock('@helpers/voiceRecorder/nativeVoiceRecorder', () => ({
  default: class {},
  isNativeVoiceRecorderSupported: () => false
}));

// a recorder that emits a playable webm at stop() the way MediaRecorder does
vi.mock('@helpers/videoRecorder/nativeVideoRecorder', () => {
  const instances: {released: boolean, switched: boolean}[] = [];
  class FakeVideoRecorder {
    stream = {getTracks: (): never[] => [], getVideoTracks: () => [{stop: vi.fn(), getSettings: () => ({})}]};
    onstop: () => void = () => {};
    ondataavailable: (blob: Blob) => void = () => {};
    released = false;
    switched = false;
    constructor() { instances.push(this); }
    async start() {}
    async stop() {
      this.ondataavailable(new Blob(['x'], {type: 'video/webm'}));
      this.onstop();
    }
    releaseStream() { this.released = true; }
    async switchCamera() {
      this.switched = true;
      this.stream = {getTracks: (): never[] => [], getVideoTracks: () => [{stop: vi.fn(), getSettings: () => ({})}]};
    }
  }
  return {
    default: FakeVideoRecorder,
    isNativeVideoRecorderSupported: vi.fn(() => true),
    instances
  };
});

// jsdom has no mediaDevices — two cameras make the flip button appear
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {enumerateDevices: vi.fn(async() => [
    {kind: 'videoinput', deviceId: 'cam-1'},
    {kind: 'videoinput', deviceId: 'cam-2'}
  ])}
});

// jsdom has no ResizeObserver (the waveform canvas and the ring measure through it)
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// a minimal audio graph node: both waveform analysers tap it via ScriptProcessor
const fakeAudioNode = () => ({
  context: {
    destination: {},
    createScriptProcessor: () => ({onaudioprocess: null as any, connect: vi.fn(), disconnect: vi.fn()})
  },
  connect: vi.fn(),
  disconnect: vi.fn()
});

// window.Recorder (opus-recorder's global) — the non-native voice recorder path
class FakeVoiceRecorder {
  sourceNode = fakeAudioNode();
  onstop: () => void = () => {};
  ondataavailable: (data: Uint8Array) => void = () => {};
  async start() {}
  async stop() {
    this.ondataavailable(new Uint8Array(63));
    this.onstop();
  }
};
(window as any).Recorder = FakeVoiceRecorder;

const recorderInstances = () => (nativeVideoRecorder as any).instances as {released: boolean, switched: boolean}[];

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  recorderInstances().length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

const mount = async() => {
  dispose.push(render(() => <VKComposer peerId={'-1' as unknown as PeerId} />, document.body));
  // the composer appears once rightsCanSend resolves (a couple of microtasks)
  for(let i = 0; i < 10; ++i) await Promise.resolve();
  return document.body;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('VKComposer round video recording UI', () => {
  it('replaces the row with the preview, the timer and the controls', async() => {
    vi.useFakeTimers();
    const root = await mount();

    const startButton = root.querySelector('button[aria-label="Записать видео-кружок"]') as HTMLButtonElement;
    expect(startButton).toBeTruthy();
    startButton.click();
    await vi.advanceTimersByTimeAsync(2500);

    // the preview is part of the composer flow now, not a floating circle
    expect(root.querySelector('.vk-composer-rec-preview video')).toBeTruthy();
    const status = root.querySelector('.vk-composer-rec-status');
    expect(status).toBeTruthy();
    expect(status!.querySelector('.vk-composer-rec-time')!.textContent).toBe('0:02');
    expect(status!.querySelector('.vk-composer-rec-label')!.textContent).toBe('Видео-кружок');
    expect(root.querySelector('button[aria-label="Отменить запись"]')).toBeTruthy();
    expect(root.querySelector('button[aria-label="Отправить видео-кружок"]')).toBeTruthy();
    // the camera button took the focus for keyboard users
    expect(document.activeElement).toBe(root.querySelector('button[aria-label="Отменить запись"]'));
    // the regular input is out of the way while recording
    expect(root.querySelector('div.vk-composer-input[contenteditable]')).toBeFalsy();
  });

  it('sends the circle on the send button and returns to the input', async() => {
    vi.useFakeTimers();
    const root = await mount();

    (root.querySelector('button[aria-label="Записать видео-кружок"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(2500);

    (root.querySelector('button[aria-label="Отправить видео-кружок"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(100);

    expect(managers.appMessagesManager.sendFile).toHaveBeenCalledTimes(1);
    expect(managers.appMessagesManager.sendFile).toHaveBeenCalledWith(expect.objectContaining({
      isRoundMessage: true,
      width: 400,
      height: 400,
      objectURLBlob: expect.any(Blob),
      thumb: {blob: expect.any(Blob), size: {width: 400, height: 400}}
    }));
    expect(recorderInstances()[0].released).toBe(true);
    // the composer is back with the input focused
    expect(root.querySelector('.vk-composer-rec-status')).toBeFalsy();
    expect(document.activeElement).toBe(root.querySelector('div.vk-composer-input[contenteditable]'));
  });

  it('cancels the recording without sending', async() => {
    vi.useFakeTimers();
    const root = await mount();

    (root.querySelector('button[aria-label="Записать видео-кружок"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(2500);

    (root.querySelector('button[aria-label="Отменить запись"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(100);

    expect(managers.appMessagesManager.sendFile).not.toHaveBeenCalled();
    expect(root.querySelector('.vk-composer-rec-preview')).toBeFalsy();
    expect(root.querySelector('.vk-composer-rec-status')).toBeFalsy();
    expect(root.querySelector('button[aria-label="Записать видео-кружок"]')).toBeTruthy();
  });

  it('cancels on Escape', async() => {
    vi.useFakeTimers();
    const root = await mount();

    (root.querySelector('button[aria-label="Записать видео-кружок"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(2500);
    expect(root.querySelector('.vk-composer-rec-status')).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    await vi.advanceTimersByTimeAsync(100);

    expect(managers.appMessagesManager.sendFile).not.toHaveBeenCalled();
    expect(root.querySelector('.vk-composer-rec-status')).toBeFalsy();
  });

  it('offers the camera flip with two cameras and switches mid-recording', async() => {
    vi.useFakeTimers();
    const root = await mount();

    (root.querySelector('button[aria-label="Записать видео-кружок"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(2500);

    const flip = root.querySelector('button[aria-label="Переключить камеру"]') as HTMLButtonElement;
    expect(flip).toBeTruthy();
    expect(flip.getAttribute('aria-label')).toBe('Переключить камеру');

    flip.click();
    await vi.advanceTimersByTimeAsync(100);

    expect(recorderInstances()[0].switched).toBe(true);
    // the live preview follows the new camera
    const video = root.querySelector('.vk-composer-rec-video video') as HTMLVideoElement;
    expect(video.srcObject).toBeTruthy();
  });

  it('fills the recording ring and sends itself at the 60s cap', async() => {
    vi.useFakeTimers();
    const root = await mount();

    (root.querySelector('button[aria-label="Записать видео-кружок"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(500);

    const circle = root.querySelector('.vk-composer-rec-ring .progress-ring__circle') as SVGCircleElement;
    expect(circle).toBeTruthy();
    const offsetAtStart = parseFloat(circle.style.strokeDashoffset);

    await vi.advanceTimersByTimeAsync(30_000);
    // half of the 60s cap: half the ring is gone (r = 200/2 - 2·3.5 = 93)
    const offsetAtMid = parseFloat(circle.style.strokeDashoffset);
    expect(offsetAtMid).toBeLessThan(offsetAtStart);
    expect(Math.abs(offsetAtMid - 2 * Math.PI * 93 / 2)).toBeLessThan(2);

    // the cap: the clip sends itself and the panel closes
    await vi.advanceTimersByTimeAsync(30_500);
    expect(managers.appMessagesManager.sendFile).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.vk-composer-rec-status')).toBeFalsy();
  });

  it('records a voice message with live bars and the waveform payload', async() => {
    vi.useFakeTimers();
    const root = await mount();

    (root.querySelector('button[aria-label="Записать голосовое сообщение"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(2000);

    // the recording bar carries the live waveform canvas and the timer
    expect(root.querySelector('.vk-composer-rec-wave canvas')).toBeTruthy();
    expect(root.querySelector('.vk-composer-rec-time')!.textContent).toBe('0:02');

    (root.querySelector('button[aria-label="Отправить голосовое сообщение"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(100);

    expect(managers.appMessagesManager.sendFile).toHaveBeenCalledWith(expect.objectContaining({
      isVoiceMessage: true,
      waveform: expect.any(Uint8Array)
    }));
    // the bar is gone, the input is back
    expect(root.querySelector('.vk-composer-rec-wave')).toBeFalsy();
    expect(root.querySelector('div.vk-composer-input[contenteditable]')).toBeTruthy();
  });

  it('offers the emoji picker button with dialog semantics', async() => {
    const root = await mount();
    const button = root.querySelector('button[aria-label="Эмодзи, стикеры, GIF"]') as HTMLButtonElement;

    // the original Web K picker is built lazily on the first click (its module
    // graph cannot load under jsdom), so only the button wiring is checked here
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.querySelector('svg')).toBeTruthy();
  });

  it('does not offer circle recording in an unsupported browser', async() => {
    (nativeVideoRecorder as any).isNativeVideoRecorderSupported.mockReturnValueOnce(false);
    const root = await mount();
    await flush();

    expect(root.querySelector('button[aria-label="Записать видео-кружок"]')).toBeFalsy();
    expect(root.querySelector('button[aria-label="Записать голосовое сообщение"]')).toBeTruthy();
  });
});
