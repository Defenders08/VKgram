import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import MessageMeta from '@/vkgram/components/MessageMeta';
import type {Message} from '@layer';

// the real formatter needs the i18n language, which the tests do not boot
vi.mock('@helpers/date', () => ({
  formatDateAccordingToTodayNew: (date: Date) => `${date.getHours()}:00`
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
});

const message = () => ({_: 'message', mid: 5, date: 1759660000, message: 'привет'} as unknown as Message.message);

const mount = (props: {status?: 'pending' | 'sent' | 'read'}) => {
  const root = document.body;
  dispose.push(render(() => <MessageMeta message={message()} variant="chat" status={props.status} />, root));
  return root;
};

describe('message read status ticks (✓ / ✓✓)', () => {
  it('shows no ticks for an incoming message', () => {
    const root = mount({});
    expect(root.querySelector('.vk-message-ticks')).toBeFalsy();
    expect(root.querySelector('.vk-custom-message-time')!.textContent).toBeTruthy();
  });

  it('shows one check while sent and two when read', () => {
    const sent = mount({status: 'sent'});
    const sentTicks = sent.querySelector('.vk-message-ticks')!;
    expect(sentTicks).toBeTruthy();
    expect(sentTicks.classList.contains('is-read')).toBe(false);
    // one check = one stroked path
    expect(sentTicks.querySelectorAll('path').length).toBe(1);
    expect(sentTicks.getAttribute('aria-label')).toBe('Доставлено');

    while(dispose.length) dispose.pop()?.();
    document.body.innerHTML = '';

    const read = mount({status: 'read'});
    const readTicks = read.querySelector('.vk-message-ticks')!;
    expect(readTicks.classList.contains('is-read')).toBe(true);
    // two checks = two stroked paths
    expect(readTicks.querySelectorAll('path').length).toBe(2);
    expect(readTicks.getAttribute('aria-label')).toBe('Прочитано');
  });

  it('marks the message still on its way as pending', () => {
    const root = mount({status: 'pending'});
    const ticks = root.querySelector('.vk-message-ticks')!;
    expect(ticks.classList.contains('is-pending')).toBe(true);
    expect(ticks.getAttribute('aria-label')).toBe('Отправляется');
  });
});
