import {createSignal, onCleanup, Show} from 'solid-js';
import type {InputNotifyPeer, InputPeerNotifySettings, PeerNotifySettings, Update} from '@layer';
import rootScope from '@lib/rootScope';
import copy from '@helpers/object/copy';
import convertKeyToInputKey from '@helpers/string/convertKeyToInputKey';
import {MUTE_UNTIL} from '@appManagers/constants';
import {toastNew} from '@components/toast';

export type VKNotifyScope =
  | InputNotifyPeer.inputNotifyUsers['_']
  | InputNotifyPeer.inputNotifyChats['_']
  | InputNotifyPeer.inputNotifyBroadcasts['_'];

/**
 * Notifications for one kind of chats (private / groups / channels) — the
 * same appNotificationsManager settings Web K's notifications tab edits.
 * Unlike that tab, a change is saved at once (no "save on close").
 */
export default function VKSettingsNotifications(props: {scope: VKNotifyScope}) {
  const managers = rootScope.managers.appNotificationsManager;
  const inputNotifyPeer = {_: props.scope} as InputNotifyPeer;

  const [settings, setSettings] = createSignal<PeerNotifySettings>();
  const [enabled, setEnabled] = createSignal(true);
  const [saving, setSaving] = createSignal(false);

  const apply = async(value: PeerNotifySettings) => {
    setSettings(value);
    setEnabled(!(await managers.isMuted(value)));
  };

  Promise.resolve(managers.getNotifySettings(inputNotifyPeer)).then(apply);

  const onUpdate = (update: Update.updateNotifySettings) => {
    if(convertKeyToInputKey(update.peer._) === props.scope) apply(update.notify_settings);
  };
  rootScope.addEventListener('notify_settings', onUpdate);
  onCleanup(() => rootScope.removeEventListener('notify_settings', onUpdate));

  const save = async(changes: {enabled?: boolean, showPreviews?: boolean}) => {
    const current = settings();
    if(!current || saving()) return;

    const input: InputPeerNotifySettings = copy(current) as any;
    input._ = 'inputPeerNotifySettings';
    if(changes.enabled !== undefined) input.mute_until = changes.enabled ? 0 : MUTE_UNTIL;
    if(changes.showPreviews !== undefined) input.show_previews = changes.showPreviews;

    setSaving(true);
    try {
      await managers.updateNotifySettings(inputNotifyPeer, input);
      // the next change must build on this one even before the update echoes
      const saved: PeerNotifySettings = copy(input) as any;
      saved._ = 'peerNotifySettings';
      apply(saved);
    } catch(err) {
      console.error('VKgram: updateNotifySettings failed', err);
      toastNew({langPackKey: 'Error.AnError'});
      apply(current);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={settings()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      <fieldset class="vk-settings-fieldset" disabled={saving()}>
        <label class="vk-settings-checkbox">
          <input
            type="checkbox"
            checked={enabled()}
            onChange={(e) => {
              setEnabled(e.currentTarget.checked);
              save({enabled: e.currentTarget.checked});
            }}
          />
          Показывать уведомления
        </label>
        <label class="vk-settings-checkbox">
          <input
            type="checkbox"
            checked={!!settings().show_previews}
            onChange={(e) => save({showPreviews: e.currentTarget.checked})}
          />
          Показывать текст сообщения
        </label>
      </fieldset>
    </Show>
  );
}
