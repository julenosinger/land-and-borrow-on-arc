/**
 * DaatFI — Borrower Documents Viewer
 * ─────────────────────────────────────────────────────────────────────────────
 * Strictly additive module. Zero impact on existing features.
 *
 * Public API:
 *   DOCS.open(loanId, col)   → show legal gate, then document viewer
 *
 * Legal gate is session-scoped: once accepted, no further prompts until
 * the browser tab is closed (sessionStorage key: daatfi-docs-consent).
 *
 * Supported formats: IPFS images (JPG/PNG/WEBP) and PDFs, plus any direct URL.
 */

;(function (global) {
  'use strict';

  // ── Session consent key ────────────────────────────────────────────────────
  const CONSENT_KEY = 'daatfi-docs-consent';

  // ── Resolve IPFS URI → accessible HTTP URL ─────────────────────────────────
  function _resolveUrl(uri) {
    if (!uri) return null;
    if (uri.startsWith('ipfs://')) {
      const cid = uri.replace('ipfs://', '').replace(/^0x/, '');
      return `https://gateway.pinata.cloud/ipfs/${cid}`;
    }
    if (uri.startsWith('file://')) return null;   // local only, no public link
    return uri;
  }

  // ── Detect file type from URL / CID ────────────────────────────────────────
  function _fileType(url) {
    if (!url) return 'unknown';
    const u = url.toLowerCase().split('?')[0];
    if (/\.(jpg|jpeg|png|webp|gif)$/.test(u)) return 'image';
    if (/\.pdf$/.test(u)) return 'pdf';
    // IPFS CIDs have no extension — try to detect from the metadata we have
    // Default to pdf for IPFS documents (most uploaded collateral docs are PDFs)
    if (url.includes('gateway.pinata.cloud') || url.includes('ipfs')) return 'ipfs-auto';
    return 'unknown';
  }

  // ── Z-index layer for stacked modals ────────────────────────────────────────
  const Z_GATE   = 10000;
  const Z_VIEWER = 10001;

  // ── Inject scoped CSS once ─────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('dv-style')) return;
    const s = document.createElement('style');
    s.id = 'dv-style';
    s.textContent = `
      /* ── Docs Viewer overlay ── */
      .dv-overlay {
        position: fixed; inset: 0;
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        background: rgba(2,6,23,0.85);
        backdrop-filter: blur(6px);
        animation: dv-fadein 0.18s ease;
      }
      @keyframes dv-fadein { from { opacity:0 } to { opacity:1 } }

      /* ── Gate modal ── */
      .dv-gate {
        position: relative;
        width: 100%; max-width: 520px;
        background: var(--bg-card, #1e293b);
        border: 1px solid var(--border, #334155);
        border-radius: 20px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.7);
        overflow: hidden;
        animation: dv-slidein 0.22s cubic-bezier(.16,1,.3,1);
      }
      @keyframes dv-slidein { from { transform:translateY(20px);opacity:0 } to { transform:translateY(0);opacity:1 } }

      .dv-gate-header {
        padding: 22px 24px 16px;
        border-bottom: 1px solid var(--border, #334155);
        display: flex; align-items: flex-start; gap: 14px;
      }
      .dv-gate-icon {
        width: 42px; height: 42px; flex-shrink: 0;
        background: rgba(245,158,11,0.12);
        border: 1px solid rgba(245,158,11,0.3);
        border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 20px;
      }
      .dv-gate-title {
        font-size: 16px; font-weight: 700;
        color: var(--text-primary, #f1f5f9);
        margin-bottom: 3px;
      }
      .dv-gate-subtitle {
        font-size: 12px;
        color: var(--text-muted, #64748b);
      }
      .dv-gate-body { padding: 20px 24px; }
      .dv-gate-text {
        font-size: 13px; line-height: 1.7;
        color: var(--text-secondary, #94a3b8);
        background: rgba(245,158,11,0.05);
        border: 1px solid rgba(245,158,11,0.15);
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 18px;
      }
      .dv-gate-checkbox-row {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 14px 16px;
        background: var(--bg-input, #0f172a);
        border: 1px solid var(--border, #334155);
        border-radius: 10px;
        cursor: pointer;
        transition: border-color 0.15s;
        margin-bottom: 4px;
      }
      .dv-gate-checkbox-row:hover { border-color: var(--cyan, #06b6d4); }
      .dv-gate-checkbox-row input[type=checkbox] {
        width: 18px; height: 18px; flex-shrink: 0; cursor: pointer;
        accent-color: var(--cyan, #06b6d4);
        margin-top: 1px;
      }
      .dv-gate-checkbox-label {
        font-size: 13px; font-weight: 500;
        color: var(--text-primary, #f1f5f9);
        line-height: 1.5; cursor: pointer;
      }
      .dv-gate-footer {
        padding: 16px 24px 20px;
        display: flex; justify-content: flex-end; gap: 10px;
        border-top: 1px solid var(--border, #334155);
      }

      /* ── Viewer modal ── */
      .dv-viewer {
        position: relative;
        width: 100%; max-width: 960px;
        max-height: calc(100vh - 40px);
        background: var(--bg-card, #1e293b);
        border: 1px solid var(--border, #334155);
        border-radius: 20px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.7);
        display: flex; flex-direction: column;
        overflow: hidden;
        animation: dv-slidein 0.22s cubic-bezier(.16,1,.3,1);
      }
      .dv-viewer-header {
        padding: 18px 22px;
        border-bottom: 1px solid var(--border, #334155);
        display: flex; align-items: center; gap: 14px;
        flex-shrink: 0;
      }
      .dv-viewer-icon {
        width: 36px; height: 36px; flex-shrink: 0;
        background: rgba(6,182,212,0.12);
        border: 1px solid rgba(6,182,212,0.3);
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; color: var(--cyan, #06b6d4);
      }
      .dv-viewer-title {
        font-size: 15px; font-weight: 700;
        color: var(--text-primary, #f1f5f9);
        flex: 1;
      }
      .dv-viewer-subtitle {
        font-size: 11px;
        color: var(--text-muted, #64748b);
      }
      .dv-viewer-close {
        width: 32px; height: 32px; border-radius: 8px;
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted, #64748b);
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .dv-viewer-close:hover {
        background: rgba(239,68,68,0.12); color: #ef4444;
      }

      .dv-viewer-toolbar {
        padding: 10px 22px;
        border-bottom: 1px solid var(--border, #334155);
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        background: var(--bg-input, #0f172a);
        flex-shrink: 0;
      }
      .dv-tool-badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 10px;
        background: rgba(6,182,212,0.08);
        border: 1px solid rgba(6,182,212,0.2);
        border-radius: 6px;
        font-size: 11px; font-weight: 600;
        color: var(--cyan, #06b6d4);
      }
      .dv-tool-sep { flex: 1; }
      .dv-tool-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 8px; cursor: pointer;
        font-size: 12px; font-weight: 600; border: none;
        transition: background 0.15s, color 0.15s;
        text-decoration: none;
      }
      .dv-tool-btn-secondary {
        background: var(--bg-card, #1e293b);
        border: 1px solid var(--border, #334155);
        color: var(--text-secondary, #94a3b8);
      }
      .dv-tool-btn-secondary:hover {
        border-color: var(--cyan, #06b6d4);
        color: var(--cyan, #06b6d4);
      }
      .dv-tool-btn-primary {
        background: rgba(6,182,212,0.12);
        border: 1px solid rgba(6,182,212,0.3);
        color: var(--cyan, #06b6d4);
      }
      .dv-tool-btn-primary:hover { background: rgba(6,182,212,0.22); }

      /* ── Preview area ── */
      .dv-preview-area {
        flex: 1; overflow: auto;
        display: flex; align-items: center; justify-content: center;
        padding: 24px; min-height: 300px;
        background: var(--bg-input, #0f172a);
      }
      .dv-preview-img {
        max-width: 100%; max-height: 60vh;
        border-radius: 8px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        cursor: zoom-in;
        transition: transform 0.2s;
      }
      .dv-preview-img.zoomed {
        max-width: none; max-height: none;
        cursor: zoom-out;
        transform: scale(1);
      }
      .dv-preview-pdf {
        width: 100%; height: 60vh; min-height: 400px;
        border: none; border-radius: 8px;
      }
      .dv-preview-unknown {
        text-align: center; padding: 40px 24px;
      }
      .dv-preview-unknown-icon { font-size: 48px; margin-bottom: 12px; }
      .dv-preview-unknown-text {
        font-size: 14px; color: var(--text-secondary, #94a3b8);
        margin-bottom: 16px;
      }

      /* ── No documents state ── */
      .dv-empty {
        padding: 48px 24px; text-align: center;
      }
      .dv-empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }
      .dv-empty-text { font-size: 14px; color: var(--text-muted, #64748b); }

      /* ── Consent badge in viewer ── */
      .dv-consent-badge {
        padding: 8px 22px;
        background: rgba(16,185,129,0.06);
        border-top: 1px solid rgba(16,185,129,0.15);
        display: flex; align-items: center; gap: 8px;
        font-size: 11px; color: #10b981; flex-shrink: 0;
      }

      /* ── Responsive ── */
      @media (max-width: 600px) {
        .dv-gate { max-width: 100%; border-radius: 16px; }
        .dv-viewer { border-radius: 16px; }
        .dv-viewer-toolbar { padding: 8px 14px; }
        .dv-preview-area { padding: 12px; }
        .dv-preview-pdf { height: 50vh; }
      }

      /* ── Light mode overrides ── */
      html.light .dv-gate,
      html.light .dv-viewer {
        background: #ffffff;
        border-color: #cbd5e1;
      }
      html.light .dv-gate-text { background: rgba(245,158,11,0.04); }
      html.light .dv-gate-checkbox-row { background: #f1f5f9; }
      html.light .dv-viewer-toolbar { background: #f1f5f9; }
      html.light .dv-preview-area { background: #f8faff; }
      html.light .dv-tool-btn-secondary {
        background: #ffffff; border-color: #cbd5e1; color: #475569;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Utility: close overlay with fade-out ───────────────────────────────────
  function _closeOverlay(el) {
    el.style.animation = 'dv-fadein 0.15s ease reverse forwards';
    setTimeout(() => { el?.remove(); }, 150);
  }

  // ── Build preview content based on file type ───────────────────────────────
  function _buildPreview(url, type) {
    if (!url) {
      return `<div class="dv-preview-unknown">
        <div class="dv-preview-unknown-icon">🔒</div>
        <div class="dv-preview-unknown-text">
          This document was submitted without an IPFS link.<br>
          The SHA-256 hash is stored on-chain for verification.
        </div>
      </div>`;
    }

    if (type === 'image') {
      return `<img
        src="${url}"
        class="dv-preview-img"
        alt="Borrower document"
        loading="lazy"
        onclick="this.classList.toggle('zoomed')"
        title="Click to zoom in / out"
      />`;
    }

    if (type === 'pdf') {
      return `<iframe
        src="${url}#toolbar=0&navpanes=0&scrollbar=1"
        class="dv-preview-pdf"
        sandbox="allow-same-origin allow-scripts"
        title="Borrower document PDF"
      ></iframe>`;
    }

    // ipfs-auto or unknown — try iframe first (works for PDFs and images from IPFS)
    return `
      <div style="width:100%; display:flex; flex-direction:column; gap:12px; align-items:center;">
        <iframe
          src="${url}"
          class="dv-preview-pdf"
          sandbox="allow-same-origin allow-scripts"
          title="Borrower document"
          onload="this.style.display='block'"
        ></iframe>
        <div style="font-size:11px; color:var(--text-muted,#64748b); text-align:center;">
          <i class="fa-solid fa-circle-info" style="margin-right:4px;"></i>
          If the preview is blank, use "Open in New Tab" to view the document.
        </div>
      </div>`;
  }

  // ── Show the legal gate modal ──────────────────────────────────────────────
  function _showGate(onAccepted) {
    _injectCSS();

    const overlay = document.createElement('div');
    overlay.className = 'dv-overlay';
    overlay.style.zIndex = Z_GATE;

    overlay.innerHTML = `
      <div class="dv-gate" role="dialog" aria-modal="true"
           aria-labelledby="dv-gate-title">
        <div class="dv-gate-header">
          <div class="dv-gate-icon">⚖️</div>
          <div>
            <div class="dv-gate-title" id="dv-gate-title">
              Legal Agreement – Data Protection and Privacy
            </div>
            <div class="dv-gate-subtitle">You must accept before viewing any documents</div>
          </div>
        </div>
        <div class="dv-gate-body">
          <div class="dv-gate-text">
            By accessing these documents, you agree that you will not misuse,
            distribute, or process any personal data in violation of applicable
            data protection laws. You acknowledge full responsibility for
            compliance with all relevant privacy and data protection regulations.
          </div>
          <label class="dv-gate-checkbox-row" for="dv-consent-cb">
            <input type="checkbox" id="dv-consent-cb" />
            <span class="dv-gate-checkbox-label">
              I agree to the terms and accept full legal responsibility
            </span>
          </label>
        </div>
        <div class="dv-gate-footer">
          <button id="dv-gate-cancel" class="dv-tool-btn dv-tool-btn-secondary">
            Cancel
          </button>
          <button id="dv-gate-continue" class="dv-tool-btn dv-tool-btn-primary"
                  disabled style="opacity:0.45; cursor:not-allowed;">
            <i class="fa-solid fa-shield-halved"></i> Continue
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cb      = overlay.querySelector('#dv-consent-cb');
    const contBtn = overlay.querySelector('#dv-gate-continue');
    const cancelBtn = overlay.querySelector('#dv-gate-cancel');

    // Enable / disable Continue based on checkbox
    cb.addEventListener('change', () => {
      const checked = cb.checked;
      contBtn.disabled = !checked;
      contBtn.style.opacity    = checked ? '1'     : '0.45';
      contBtn.style.cursor     = checked ? 'pointer': 'not-allowed';
    });

    contBtn.addEventListener('click', () => {
      if (!cb.checked) return;
      // Persist consent for this session
      try { sessionStorage.setItem(CONSENT_KEY, '1'); } catch {}
      _closeOverlay(overlay);
      onAccepted();
    });

    cancelBtn.addEventListener('click', () => _closeOverlay(overlay));

    // Block click-outside to close (legal gate must be explicit)
    // (No backdrop click handler intentionally)
  }

  // ── Show the document viewer ───────────────────────────────────────────────
  function _showViewer(loanId, col) {
    _injectCSS();

    const docUrl  = _resolveUrl(col.documentURI || col.docURI || '');
    const type    = _fileType(docUrl);
    const hash    = col.documentHash || col.docHash || '';
    const hasDoc  = !!docUrl;

    const filename = `DaatFI-Loan${loanId}-CollateralDoc`;

    const overlay = document.createElement('div');
    overlay.className = 'dv-overlay';
    overlay.style.zIndex = Z_VIEWER;

    overlay.innerHTML = `
      <div class="dv-viewer" role="dialog" aria-modal="true"
           aria-labelledby="dv-viewer-title">

        <!-- Header -->
        <div class="dv-viewer-header">
          <div class="dv-viewer-icon">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          <div style="flex:1; min-width:0;">
            <div class="dv-viewer-title" id="dv-viewer-title">
              Borrower Documents — Loan #${loanId}
            </div>
            <div class="dv-viewer-subtitle">
              Collateral: ${col.colTypeLabel || 'RWA'}
              ${col.assetType ? ' · ' + _esc(col.assetType) : ''}
            </div>
          </div>
          <button class="dv-viewer-close" id="dv-close" aria-label="Close documents viewer">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0
                111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293
                4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"/>
            </svg>
          </button>
        </div>

        <!-- Toolbar -->
        <div class="dv-viewer-toolbar">
          <span class="dv-tool-badge">
            <i class="fa-solid fa-shield-halved"></i> Consent Verified
          </span>
          ${hash ? `<span class="dv-tool-badge" style="background:rgba(139,92,246,0.08);border-color:rgba(139,92,246,0.25);color:var(--purple,#8b5cf6);">
            <i class="fa-solid fa-fingerprint"></i>
            SHA-256: ${hash.slice(0,12)}…${hash.slice(-6)}
          </span>` : ''}
          <span class="dv-tool-sep"></span>
          ${hasDoc ? `
            <button class="dv-tool-btn dv-tool-btn-secondary" id="dv-btn-newtab"
              title="Open in new tab (no auto-download)">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in New Tab
            </button>
            <a class="dv-tool-btn dv-tool-btn-secondary" id="dv-btn-download"
              href="${docUrl}" download="${filename}"
              title="Download document">
              <i class="fa-solid fa-download"></i> Download
            </a>
          ` : ''}
        </div>

        <!-- Preview area -->
        <div class="dv-preview-area" id="dv-preview-area">
          ${hasDoc
            ? _buildPreview(docUrl, type)
            : `<div class="dv-empty">
                <div class="dv-empty-icon">📂</div>
                <div class="dv-empty-text">
                  No IPFS document available for this loan.<br>
                  ${hash
                    ? `<span style="font-size:11px;color:var(--text-muted);">
                        The document hash <span style="font-family:monospace;">${hash.slice(0,20)}…</span>
                        is recorded on-chain for verification.
                      </span>`
                    : 'No collateral document was submitted with this loan request.'}
                </div>
              </div>`}
        </div>

        <!-- Consent footer badge -->
        <div class="dv-consent-badge">
          <i class="fa-solid fa-circle-check"></i>
          Legal agreement accepted this session — viewing is authorised under your declared compliance responsibility.
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    // Close button
    overlay.querySelector('#dv-close').addEventListener('click', () => _closeOverlay(overlay));

    // Open in new tab (no download attribute)
    const newTabBtn = overlay.querySelector('#dv-btn-newtab');
    if (newTabBtn) {
      newTabBtn.addEventListener('click', () => {
        window.open(docUrl, '_blank', 'noopener,noreferrer');
      });
    }

    // Image zoom toggle
    const img = overlay.querySelector('.dv-preview-img');
    if (img) {
      img.addEventListener('click', () => img.classList.toggle('zoomed'));
    }
  }

  // ── HTML escape helper ─────────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
    ));
  }

  // ── Public entry point ─────────────────────────────────────────────────────
  /**
   * Open the Borrower Documents viewer for a given loan.
   * Shows legal gate first (unless consent already given this session).
   *
   * @param {string|number} loanId  - Loan ID
   * @param {object|null}   col     - Collateral object from _normalizeLoan()
   *   Expected fields: colTypeLabel, assetType, documentURI, documentHash
   *   If null/undefined, will try to fetch from chain via window.web3.
   */
  async function open(loanId, col) {
    // If no collateral provided, try to fetch from chain
    if (!col) {
      const rc = window.web3?.getReadContract?.();
      if (rc) {
        const toast = typeof showToast === 'function'
          ? showToast('Loading collateral data…', 'info', 0) : null;
        try {
          const raw = await rc.getLoan(loanId);
          const loan = window.web3._normalizeLoan(raw);
          col = loan?.collateral || null;
          toast?.remove?.();
        } catch (e) {
          toast?.remove?.();
          if (typeof showToast === 'function')
            showToast('Failed to load collateral data.', 'error');
          return;
        }
      }
      if (!col) {
        if (typeof showToast === 'function')
          showToast('No collateral data available for this loan.', 'warning');
        return;
      }
    }

    const alreadyConsented = (() => {
      try { return sessionStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
    })();

    if (alreadyConsented) {
      _showViewer(loanId, col);
    } else {
      _showGate(() => _showViewer(loanId, col));
    }
  }

  // ── Expose global API ──────────────────────────────────────────────────────
  global.DOCS = { open };

})(window);
