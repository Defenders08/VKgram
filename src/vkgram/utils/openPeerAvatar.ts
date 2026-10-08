import type {JSX} from 'solid-js';
import rootScope from '@lib/rootScope';
import openAvatarViewer from '@components/mediaViewer/openAvatarViewer';

/**
 * Opens Web K's own avatar viewer (the one the profile in the right sidebar uses) on the peer's current
 * photo: it pages through all the profile photos by itself (arrows, keyboard, swipe, the counter).
 * Returns `false` when the peer has no photo, so the caller can do something else (for my own page —
 * offer to upload one).
 */
export async function openPeerAvatar(target: HTMLElement, peerId: PeerId): Promise<boolean> {
  const photo = await rootScope.managers.appProfileManager.getFullPhoto(peerId);
  if(photo?._ !== 'photo') return false;

  await openAvatarViewer(target, peerId, () => true, undefined, undefined, undefined, photo);
  return true;
}

/**
 * Attributes that make any element with an avatar in it open the viewer on click / Enter / Space.
 * `onEmpty` runs when there is nothing to show.
 */
export function avatarViewAttrs(
  peerId: PeerId | (() => PeerId),
  onEmpty?: () => void
): JSX.HTMLAttributes<HTMLDivElement> {
  const open = (el: HTMLElement) => {
    const id = typeof(peerId) === 'function' ? peerId() : peerId;
    openPeerAvatar(el, id).then((opened) => {
      if(!opened) onEmpty?.();
    });
  };

  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': 'Открыть фотографию',
    onClick: (e) => open(e.currentTarget),
    onKeyDown: (e) => {
      if(e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open(e.currentTarget);
    }
  };
}
