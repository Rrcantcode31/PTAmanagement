document.addEventListener('DOMContentLoaded', () => {
  // 1. Elements
  const trigger   = document.getElementById('admin-profile-trigger');
  const drawer    = document.getElementById('admin-drawer');
  const overlay   = document.getElementById('admin-drawer-overlay');
  const closeBtn  = document.getElementById('admin-drawer-close');

  const uploadBtn = document.getElementById('avatar-upload-btn');
  const fileInput = document.getElementById('avatar-file-input');
  const saveBtn   = document.getElementById('save-profile-btn');
  const cancelBtn = document.getElementById('cancel-profile-btn');

  const avatarImg = document.getElementById('drawer-avatar-src');
  const headerImg = document.querySelector('.admin-profile-avatar img');

  const viewMode      = document.getElementById('profile-view-mode');
  const editMode      = document.getElementById('profile-edit-mode');
  const toggleEditBtn = document.getElementById('toggle-edit-btn');

  if (!trigger || !drawer) return;

  // ==================================================
  // STATE
  // ==================================================
  let pendingFile     = null;   // chosen image, not yet uploaded
  let savedAvatarUrl  = null;   // last known-good avatar URL (server-side)
  let originalValues  = {};     // snapshot of text fields when edit mode started

  // Text field IDs
  const TEXT_FIELDS = {
    first_name:     'profile-first-name',
    middle_name:    'profile-middle-name',
    last_name:      'profile-last-name',
    contact_number: 'profile-contact',
  };

  function readTextValues() {
    const out = {};
    for (const [key, id] of Object.entries(TEXT_FIELDS)) {
      out[key] = document.getElementById(id)?.value ?? '';
    }
    return out;
  }

  function writeTextValues(values) {
    for (const [key, id] of Object.entries(TEXT_FIELDS)) {
      const el = document.getElementById(id);
      if (el) el.value = values[key] ?? '';
    }
  }

  function snapshotValues() {
    originalValues = readTextValues();
  }

  function hasTextChanges() {
    const current = readTextValues();
    return Object.keys(TEXT_FIELDS).some(k => current[k] !== originalValues[k]);
  }

  function isDirty() {
    return !!pendingFile || hasTextChanges();
  }

  function updateSaveButtonState() {
    if (!saveBtn) return;
    const dirty = isDirty();

    saveBtn.disabled = !dirty;
    saveBtn.classList.toggle('is-active', dirty);
  }

  // ==================================================
  // VIEW / EDIT MODE
  // ==================================================
  toggleEditBtn?.addEventListener('click', () => {
    snapshotValues();
    viewMode?.classList.add('hidden');
    editMode?.classList.remove('hidden');
    updateSaveButtonState();
  });

  // ==================================================
  // DRAWER CONTROLS
  // ==================================================
  function openDrawer() {
    drawer.classList.add('open');
    overlay?.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    pendingFile = null;
    if (fileInput) fileInput.value = '';

    // Capture the current avatar as our revert point
    savedAvatarUrl = avatarImg?.src || null;

    snapshotValues();
    updateSaveButtonState();
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
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // ==================================================
  // FILE PICK — preview only, no upload yet
  // ==================================================
  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('Image must be under 3 MB.');
      fileInput.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      fileInput.value = '';
      return;
    }

    pendingFile = file;

    // Instant local preview
    if (avatarImg) avatarImg.src = URL.createObjectURL(file);

    updateSaveButtonState();
  });

  // ==================================================
  // TRACK TEXT INPUT CHANGES
  // ==================================================
  Object.values(TEXT_FIELDS).forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateSaveButtonState);
  });

  // ==================================================
  // CANCEL — discard everything, revert preview
  // ==================================================
  cancelBtn?.addEventListener('click', () => {
    // 1. Discard pending file
    pendingFile = null;
    if (fileInput) fileInput.value = '';

    // 2. Revert avatar preview to the last saved version
    if (savedAvatarUrl && avatarImg) {
      avatarImg.src = savedAvatarUrl;
    }

    // 3. Restore text fields to snapshot
    writeTextValues(originalValues);

    // 4. Return to view mode
    editMode?.classList.add('hidden');
    viewMode?.classList.remove('hidden');

    // 5. Update button state
    updateSaveButtonState();
  });

  // ==================================================
  // SAVE — commits picture and/or text in one go
  // ==================================================
  saveBtn?.addEventListener('click', async () => {

    if (!isDirty()) return;   // shouldn't be clickable anyway

    const current = readTextValues();

    // Client-side validation
    if (!current.first_name.trim()) {
      alert('First name is required.');
      return;
    }
    if (!current.last_name.trim()) {
      alert('Last name is required.');
      return;
    }

    const shouldUploadPicture = !!pendingFile;
    const shouldUpdateText    = hasTextChanges();

    const originalHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

    let uploadedImageUrl = null;
    let textResult       = null;

    try {

      // ---- 1. Upload picture (if pending) ----
      if (shouldUploadPicture) {
        const fd = new FormData();
        fd.append('avatar', pendingFile);

        const res = await fetch('/update-profile-picture', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Picture upload failed');
        }
        uploadedImageUrl = data.profile_image;
      }

      // ---- 2. Update text fields (if changed) ----
      if (shouldUpdateText) {
        const res = await fetch('/update-profile', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(current),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Profile update failed');
        }
        textResult = data.profile;
      }

      // ---- 3. Update the UI ----

      // Picture — bust cache so both avatars reload
      if (uploadedImageUrl) {
        const bust = '?t=' + Date.now();
        const newUrl = uploadedImageUrl + bust;
        if (avatarImg) avatarImg.src = newUrl;
        if (headerImg) headerImg.src = newUrl;

        // Update our "revert point" so a subsequent Cancel
        // would revert to this new image
        savedAvatarUrl = newUrl;
      }

      // Text — refresh the view-mode display + header
      if (textResult) {
        updateViewDisplay(
          textResult.first_name,
          textResult.middle_name,
          textResult.last_name,
          textResult.contact_number
        );

        const headerH1 = document.querySelector('.header-left h1');
        if (headerH1) headerH1.textContent = `Welcome, ${textResult.first_name}`;
      }

      // ---- 4. Reset state ----
      pendingFile = null;
      if (fileInput) fileInput.value = '';
      snapshotValues();

      // ---- 5. Return to view mode ----
      editMode?.classList.add('hidden');
      viewMode?.classList.remove('hidden');

      // ---- 6. Success feedback ----
      saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
      setTimeout(() => {
        saveBtn.innerHTML = originalHTML || '<i class="fas fa-save"></i> Save Changes';
        updateSaveButtonState();
      }, 1200);

    } catch (err) {
      console.error('[profile] save error:', err);
      alert(err.message || 'Failed to save changes');
      saveBtn.innerHTML = originalHTML || '<i class="fas fa-save"></i> Save Changes';
      saveBtn.disabled = false;
    }
  });

  // ==================================================
  // HELPERS
  // ==================================================
  function updateViewDisplay(first, middle, last, contact) {
    const values = viewMode?.querySelectorAll('.info-value');
    if (!values) return;

    if (values[0]) values[0].textContent = first;
    if (values[1]) values[1].textContent = middle || '—';
    if (values[2]) values[2].textContent = last;
    if (values[4]) values[4].textContent = contact || '—';

    const drawerName = document.querySelector('.drawer-name');
    if (drawerName) drawerName.textContent = `${first} ${last}`.trim();
  }

  // Init
  updateSaveButtonState();
});