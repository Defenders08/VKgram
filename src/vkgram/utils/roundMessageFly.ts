/**
 * A handshake between the composer and the message list. On «отправить» the composer
 * leaves the viewport rect of its recording preview, and the optimistic circle in the
 * chat takes it to fly from that spot into its place, like the official clients do.
 * Consumed once and expired, so a circle rendered later (a reload, another chat) never
 * inherits a stale flight.
 */

let source: {peerId: PeerId, rect: DOMRect, at: number} | undefined;
const LIFETIME = 5000;

export function setRoundFlySource(peerId: PeerId, rect: DOMRect) {
  source = {peerId, rect, at: Date.now()};
}

export function takeRoundFlySource(peerId: PeerId): DOMRect | undefined {
  if(!source || source.peerId !== peerId || Date.now() - source.at > LIFETIME) {
    source = undefined;
    return undefined;
  }

  const rect = source.rect;
  source = undefined;
  return rect;
}
