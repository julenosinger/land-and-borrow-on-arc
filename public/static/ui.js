/**
 * UI - Global UI utilities, notifications, modals, and component helpers
 */
const UI = {
  // ─── Toast Notifications ───────────────────────────────────────────────────
  toastContainer: null,

  _getToastContainer() {
    if (!this.toastContainer) {
      this.toastContainer = document.getElementById('toast-container');
      if (!this.toastContainer) {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'toast-container';
        this.toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm';
        document.body.appendChild(this.toastContainer);
      }
    }
    return this.toastContainer;
  },

  showToast(message, type = 'info', duration = 5000) {
    const container = this._getToastContainer();
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      loading: '⏳'
    };
    const colors = {
      success: 'bg-emerald-900/90 border-emerald-500 text-emerald-100',
      error: 'bg-red-900/90 border-red-500 text-red-100',
      warning: 'bg-amber-900/90 border-amber-500 text-amber-100',
      info: 'bg-blue-900/90 border-blue-500 text-blue-100',
      loading: 'bg-purple-900/90 border-purple-500 text-purple-100'
    };

    const toast = document.createElement('div');
    toast.className = `flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm shadow-2xl 
      transform transition-all duration-300 translate-x-full
      ${colors[type] || colors.info}`;
    toast.innerHTML = `
      <span class="text-lg flex-shrink-0 mt-0.5">${icons[type] || icons.info}</span>
      <div class="flex-1">
        <p class="text-sm font-medium leading-relaxed">${message}</p>
      </div>
      <button class="flex-shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity" onclick="this.parentElement.remove()">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
      </button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-x-full'));

    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
    return toast;
  },

  showLoading(message = 'Processing...') {
    return this.showToast(message, 'loading', 0);
  },

  // ─── Modal System ──────────────────────────────────────────────────────────
  showModal(options) {
    const { title, content, actions = [], size = 'md', onClose } = options;
    const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" id="modal-backdrop"></div>
      <div class="relative ${sizes[size]} w-full bg-gradient-to-br from-slate-900 to-slate-800 
        border border-slate-700 rounded-2xl shadow-2xl transform transition-all duration-300 scale-95 opacity-0 max-h-screen overflow-y-auto"
        id="modal-content">
        <div class="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 class="text-xl font-bold text-white">${title}</h2>
          <button id="modal-close" class="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          </button>
        </div>
        <div class="p-6" id="modal-body">${content}</div>
        ${actions.length > 0 ? `
          <div class="flex gap-3 justify-end p-6 border-t border-slate-700" id="modal-actions">
            ${actions.map(a => `
              <button id="modal-action-${a.id || a.label.toLowerCase().replace(/\s/g,'-')}"
                class="${a.primary ? 'btn-primary' : 'btn-secondary'}">
                ${a.label}
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      document.getElementById('modal-content')?.classList.replace('scale-95', 'scale-100');
      document.getElementById('modal-content')?.classList.replace('opacity-0', 'opacity-100');
    });

    const close = () => {
      document.getElementById('modal-content')?.classList.add('scale-95', 'opacity-0');
      setTimeout(() => overlay.remove(), 200);
      if (onClose) onClose();
    };

    document.getElementById('modal-close')?.addEventListener('click', close);
    document.getElementById('modal-backdrop')?.addEventListener('click', close);

    actions.forEach(a => {
      const btn = document.getElementById(`modal-action-${a.id || a.label.toLowerCase().replace(/\s/g,'-')}`);
      if (btn && a.onClick) btn.addEventListener('click', () => a.onClick(close));
    });

    return { overlay, close };
  },

  async confirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
      const { close } = this.showModal({
        title,
        content: `<p class="text-slate-300 text-base leading-relaxed">${message}</p>`,
        actions: [
          { label: 'Cancel', id: 'cancel', onClick: (c) => { c(); resolve(false); } },
          { label: 'Confirm', id: 'confirm', primary: true, onClick: (c) => { c(); resolve(true); } }
        ]
      });
    });
  },

  // ─── Status Badges ─────────────────────────────────────────────────────────
  loanStatusBadge(status) {
    const configs = {
      PENDING: { bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
      APPROVED: { bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
      ACTIVE: { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
      COMPLETED: { bg: 'bg-purple-500/20 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' },
      DEFAULTED: { bg: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' },
      REJECTED: { bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
      CANCELLED: { bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' }
    };
    const c = configs[status] || configs.PENDING;
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.bg}">
      <span class="w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse"></span>
      ${status}
    </span>`;
  },

  collateralBadge(type) {
    const configs = {
      RWA: { bg: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '🏠' },
      CRYPTO: { bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: '🔒' },
      NONE: { bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: '—' }
    };
    const c = configs[type] || configs.NONE;
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.bg}">
      <span>${c.icon}</span>
      ${type}
    </span>`;
  },

  installmentStatusBadge(status) {
    const configs = {
      PENDING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      PAID: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      OVERDUE: 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${configs[status] || configs.PENDING}">${status}</span>`;
  },

  // ─── Loading States ────────────────────────────────────────────────────────
  setButtonLoading(btn, loading, text = null) {
    if (loading) {
      btn.disabled = true;
      btn._originalText = btn.innerHTML;
      btn.innerHTML = `<svg class="animate-spin w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>${text || 'Processing...'}`;
    } else {
      btn.disabled = false;
      if (btn._originalText) btn.innerHTML = btn._originalText;
    }
  },

  // ─── Form Validation ───────────────────────────────────────────────────────
  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  validateForm(fields) {
    const errors = [];
    fields.forEach(f => {
      if (f.required && !f.value?.toString().trim()) {
        errors.push(`${f.label} is required`);
      }
      if (f.email && f.value && !this.validateEmail(f.value)) {
        errors.push(`${f.label} must be a valid email`);
      }
      if (f.min !== undefined && parseFloat(f.value) < f.min) {
        errors.push(`${f.label} must be at least ${f.min}`);
      }
      if (f.max !== undefined && parseFloat(f.value) > f.max) {
        errors.push(`${f.label} must be at most ${f.max}`);
      }
    });
    return errors;
  },

  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.add('border-red-500');
    let err = document.getElementById(`${fieldId}-error`);
    if (!err) {
      err = document.createElement('p');
      err.id = `${fieldId}-error`;
      err.className = 'text-red-400 text-xs mt-1';
      field.parentElement.appendChild(err);
    }
    err.textContent = message;
  },

  clearFieldErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('[id$="-error"]').forEach(e => e.remove());
    form.querySelectorAll('.border-red-500').forEach(e => e.classList.remove('border-red-500'));
  },

  // ─── Progress Bar ──────────────────────────────────────────────────────────
  progressBar(paid, total, colorClass = 'bg-gradient-to-r from-emerald-500 to-cyan-500') {
    const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
    return `
      <div class="flex items-center gap-3">
        <div class="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
          <div class="${colorClass} h-2 rounded-full transition-all duration-500" style="width:${pct}%"></div>
        </div>
        <span class="text-xs text-slate-400 font-mono">${paid}/${total}</span>
      </div>
    `;
  },

  // ─── Receipt Generator ─────────────────────────────────────────────────────
  generateReceiptHTML(data) {
    return `
      <div class="receipt-container font-mono text-sm">
        <div class="border-b border-dashed border-slate-600 pb-4 mb-4">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-lg font-bold text-white">🧾 ARCFI RECEIPT</h3>
            <span class="text-slate-400 text-xs">${new Date().toISOString()}</span>
          </div>
          <p class="text-slate-500 text-xs">Arc Testnet — Chain ID: ${window.ARC_CHAIN_ID}</p>
        </div>
        <div class="space-y-2 mb-4">
          <div class="flex justify-between"><span class="text-slate-400">Loan ID</span><span class="text-white">#${data.loanId}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Type</span><span class="text-white">${data.type || 'Payment'}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Amount</span><span class="text-emerald-400 font-bold">$${parseFloat(data.amount).toFixed(2)} USDC</span></div>
          ${data.installmentIndex !== undefined ? `<div class="flex justify-between"><span class="text-slate-400">Installment</span><span class="text-white">${data.installmentIndex + 1} of ${data.totalInstallments}</span></div>` : ''}
          <div class="flex justify-between"><span class="text-slate-400">From</span><span class="text-white text-xs">${data.from}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">To</span><span class="text-white text-xs">${data.to}</span></div>
        </div>
        ${data.txHash ? `
          <div class="border-t border-dashed border-slate-600 pt-4">
            <p class="text-slate-400 text-xs mb-1">Transaction Hash</p>
            <p class="text-cyan-400 text-xs break-all">${data.txHash}</p>
            <a href="${window.ARC_EXPLORER}/tx/${data.txHash}" target="_blank" 
              class="text-blue-400 hover:text-blue-300 text-xs underline mt-1 inline-block">
              View on Explorer →
            </a>
          </div>
        ` : ''}
      </div>
    `;
  },

  // ─── Clipboard ────────────────────────────────────────────────────────────
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied to clipboard!', 'success', 2000);
    } catch {
      this.showToast('Failed to copy', 'error', 2000);
    }
  },

  // ─── Formatters ───────────────────────────────────────────────────────────
  formatUSDC(amount) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(amount);
  },

  formatDate(ts) {
    if (!ts) return 'N/A';
    return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  formatDateTime(ts) {
    if (!ts) return 'N/A';
    return new Date(ts * 1000).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  },

  timeUntil(ts) {
    if (!ts) return '';
    const diff = ts * 1000 - Date.now();
    if (diff < 0) return 'Overdue';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  },

  explorerLink(hash, type = 'tx') {
    return `<a href="${window.ARC_EXPLORER}/${type}/${hash}" target="_blank" 
      class="text-cyan-400 hover:text-cyan-300 transition-colors text-xs font-mono underline">
      ${hash.slice(0, 8)}...${hash.slice(-6)}
    </a>`;
  }
};

window.UI = UI;
