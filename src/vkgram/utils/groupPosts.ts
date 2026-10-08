import type {Message} from '@layer';

export type VKPost = {id: number, messages: Message.message[]};

/**
 * Messages as publications: the several messages of an album (same
 * `grouped_id`, next to each other) are one post, its caption on one of them.
 * Input is expected in the feed's order (newest first); an album reads
 * oldest first, so its messages are reversed inside the post.
 */
export default function groupPosts(messages: Message.message[]): VKPost[] {
  const posts: VKPost[] = [];
  for(const message of messages) {
    const last = posts[posts.length - 1];
    // (a merged feed: the same album id in another channel is another post)
    if(last && message.grouped_id && last.messages[0].grouped_id === message.grouped_id &&
      last.messages[0].peerId === message.peerId) {
      last.messages.push(message);
    } else {
      posts.push({id: message.mid, messages: [message]});
    }
  }

  posts.forEach((post) => post.messages.reverse());
  return posts;
}
