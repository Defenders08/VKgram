import {createSignal, For, onMount, Show} from 'solid-js';
import rootScope from '@lib/rootScope';
import VKModal from '@/vkgram/components/VKModal';
import VKIcon from '@/vkgram/components/VKIcons';
import {apiErrorType, openVKModal} from '@/vkgram/modals';

// Telegram answers in the language of the session (English for Web K); the usual options are put
// into Russian here, anything not in the list is shown as the server wrote it
const RU: Record<string, string> = {
  'What is wrong with this message?': 'Что не так с этим сообщением?',
  'What is wrong with this channel?': 'Что не так с этим каналом?',
  'I don\'t like it': 'Мне это не нравится',
  'Child abuse': 'Насилие над детьми',
  'Violence': 'Насилие',
  'Illegal goods and services': 'Незаконные товары и услуги',
  'Illegal adult content': 'Незаконный контент для взрослых',
  'Personal data': 'Персональные данные',
  'Scam or fraud': 'Мошенничество',
  'Copyright': 'Нарушение авторских прав',
  'Spam': 'Спам',
  'Other': 'Другое',
  'It\'s not illegal, but must be taken down': 'Это не запрещено, но должно быть удалено'
};
const tr = (text: string) => RU[text] ?? text;

type Option = {text: string, option: Uint8Array};
type Step =
  | {kind: 'choose', title: string, options: Option[]}
  | {kind: 'comment', option: Uint8Array, optional: boolean}
  | {kind: 'done'};

/**
 * «Пожаловаться»: Web K's report flow in a `VKModal`. It is the same conversation with the server
 * as Web K's own window (`messages.report`): an empty option asks what can be reported, every
 * answer is either a further question, a request for a comment, or the end. «Назад» steps back
 * through the questions already answered.
 */
export default function VKReportModal(props: {peerId: PeerId, mids: number[], onClose: () => void}) {
  const [steps, setSteps] = createSignal<Step[]>([]);
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal<string>();
  const [comment, setComment] = createSignal('');

  const current = () => steps()[steps().length - 1];

  const send = async(option: Uint8Array, message = '') => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await rootScope.managers.appMessagesManager.reportMessages(props.peerId, props.mids, option, message);

      if(result?._ === 'reportResultChooseOption') {
        setSteps([...steps(), {kind: 'choose', title: result.title, options: result.options}]);
      } else if(result?._ === 'reportResultAddComment') {
        setComment('');
        setSteps([...steps(), {kind: 'comment', option: result.option, optional: !!result.pFlags?.optional}]);
      } else {
        setSteps([...steps(), {kind: 'done'}]);
      }
    } catch(err) {
      console.error('VKgram: messages.report failed', err);
      setError(apiErrorType(err) === 'MESSAGE_ID_INVALID' ?
        'Эту публикацию уже нельзя оценить.' :
        'Не удалось отправить жалобу. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  onMount(() => send(new Uint8Array()));

  const back = () => {
    setError(undefined);
    setSteps(steps().slice(0, -1));
  };

  const canGoBack = () => steps().length > 1 && current()?.kind !== 'done';

  return (
    <VKModal title="Пожаловаться" width={400} closeDisabled={busy() && !!current()} onClose={props.onClose}>
      <div class="vk-modal-body vk-report">
        <Show when={error()}>
          <p class="vk-modal-error" role="alert">{error()}</p>
        </Show>

        <Show when={!current() && busy()}>
          <p class="vk-page-text vk-page-text-secondary">Загрузка…</p>
        </Show>

        <Show when={current()?.kind === 'choose' ? (current() as Extract<Step, {kind: 'choose'}>) : undefined} keyed>
          {(step) => (
            <>
              <h3 class="vk-settings-legend">{tr(step.title)}</h3>
              <ul class="vk-report-list">
                <For each={step.options}>
                  {(item) => (
                    <li>
                      <button type="button" class="vk-report-row" disabled={busy()} onClick={() => send(item.option)}>
                        <span>{tr(item.text)}</span>
                        <VKIcon name="forward" size={14} />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </Show>

        <Show when={current()?.kind === 'comment' ? (current() as Extract<Step, {kind: 'comment'}>) : undefined} keyed>
          {(step) => (
            <>
              <h3 class="vk-settings-legend">Расскажите подробнее</h3>
              <textarea
                class="vk-textarea"
                rows={4}
                maxLength={500}
                placeholder={step.optional ? 'Комментарий (необязательно)' : 'Комментарий'}
                value={comment()}
                onInput={(e) => setComment(e.currentTarget.value)}
              />
              <p class="vk-settings-caption vk-page-text-secondary">{comment().length} / 500</p>
            </>
          )}
        </Show>

        <Show when={current()?.kind === 'done'}>
          <h3 class="vk-settings-legend">Жалоба отправлена</h3>
          <p class="vk-page-text">Спасибо. Мы рассмотрим её и примем меры, если это нарушает правила.</p>
        </Show>
      </div>

      <div class="vk-modal-foot">
        <Show when={current()?.kind === 'done'} fallback={
          <>
            <Show when={current()?.kind === 'comment'}>
              <button
                type="button"
                class="vk-button"
                disabled={busy() || (!(current() as Extract<Step, {kind: 'comment'}>).optional && !comment().trim())}
                onClick={() => send((current() as Extract<Step, {kind: 'comment'}>).option, comment().trim())}
              >
                {busy() ? 'Отправка…' : 'Отправить'}
              </button>
            </Show>
            <Show when={canGoBack()}>
              <button type="button" class="vk-button vk-button-secondary" disabled={busy()} onClick={back}>Назад</button>
            </Show>
            <button type="button" class="vk-button vk-button-secondary" onClick={props.onClose}>Отмена</button>
          </>
        }>
          <button type="button" class="vk-button" onClick={props.onClose}>Готово</button>
        </Show>
      </div>
    </VKModal>
  );
}

export const openVKReport = (peerId: PeerId, mids: number[]) =>
  openVKModal((p) => <VKReportModal peerId={peerId} mids={mids} onClose={p.onClose} />);
