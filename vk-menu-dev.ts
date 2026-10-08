// dev page for the mobile side menu: loads vk-base.scss only, no app
import './src/vkgram/styles/vk-base.scss';

document.getElementById('night-toggle')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('night');
});
