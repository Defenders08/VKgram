// dev page for «Настроек»: loads vk-base.scss only, no app
import './src/vkgram/styles/vk-base.scss';

document.getElementById('night-toggle')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('night');
});

// the rail and the strip: a click moves the active tab of its own strip (the real
// behavior — arrows, the panel swap — is covered by the component tests)
for(const list of document.querySelectorAll('.vk-tabs-list')) {
  list.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest('.vk-tab');
    if(!tab) return;
    for(const other of list.querySelectorAll('.vk-tab')) {
      other.classList.toggle('is-active', other === tab);
      other.setAttribute('aria-selected', other === tab ? 'true' : 'false');
    }
  });
}
