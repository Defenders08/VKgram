import {openVKSection} from '@/vkgram/sections';
import {openVKChannel} from '@/vkgram/pages/channel/route';

/**
 * A channel's page — in VKgram's own «Каналы», from anywhere. Brings the
 * section up first, then sets the open channel: the route module cannot do
 * the former itself (`sections.ts` imports it, the cycle is one way), so a
 * bare `openVKChannel` only works when «Каналы» is already on screen.
 *
 * NB: lives apart from `channel/route.ts`, which must not import sections.ts.
 */
export function openVKChannelPage(peerId: PeerId) {
  openVKSection('channels');
  openVKChannel(peerId);
}
