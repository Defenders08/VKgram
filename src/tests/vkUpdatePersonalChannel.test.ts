import {AppProfileManager} from '@appManagers/appProfileManager';
import {PEER_FULL_TTL} from '@appManagers/constants';
import '@helpers/peerIdPolyfill';

// the manager writes the picked channel into its own cache right after the API
// answers: the UI re-reads the cache (through `user_full_update`) instead of
// re-fetching the fullUser, whose answer can lag behind the update
const makeManager = (cachedFull?: Record<string, unknown>, topMessage?: number) => {
  const dispatchEvent = vi.fn();
  const manager = new AppProfileManager();
  Object.assign(manager as any, {
    apiManager: {
      invokeApi: vi.fn(() => Promise.resolve(true))
    },
    appChatsManager: {
      getChannelInput: vi.fn(() => ({_: 'inputChannel', channel_id: 101, access_hash: 'x'}))
    },
    dialogsStorage: {
      getDialogOnly: vi.fn(() => topMessage === undefined ? undefined : {top_message: topMessage})
    },
    rootScope: {
      myId: 1 as UserId,
      dispatchEvent
    },
    usersFull: cachedFull ? {1: cachedFull} : {},
    fullExpiration: {}
  });

  return {manager, dispatchEvent};
};

describe('updatePersonalChannel', () => {
  test('writes the picked channel into the cached full user and keeps it fresh', async() => {
    const cachedFull: Record<string, unknown> = {about: 'x'};
    const {manager, dispatchEvent} = makeManager(cachedFull, 555);

    await manager.updatePersonalChannel(101 as ChatId);

    expect(cachedFull.personal_channel_id).toBe(101);
    expect(cachedFull.personal_channel_message).toBe(555);
    expect(dispatchEvent).toHaveBeenCalledWith('user_full_update', 1);
    expect((manager as any).fullExpiration[(1 as UserId).toPeerId(false)])
      .toBeGreaterThan(Date.now() + PEER_FULL_TTL - 1000);
  });

  test('writes the channel even when its dialog is unknown', async() => {
    const cachedFull: Record<string, unknown> = {};
    const {manager} = makeManager(cachedFull);

    await manager.updatePersonalChannel(101 as ChatId);

    expect(cachedFull.personal_channel_id).toBe(101);
    expect(cachedFull.personal_channel_message).toBeUndefined();
  });

  test('clears the channel on unlink', async() => {
    const cachedFull: Record<string, unknown> = {personal_channel_id: 101, personal_channel_message: 555};
    const {manager, dispatchEvent} = makeManager(cachedFull);

    await manager.updatePersonalChannel();

    expect(cachedFull.personal_channel_id).toBeUndefined();
    expect(cachedFull.personal_channel_message).toBeUndefined();
    expect(dispatchEvent).toHaveBeenCalledWith('user_full_update', 1);
    expect((manager as any).apiManager.invokeApi).toHaveBeenCalledWith(
      'account.updatePersonalChannel',
      {channel: {_: 'inputChannelEmpty'}}
    );
  });
});
