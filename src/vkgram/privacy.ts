import {createMemo, createSignal, onCleanup} from 'solid-js';
import type {InputPrivacyKey, InputPrivacyRule, PrivacyRule, Update} from '@layer';
import rootScope from '@lib/rootScope';
import getPrivacyRulesDetails from '@appManagers/utils/privacy/getPrivacyRulesDetails';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import convertInputKeyToKey from '@helpers/string/convertInputKeyToKey';
import {toastNew} from '@components/toast';

export {PrivacyType};

export type VKPrivacyKey = InputPrivacyKey['_'];

export const VK_PRIVACY_TYPE_TITLES: {[type in PrivacyType]: string} = {
  [PrivacyType.Everybody]: 'Все',
  [PrivacyType.Contacts]: 'Мои контакты',
  [PrivacyType.Nobody]: 'Никто'
};

// What getPrivacyRulesDetails understands; anything else (premium users,
// close friends…) would be lost by a simple rewrite, so such rules stay
// read-only in VKgram.
const SIMPLE_RULES = new Set<PrivacyRule['_']>([
  'privacyValueAllowAll',
  'privacyValueAllowContacts',
  'privacyValueDisallowAll',
  'privacyValueAllowUsers',
  'privacyValueDisallowUsers',
  'privacyValueAllowChatParticipants',
  'privacyValueDisallowChatParticipants',
  'privacyValueAllowBots',
  'privacyValueDisallowBots'
]);

/**
 * One privacy key, read and written through Web K's appPrivacyManager.
 * Changing the base option keeps the user's exceptions exactly like Web K's
 * PrivacySection does on save: «always allow» goes away under «Все», «never
 * allow» under «Никто».
 */
export function createVKPrivacy(key: VKPrivacyKey) {
  const [rules, setRules] = createSignal<PrivacyRule[]>();
  const [saving, setSaving] = createSignal(false);

  const details = createMemo(() => rules() && getPrivacyRulesDetails(rules()));
  const isSimple = createMemo(() => !!rules()?.every((rule) => SIMPLE_RULES.has(rule._)));
  const exceptionsCount = createMemo(() => {
    const d = details();
    if(!d) return 0;
    return d.allowPeers.users.length + d.allowPeers.chats.length +
      d.disallowPeers.users.length + d.disallowPeers.chats.length;
  });

  rootScope.managers.appPrivacyManager.getPrivacy(key).then(setRules);

  // changes made elsewhere (Web K's own privacy tabs, another client)
  const privacyKey = convertInputKeyToKey(key);
  const onUpdate = (update: Update.updatePrivacy) => {
    if(update.key._ === privacyKey && !saving()) {
      rootScope.managers.appPrivacyManager.getPrivacy(key).then(setRules);
    }
  };
  rootScope.addEventListener('privacy_update', onUpdate);
  onCleanup(() => rootScope.removeEventListener('privacy_update', onUpdate));

  const setType = async(type: PrivacyType) => {
    const d = details();
    if(!d || !isSimple() || saving()) return;

    const input: InputPrivacyRule[] = [{
      _: type === PrivacyType.Everybody ? 'inputPrivacyValueAllowAll' :
        type === PrivacyType.Contacts ? 'inputPrivacyValueAllowContacts' :
        'inputPrivacyValueDisallowAll'
    }];

    const toUsers = (ids: UserId[]) => Promise.all(ids.map((id) => rootScope.managers.appUsersManager.getUserInput(id)));
    if(type !== PrivacyType.Everybody) {
      if(d.allowPeers.chats.length) input.push({_: 'inputPrivacyValueAllowChatParticipants', chats: d.allowPeers.chats});
      if(d.allowPeers.users.length) input.push({_: 'inputPrivacyValueAllowUsers', users: await toUsers(d.allowPeers.users)});
      if(d.allowMiniApps) input.push({_: 'inputPrivacyValueAllowBots'});
    }

    if(type !== PrivacyType.Nobody) {
      if(d.disallowPeers.chats.length) input.push({_: 'inputPrivacyValueDisallowChatParticipants', chats: d.disallowPeers.chats});
      if(d.disallowPeers.users.length) input.push({_: 'inputPrivacyValueDisallowUsers', users: await toUsers(d.disallowPeers.users)});
      if(d.disallowMiniApps) input.push({_: 'inputPrivacyValueDisallowBots'});
    }

    setSaving(true);
    try {
      // the server's answer, not the local echo (which holds input rules)
      setRules(await rootScope.managers.appPrivacyManager.setPrivacy(key, input));
    } catch(err) {
      console.error('VKgram: setPrivacy failed', err);
      toastNew({langPackKey: 'Error.AnError'});
      // re-render the controls from the unchanged rules
      setRules((rules) => rules && [...rules]);
    } finally {
      setSaving(false);
    }
  };

  return {
    rules,
    type: () => details()?.type,
    isSimple,
    exceptionsCount,
    saving,
    setType
  };
}
