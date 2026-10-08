// dev page for the mobile «Друзья» tabs: loads vk-base.scss only, no app
import './src/vkgram/styles/vk-base.scss';

document.getElementById('night-toggle')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('night');
});

const show = (id: string, showIt: boolean) => {
  const layer = document.getElementById(id);
  if(layer) layer.hidden = !showIt;
};

document.getElementById('show-add')?.addEventListener('click', () => show('add-layer', true));
document.getElementById('show-customize')?.addEventListener('click', () => show('customize-layer', true));

for(const id of ['add-layer', 'customize-layer']) {
  document.getElementById(id)?.querySelector('.vk-modal-close')?.addEventListener('click', () => show(id, false));
}

// the tabs of the strips and of the window: a click moves the active one (the real
// behavior — arrows, toggling — is covered by the component tests)
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
