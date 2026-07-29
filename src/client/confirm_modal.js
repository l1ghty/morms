/**
 * Custom Confirmation Modal for Morms 2D
 * Replaces default browser confirm() dialogs with a modern glassmorphic modal.
 */

export function showConfirm({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = true,
  icon = '⚠️'
} = {}) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('confirm-modal-overlay');

    // If overlay doesn't exist in DOM yet, build it dynamically
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'confirm-modal-overlay';
      overlay.className = 'screen-overlay hidden';
      overlay.style.zIndex = '150';
      overlay.innerHTML = `
        <div class="menu-card glass-panel confirm-modal-card">
          <div id="confirm-modal-icon" class="confirm-modal-icon">⚠️</div>
          <h2 id="confirm-modal-title" style="margin-bottom: 8px;">Confirm Action</h2>
          <p id="confirm-modal-message" class="confirm-modal-message"></p>
          <div class="confirm-modal-actions">
            <button id="confirm-modal-cancel-btn" class="btn btn-secondary">Cancel</button>
            <button id="confirm-modal-ok-btn" class="btn btn-primary">Confirm</button>
          </div>
        </div>
      `;
      const container = document.getElementById('game-container') || document.body;
      container.appendChild(overlay);
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const iconEl = document.getElementById('confirm-modal-icon');
    const okBtn = document.getElementById('confirm-modal-ok-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;

    if (okBtn) {
      okBtn.textContent = confirmText;
      if (danger) {
        okBtn.classList.add('btn-danger-confirm');
      } else {
        okBtn.classList.remove('btn-danger-confirm');
      }
    }

    if (cancelBtn) {
      cancelBtn.textContent = cancelText;
    }

    // Cleanup and resolve
    const cleanup = (result) => {
      overlay.classList.add('hidden');
      window.removeEventListener('keydown', handleKeyDown);
      overlay.removeEventListener('click', handleBackdropClick);
      okBtn?.removeEventListener('click', handleOk);
      cancelBtn?.removeEventListener('click', handleCancel);
      resolve(result);
    };

    const handleOk = (e) => {
      e?.stopPropagation();
      cleanup(true);
    };

    const handleCancel = (e) => {
      e?.stopPropagation();
      cleanup(false);
    };

    const handleBackdropClick = (e) => {
      if (e.target === overlay) {
        cleanup(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        cleanup(true);
      }
    };

    // Attach event listeners
    okBtn?.addEventListener('click', handleOk);
    cancelBtn?.addEventListener('click', handleCancel);
    overlay.addEventListener('click', handleBackdropClick);
    window.addEventListener('keydown', handleKeyDown);

    // Show modal and focus cancel button (safe default for dangerous actions)
    overlay.classList.remove('hidden');
    cancelBtn?.focus();
  });
}

export const showConfirmModal = showConfirm;
if (typeof window !== 'undefined') {
  window.showConfirm = showConfirm;
  window.showConfirmModal = showConfirmModal;
}
