import rootScope from '@lib/rootScope';
import {openVKSection} from '@/vkgram/sections';
import {openVKProfilePeer} from '@/vkgram/pages/profile/route';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {isBroadcastChannel} from '@/vkgram/hooks/useSubscribedChannels';

/**
 * The page of another user: VKgram's own profile page inside «Моя страница», on desktop and on
 * a phone alike (the phone used to be sent to Web K's profile in the right column of its chat).
 */
export function openVKProfile(peerId: PeerId) {
  // brings the section up and drops the profile that was open in it
  openVKSection('profile');
  // my own id is simply «Моя страница»
  if(peerId !== rootScope.myId) openVKProfilePeer(peerId);
}

/**
 * Where a click on a peer leads: a broadcast channel — to its page in
 * «Каналы», everything else — to the profile, as before. One rule for every
 * name, avatar and header of a peer.
 */
export function openVKPeerPage(peerId: PeerId, peer: unknown) {
  if(isBroadcastChannel(peer)) openVKChannelPage(peerId);
  else openVKProfile(peerId);
}
