document.addEventListener('DOMContentLoaded', () => {
  // 1. Elements
  const trigger = document.getElementById('admin-profile-trigger');
  const drawer = document.getElementById('admin-drawer');
  const overlay = document.getElementById('admin-drawer-overlay');
  const closeBtn = document.getElementById('admin-drawer-close');

  const uploadBtn = document.getElementById('avatar-upload-btn');
  const fileInput = document.getElementById('avatar-file-input');
  const saveBtn = document.getElementById('save-profile-btn');

  const avatarImg = document.getElementById('drawer-avatar-src');
  const headerImg = document.querySelector('.admin-profile-avatar img');

  const viewMode = document.getElementById('profile-view-mode');
  const editMode = document.getElementById('profile-edit-mode');
  const toggleEditBtn = document.getElementById('toggle-edit-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');

  // Guard clause: Exit safely if drawer components are missing
  if (!trigger || !drawer) return;

  // 2. View / Edit Mode Toggles
  toggleEditBtn?.addEventListener('click', () => {
    viewMode?.classList.add('hidden');
    editMode?.classList.remove('hidden');
  });

  cancelEditBtn?.addEventListener('click', () => {
    editMode?.classList.add('hidden');
    viewMode?.classList.remove('hidden');
  });

  // 3. Drawer Controls
  function openDrawer() {
    drawer.classList.add('open');
    overlay?.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay?.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  trigger.addEventListener('click', openDrawer);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDrawer();
    }
  });

  closeBtn?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // 4. File Upload & Preview
  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f || !avatarImg) return;
    avatarImg.src = URL.createObjectURL(f);
  });

  // 5. Update Profile Handler
  saveBtn?.addEventListener('click', async () => {
    const fd = new FormData();
    const firstName = document.getElementById('profile-first-name')?.value || '';
    const middleName = document.getElementById('profile-middle-name')?.value || '';
    const lastName = document.getElementById('profile-last-name')?.value || '';
    const contact = document.getElementById('profile-contact')?.value || '';

    fd.append('first_name', firstName);
    fd.append('middle_name', middleName);
    fd.append('last_name', lastName);
    fd.append('contact_number', contact);

    const file = fileInput?.files?.[0];
    if (file) fd.append('avatar', file);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const res = await fetch('/update-profile', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Update failed');

      const bust = '?t=' + Date.now();
      if (data.profile?.admin_profile) {
        if (avatarImg) avatarImg.src = data.profile.admin_profile + bust;
        if (headerImg) headerImg.src = data.profile.admin_profile + bust;
      }

      // Update static view text live without refreshing
      updateViewDisplay(firstName, middleName, lastName, contact);

      // Return to view mode
      editMode?.classList.add('hidden');
      viewMode?.classList.remove('hidden');

      alert('Profile updated successfully!');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to update profile');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
  });

  // Helper function to dynamically sync View mode values on success
  function updateViewDisplay(first, middle, last, contact) {
    const values = viewMode?.querySelectorAll('.info-value');
    if (!values) return;

    if (values[0]) values[0].textContent = first;
    if (values[1]) values[1].textContent = middle || '—';
    if (values[2]) values[2].textContent = last;
    if (values[4]) values[4].textContent = contact || '—';

    const drawerName = document.querySelector('.drawer-name');
    if (drawerName) drawerName.textContent = `${first} ${last}`;
  }
});