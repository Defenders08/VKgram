import {createMemo, Show} from 'solid-js';
import type {User} from '@layer';
import getUserStatusString from '@components/wrappers/getUserStatusString';

/**
 * «online» / «был(а) в сети …» beside a user's name, in the manner of the old
 * VK (a quiet grey line, blue while online). Nothing is determined here: the
 * text is Web K's own `getUserStatusString` (the one its chat top bar and
 * profile use), read from `user.status` (`userStatus*`) of the reactive peer
 * store, so it follows Telegram's status updates and the person's privacy —
 * a hidden status is drawn as Telegram words it («был(а) недавно» etc.).
 * Bots and deleted accounts get nothing.
 */
export default function VKUserStatus(props: {user: User.user | undefined}) {
  const isVisible = () => !!props.user && !props.user.pFlags?.deleted && !props.user.pFlags?.bot;
  const isOnline = () => props.user?.status?._ === 'userStatusOnline';
  // re-read whenever the store hands over a new status
  const text = createMemo(() => {
    const user = props.user;
    void user?.status;
    return isVisible() ? getUserStatusString(user) : undefined;
  });

  return (
    <Show when={text()}>
      <span class="vk-user-status" classList={{'is-online': isOnline()}}>{text()}</span>
    </Show>
  );
}
