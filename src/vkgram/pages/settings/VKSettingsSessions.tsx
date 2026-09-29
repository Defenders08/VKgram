import {createSignal, For, Show} from 'solid-js';
import type {Authorization} from '@layer';
import rootScope from '@lib/rootScope';
import {formatFullSentTime} from '@helpers/date';
import getAuthorizationErrorLangKey from '@helpers/getAuthorizationErrorLangKey';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';

/**
 * Active sessions (in Telegram each device is a session) — the data and the
 * actions of Web K's active sessions tab: appAccountManager.getAuthorizations
 * and resetAuthorization, behind the same confirmation.
 */
export default function VKSettingsSessions() {
  const managers = rootScope.managers.appAccountManager;
  const [sessions, setSessions] = createSignal<Authorization.authorization[]>();

  const refresh = () => managers.getAuthorizations().then((result) => {
    const list = result.authorizations as Authorization.authorization[];
    // the current one first, then by last activity
    setSessions([...list].sort((a, b) => +!!b.pFlags.current - +!!a.pFlags.current || b.date_active - a.date_active));
  }, (err) => {
    console.error('VKgram: getAuthorizations failed', err);
    setSessions((sessions) => sessions ?? []);
  });
  refresh();

  const terminate = async(authorization: Authorization.authorization) => {
    try {
      await confirmationPopup({
        titleLangKey: 'AreYouSureSessionTitle',
        descriptionLangKey: 'TerminateSessionText',
        button: {langKey: 'Terminate', isDanger: true}
      });
    } catch{
      return;
    }

    try {
      if(await managers.resetAuthorization(authorization.hash)) {
        setSessions((list) => list.filter((item) => '' + item.hash !== '' + authorization.hash));
      }
    } catch(err) {
      toastNew({langPackKey: getAuthorizationErrorLangKey(err as ApiError)});
    }
  };

  return (
    <Show when={sessions()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      <ul class="vk-settings-list">
        <For each={sessions()}>
          {(session) => (
            <li class="vk-settings-session">
              <div>
                <b>{session.device_model}</b>
                <Show when={session.pFlags.current}>
                  <span class="vk-page-text-secondary"> — этот сеанс</span>
                </Show>
              </div>
              <div class="vk-page-text-secondary">
                {[session.app_name, session.app_version].filter(Boolean).join(' ')}
                {' · '}
                {[session.platform, session.system_version].filter(Boolean).join(' ')}
              </div>
              <div class="vk-page-text-secondary">
                {[session.country, session.ip].filter(Boolean).join(', ')}
                <Show when={!session.pFlags.current}>
                  {' · '}{formatFullSentTime(session.date_active)}
                </Show>
              </div>
              <Show when={!session.pFlags.current}>
                <button type="button" class="vk-link-button" onClick={() => terminate(session)}>
                  Завершить сеанс
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
