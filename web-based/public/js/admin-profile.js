document.addEventListener('DOMContentLoaded', () => {

  const trigger  = document.getElementById('admin-profile-trigger');
  const drawer   = document.getElementById('admin-drawer');
  const overlay  = document.getElementById('admin-drawer-overlay');
  const closeBtn = document.getElementById('admin-drawer-close');

  if (!drawer || !trigger) {
    console.warn('[admin-drawer] required elements missing');
    return;
  }

  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  trigger.addEventListener('click', openDrawer);

  // NEW: keyboard support for the div
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();          // stop page scrolling on Space
      openDrawer();
    }
  });

  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

});