import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// acquireStream is replaced with a scripted source: whatever `state.nextStream`
// holds resolves from the next switchCamera()'s acquisition.
const state = vi.hoisted(() => ({nextStream: undefined as MediaStream | undefined}));
vi.mock('@lib/calls/helpers/acquireStream', () => ({
  default: vi.fn(() => ({
    promise: Promise.resolve(state.nextStream),
    dispose: vi.fn()
  }))
}));
vi.mock('@lib/calls/helpers/stopTrack', () => ({
  default: vi.fn((track: MediaStreamTrack) => (track as any).stop?.())
}));

import NativeVideoRecorder from '@helpers/videoRecorder/nativeVideoRecorder';
import acquireStream from '@lib/calls/helpers/acquireStream';

const fakeTrack = (kind: 'video' | 'audio') => ({
  kind,
  stop: vi.fn(),
  getSettings: () => ({})
}) as any;

const fakeStream = (videoTracks: any[], audioTracks: any[]) => ({
  getVideoTracks: () => videoTracks,
  getAudioTracks: () => audioTracks,
  getTracks: () => [...videoTracks, ...audioTracks]
}) as any;

// a recorder put straight into the recording state, bypassing start()'s
// canvas/MediaRecorder machinery which jsdom has no APIs for
const recordingRecorder = () => {
  const recorder = new NativeVideoRecorder();
  const firstVideo = fakeTrack('video');
  const mic = fakeTrack('audio');
  const firstStream = fakeStream([firstVideo], [mic]);
  (recorder as any).state = 'recording';
  (recorder as any).stream = firstStream;
  (recorder as any).rawStreams = [firstStream];
  (recorder as any).drawVideo = {srcObject: null, play: vi.fn(async() => {})};
  return {recorder, firstVideo, mic, firstStream};
};

beforeEach(() => {
  state.nextStream = undefined;
  vi.mocked(acquireStream).mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NativeVideoRecorder.switchCamera', () => {
  it('swaps the crop source and stops only the replaced camera', async() => {
    const {recorder, firstVideo, mic, firstStream} = recordingRecorder();
    const rearVideo = fakeTrack('video');
    state.nextStream = fakeStream([rearVideo], []);

    await recorder.switchCamera({facingMode: 'environment'});

    expect((recorder as any).stream.getVideoTracks()[0]).toBe(rearVideo);
    expect((recorder as any).drawVideo.srcObject.getVideoTracks()[0]).toBe(rearVideo);
    // the replaced camera dies, the mic of the first stream stays recorded
    expect(firstVideo.stop).toHaveBeenCalled();
    expect(mic.stop).not.toHaveBeenCalled();
    expect(firstStream.getVideoTracks()[0].stop).toHaveBeenCalled();
  });

  it('keeps the constraints of the requested device', async() => {
    const {recorder} = recordingRecorder();
    state.nextStream = fakeStream([fakeTrack('video')], []);

    await recorder.switchCamera({videoDeviceId: 'cam-2'});

    const calls = vi.mocked(acquireStream).mock.calls;
    const constraints = calls[calls.length - 1][0] as MediaStreamConstraints;
    expect(constraints.video).toMatchObject({deviceId: {exact: 'cam-2'}});
    // video-only: the recording already owns a live mic track
    expect(constraints.audio).toBe(false);
  });

  it('leaves the recording untouched when the other camera fails', async() => {
    const {recorder, firstStream, firstVideo} = recordingRecorder();
    const reject = vi.fn();
    vi.mocked(acquireStream).mockImplementationOnce(() => ({
      promise: Promise.reject(new Error('busy')) as any,
      dispose: reject
    }));

    await expect(recorder.switchCamera()).rejects.toThrow('busy');

    expect((recorder as any).stream).toBe(firstStream);
    expect(firstVideo.stop).not.toHaveBeenCalled();
  });

  it('stops the orphaned camera when the recording was canceled mid-switch', async() => {
    const {recorder} = recordingRecorder();
    const orphan = fakeTrack('video');
    const orphanStream = fakeStream([orphan], []);
    // the new camera warms up while the recording is being torn down
    vi.mocked(acquireStream).mockImplementationOnce(() => ({
      promise: new Promise((resolve) => setTimeout(() => resolve(orphanStream), 10)),
      dispose: vi.fn()
    }));

    const switching = recorder.switchCamera();
    (recorder as any).state = 'inactive';
    (recorder as any).stream = undefined;
    (recorder as any).rawStreams = [];
    await switching;

    expect(orphan.stop).toHaveBeenCalled();
    expect((recorder as any).stream).toBeUndefined();
  });

  it('does nothing on an inactive recorder', async() => {
    const recorder = new NativeVideoRecorder();
    await recorder.switchCamera();
    expect(acquireStream).not.toHaveBeenCalled();
  });

  it('stops every stream of the recording on release, mic included', async() => {
    const {recorder, mic, firstStream} = recordingRecorder();
    state.nextStream = fakeStream([fakeTrack('video')], []);
    await recorder.switchCamera();

    recorder.releaseStream();

    expect(mic.stop).toHaveBeenCalled();
    expect(firstStream.getTracks().every((track: any) => track.stop.mock.calls.length)).toBe(true);
  });
});
