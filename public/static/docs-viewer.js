/**
 * DaatFI — Borrower Documents Viewer
 * ─────────────────────────────────────────────────────────────────────────────
 * Public API:
 *   DOCS.open(loanId, col)   → show legal gate (session-scoped), then viewer
 *
 * Supports up to 5 documents with tab navigation.
 * Formats: IPFS images (JPG/PNG/WEBP), PDFs, local-hash only.
 */

;(function (global) {
  'use strict';

  const CONSENT_KEY = 'daatfi-docs-consent';

  // ── Resolve IPFS URI → accessible HTTP URL ─────────────────────────────────
  function _resolveUrl(uri) {
    if (!uri) return null;
    if (uri.startsWith('ipfs://')) {
      const cid = uri.replace('ipfs://', '').replace(/^0x/, '');
      return `https://gateway.pinata.cloud/ipfs/${cid}`;
    }
    if (uri.startsWith('file://')) return null;
    return uri;
  }

  // ── Detect file type ────────────────────────────────────────────────────────
  function _fileType(url) {
    if (!url) return 'unknown';
    const u = url.toLowerCase().split('?')[0];
    if (/\.(jpg|jpeg|png|webp|gif)$/.test(u)) return 'image';
    if (/\.pdf$/.test(u)) return 'pdf';
    if (url.includes('gateway.pinata.cloud') || url.includes('/ipfs/')) return 'ipfs-auto';
    return 'unknown';
  }

  const Z_GATE   = 10000;
  const Z_VIEWER = 10001;

  // ── HTML escape ────────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── CSS injection ──────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('dv-style')) return;
    const s = document.createElement('style');
    s.id = 'dv-style';
    s.textContent = `
      .dv-overlay {
        position: fixed; inset: 0;
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        background: rgba(2,6,23,0.88);
        backdrop-filter: blur(6px);
        animation: dv-fadein 0.18s ease;
        z-index: ${Z_VIEWER};
      }
      @keyframes dv-fadein { from { opacity:0 } to { opacity:1 } }

      /* ── Gate modal ── */
      .dv-gate {
        position: relative; width: 100%; max-width: 520px;
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
      .dv-gate-icon { font-size: 28px; flex-shrink: 0; }
      .dv-gate-title { font-size: 17px; font-weight: 700; color: var(--text-primary, #f1f5f9); line-height: 1.3; }
      .dv-gate-subtitle { font-size: 12px; color: var(--text-muted, #64748b); margin-top: 4px; }
      .dv-gate-body { padding: 20px 24px; }
      .dv-gate-text {
        font-size: 13px; line-height: 1.7; color: var(--text-secondary, #94a3b8);
        background: rgba(6,182,212,0.04); border: 1px solid rgba(6,182,212,0.12);
        border-radius: 10px; padding: 14px 16px; margin-bottom: 16px;
      }
      .dv-gate-checkbox-row {
        display: flex; align-items: flex-start; gap: 10px; cursor: pointer;
        font-size: 13px; color: var(--text-primary, #f1f5f9); line-height: 1.5;
      }
      .dv-gate-checkbox-row input[type="checkbox"] { margin-top: 2px; accent-color: var(--cyan, #06b6d4); flex-shrink: 0; }
      .dv-gate-footer {
        padding: 16px 24px;
        border-top: 1px solid var(--border, #334155);
        display: flex; gap: 10px; justify-content: flex-end;
      }

      /* ── Viewer modal ── */
      .dv-viewer {
        position: relative; width: 100%; max-width: 880px; max-height: 92vh;
        background: var(--bg-card, #1e293b);
        border: 1px solid var(--border, #334155);
        border-radius: 20px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.7);
        display: flex; flex-direction: column;
        overflow: hidden;
        animation: dv-slidein 0.22s cubic-bezier(.16,1,.3,1);
      }
      .dv-viewer-header {
        display: flex; align-items: center; gap: 12px;
        padding: 16px 20px; flex-shrink: 0;
        border-bottom: 1px solid var(--border, #334155);
      }
      .dv-viewer-icon { font-size: 22px; flex-shrink: 0; }
      .dv-viewer-title { font-size: 16px; font-weight: 700; color: var(--text-primary, #f1f5f9); }
      .dv-viewer-subtitle { font-size: 11px; color: var(--text-muted, #64748b); margin-top: 2px; }
      .dv-viewer-close {
        background: none; border: 1px solid var(--border, #334155); border-radius: 8px;
        width: 32px; height: 32px; cursor: pointer; color: var(--text-secondary, #94a3b8);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        transition: border-color 0.2s, color 0.2s;
      }
      .dv-viewer-close:hover { border-color: var(--red, #ef4444); color: var(--red, #ef4444); }

      /* ── Document tabs ── */
      .dv-doc-tabs {
        display: flex; gap: 4px; padding: 10px 16px 0;
        border-bottom: 1px solid var(--border, #334155);
        flex-shrink: 0; overflow-x: auto;
        scrollbar-width: thin;
      }
      .dv-doc-tab {
        padding: 7px 14px; border-radius: 8px 8px 0 0;
        font-size: 12px; font-weight: 600;
        cursor: pointer; transition: background 0.15s, color 0.15s;
        background: transparent; border: 1px solid transparent; border-bottom: none;
        color: var(--text-muted, #64748b);
        white-space: nowrap; user-select: none;
        display: flex; align-items: center; gap: 6px;
      }
      .dv-doc-tab:hover { background: rgba(255,255,255,0.05); color: var(--text-primary, #f1f5f9); }
      .dv-doc-tab.active {
        background: var(--bg-input, rgba(255,255,255,0.06));
        border-color: var(--border, #334155);
        color: var(--cyan, #06b6d4);
      }
      .dv-doc-tab-dot {
        width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      }
      .dv-doc-tab-dot.ipfs  { background: var(--green, #10b981); }
      .dv-doc-tab-dot.local { background: var(--amber, #f59e0b); }
      .dv-doc-tab-dot.empty { background: var(--text-muted, #64748b); }

      /* ── Toolbar ── */
      .dv-viewer-toolbar {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        padding: 10px 16px; flex-shrink: 0;
        border-bottom: 1px solid var(--border, #334155);
        background: rgba(0,0,0,0.15);
      }
      .dv-tool-badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
        background: rgba(6,182,212,0.08); border: 1px solid rgba(6,182,212,0.2);
        color: var(--cyan, #06b6d4); white-space: nowrap;
      }
      .dv-tool-sep { flex: 1; }
      .dv-tool-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
        cursor: pointer; transition: opacity 0.15s, transform 0.15s; text-decoration: none;
        white-space: nowrap;
      }
      .dv-tool-btn:hover { opacity: 0.85; transform: translateY(-1px); }
      .dv-tool-btn-primary  { background: linear-gradient(135deg,#06b6d4,#3b82f6); color:#fff; border: none; }
      .dv-tool-btn-secondary { background: transparent; border: 1px solid var(--border,#334155); color: var(--text-secondary,#94a3b8); }
      .dv-tool-btn-secondary:hover { border-color: var(--cyan,#06b6d4); color: var(--cyan,#06b6d4); }

      /* ── Preview area ── */
      .dv-preview-area {
        flex: 1; overflow: auto; position: relative;
        background: rgba(0,0,0,0.2);
        display: flex; align-items: center; justify-content: center;
        min-height: 320px;
      }
      .dv-preview-img {
        max-width: 100%; max-height: 100%;
        object-fit: contain; cursor: zoom-in;
        transition: transform 0.25s ease;
      }
      .dv-preview-img.zoomed { transform: scale(1.8); cursor: zoom-out; }
      .dv-preview-pdf {
        width: 100%; height: 100%; min-height: 420px;
        border: none; background: #fff; display: block;
      }

      /* ── Empty / local state ── */
      .dv-empty {
        padding: 32px 24px; text-align: center; width: 100%;
        color: var(--text-secondary, #94a3b8); font-size: 14px; line-height: 1.7;
      }
      .dv-empty-icon { font-size: 40px; margin-bottom: 12px; }
      .dv-empty-text { max-width: 500px; margin: 0 auto; }

      /* ── Consent footer ── */
      .dv-consent-badge {
        padding: 10px 16px; flex-shrink: 0;
        border-top: 1px solid var(--border, #334155);
        font-size: 11px; color: var(--text-muted, #64748b);
        display: flex; align-items: center; gap: 6px;
      }
      .dv-consent-badge i { color: var(--green, #10b981); }

      /* ── Light mode ── */
      html.light .dv-overlay { background: rgba(15,23,42,0.7); }
      html.light .dv-gate,
      html.light .dv-viewer { background: #ffffff; border-color: #e2e8f0; }
      html.light .dv-gate-header,
      html.light .dv-viewer-header,
      html.light .dv-viewer-toolbar,
      html.light .dv-doc-tabs,
      html.light .dv-gate-footer,
      html.light .dv-consent-badge { border-color: #e2e8f0; }
      html.light .dv-gate-text { background: rgba(6,182,212,0.03); }
      html.light .dv-preview-area { background: #f1f5f9; }
      html.light .dv-viewer-toolbar { background: rgba(0,0,0,0.03); }
      html.light .dv-doc-tab:hover { background: rgba(0,0,0,0.04); }
      html.light .dv-doc-tab.active { background: #fff; }

      @media (max-width: 640px) {
        .dv-viewer { max-height: 100vh; border-radius: 16px 16px 0 0; }
        .dv-viewer-header { padding: 12px 14px; }
        .dv-viewer-toolbar { padding: 8px 10px; }
        .dv-doc-tabs { padding: 6px 10px 0; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Close overlay ─────────────────────────────────────────────────────────
  function _closeOverlay(el) {
    if (!el) return;
    el.style.animation = 'dv-fadein 0.15s ease reverse forwards';
    setTimeout(() => { el?.remove(); }, 150);
  }

  // ── Build preview content for a single doc ────────────────────────────────
  function _buildPreview(url, type, rawUri, hash) {
    const isFileUri = rawUri?.startsWith('file://');

    if (!url && isFileUri) {
      const origName = rawUri.replace('file://', '');
      return `
        <div class="dv-empty">
          <div class="dv-empty-icon">📋</div>
          <div class="dv-empty-text">
            <strong style="color:var(--text-primary,#f1f5f9);display:block;margin-bottom:10px;font-size:15px;">
              Document not available online
            </strong>
            This document was uploaded without IPFS at submission time.<br>
            The file hash is stored on-chain for integrity verification.
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px 16px;margin-top:14px;text-align:left;">
              <div style="font-size:11px;color:var(--text-muted,#64748b);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Original filename</div>
              <div style="font-family:monospace;font-size:13px;color:var(--amber,#f59e0b);word-break:break-all;">${_esc(origName)}</div>
              ${hash ? `
              <div style="font-size:11px;color:var(--text-muted,#64748b);margin-top:10px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">SHA-256 on-chain hash</div>
              <div style="font-family:monospace;font-size:11px;color:var(--text-secondary,#94a3b8);word-break:break-all;">${_esc(hash)}</div>` : ''}
            </div>
            <div style="margin-top:14px;font-size:12px;color:var(--text-muted,#64748b);">
              <i class="fa-solid fa-circle-info" style="color:var(--cyan,#06b6d4);margin-right:4px;"></i>
              To make this document viewable, ask the borrower to re-submit with IPFS enabled (Pinata configured).
            </div>
          </div>
        </div>`;
    }

    if (!url) {
      return `
        <div class="dv-empty">
          <div class="dv-empty-icon">📂</div>
          <div class="dv-empty-text">
            No document file was attached to this entry.<br>
            ${hash ? `<span style="font-size:11px;color:var(--text-muted);">SHA-256: <span style="font-family:monospace;word-break:break-all;">${_esc(hash)}</span></span>` : 'No document hash or file was provided.'}
          </div>
        </div>`;
    }

    if (type === 'image') {
      return `<img src="${url}" class="dv-preview-img" alt="Borrower document" loading="lazy" title="Click to zoom in / out" />`;
    }

    if (type === 'pdf') {
      return `<iframe src="${url}#toolbar=0&navpanes=0&scrollbar=1" class="dv-preview-pdf" sandbox="allow-same-origin allow-scripts" title="Borrower document PDF"></iframe>`;
    }

    // ipfs-auto or unknown
    return `
      <div style="width:100%;display:flex;flex-direction:column;gap:12px;align-items:center;">
        <iframe src="${url}" class="dv-preview-pdf" sandbox="allow-same-origin allow-scripts" title="Borrower document"></iframe>
        <div style="font-size:11px;color:var(--text-muted,#64748b);text-align:center;padding:0 16px;">
          <i class="fa-solid fa-circle-info" style="margin-right:4px;"></i>
          If the preview appears blank, use "Open in New Tab" to view the document.
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
      <div class="dv-gate" role="dialog" aria-modal="true" aria-labelledby="dv-gate-title">
        <div class="dv-gate-header">
          <div class="dv-gate-icon">⚖️</div>
          <div>
            <div class="dv-gate-title" id="dv-gate-title">Legal Agreement – Data Protection and Privacy</div>
            <div class="dv-gate-subtitle">You must accept before viewing any documents</div>
          </div>
        </div>
        <div class="dv-gate-body">
          <div class="dv-gate-text">
            By accessing these documents, you agree that you will not misuse, distribute,
            or process any personal data in violation of applicable data protection laws.
            You acknowledge full responsibility for compliance with all relevant privacy
            and data protection regulations. Documents are provided solely for loan
            evaluation purposes and must not be stored, shared, or used for any other purpose.
          </div>
          <label class="dv-gate-checkbox-row" for="dv-consent-cb">
            <input type="checkbox" id="dv-consent-cb" />
            <span>I agree to the terms and accept full legal responsibility for the lawful use of these documents.</span>
          </label>
        </div>
        <div class="dv-gate-footer">
          <button id="dv-gate-cancel" class="dv-tool-btn dv-tool-btn-secondary">Cancel</button>
          <button id="dv-gate-continue" class="dv-tool-btn dv-tool-btn-primary" disabled style="opacity:0.45;cursor:not-allowed;">
            <i class="fa-solid fa-shield-halved"></i> Continue
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cb      = overlay.querySelector('#dv-consent-cb');
    const contBtn = overlay.querySelector('#dv-gate-continue');
    const cancelBtn = overlay.querySelector('#dv-gate-cancel');

    cb.addEventListener('change', () => {
      contBtn.disabled = !cb.checked;
      contBtn.style.opacity = cb.checked ? '1' : '0.45';
      contBtn.style.cursor  = cb.checked ? 'pointer' : 'not-allowed';
    });
    contBtn.addEventListener('click', () => {
      if (!cb.checked) return;
      try { sessionStorage.setItem(CONSENT_KEY, '1'); } catch {}
      _closeOverlay(overlay);
      onAccepted();
    });
    cancelBtn.addEventListener('click', () => _closeOverlay(overlay));
  }

  // ── Build the full docs array from col object ──────────────────────────────
  function _buildDocsArray(col) {
    // New format: col.docs array
    if (Array.isArray(col.docs) && col.docs.length > 0) {
      return col.docs.map(d => ({
        label:  d.label || 'Document',
        hash:   d.hash  || '',
        uri:    d.uri   || '',
        status: d.status || (d.uri?.startsWith('ipfs://') ? 'ipfs' : d.uri ? 'local' : 'empty')
      }));
    }
    // Legacy format: single documentURI / documentHash
    const legacyUri  = col.documentURI  || col.docURI  || '';
    const legacyHash = col.documentHash || col.docHash || '';
    if (legacyUri || legacyHash) {
      return [{
        label:  'Collateral Document',
        hash:   legacyHash,
        uri:    legacyUri,
        status: legacyUri.startsWith('ipfs://') ? 'ipfs' : legacyUri ? 'local' : 'empty'
      }];
    }
    return [];
  }

  // ── Show the document viewer ───────────────────────────────────────────────
  function _showViewer(loanId, col) {
    _injectCSS();

    const docs = _buildDocsArray(col);
    let activeIdx = 0;

    const overlay = document.createElement('div');
    overlay.className = 'dv-overlay';
    overlay.style.zIndex = Z_VIEWER;

    // ── Render active doc ────────────────────────────────────────────────────
    function _renderDoc(idx) {
      const doc     = docs[idx];
      const rawUri  = doc?.uri  || '';
      const hash    = doc?.hash || '';
      const docUrl  = _resolveUrl(rawUri);
      const type    = _fileType(docUrl);
      const hasDoc  = !!docUrl;
      const isIPFS  = doc?.status === 'ipfs';
      const filename = `DaatFI-Loan${loanId}-Doc${idx+1}`;

      // Update tabs active state
      overlay.querySelectorAll('.dv-doc-tab').forEach((t, ti) => {
        t.classList.toggle('active', ti === idx);
      });

      // Update toolbar
      const toolbar = overlay.querySelector('#dv-toolbar');
      toolbar.innerHTML = `
        <span class="dv-tool-badge">
          <i class="fa-solid fa-shield-halved"></i> Consent Verified
        </span>
        ${hash ? `<span class="dv-tool-badge" style="background:rgba(139,92,246,0.08);border-color:rgba(139,92,246,0.25);color:var(--purple,#8b5cf6);">
          <i class="fa-solid fa-fingerprint"></i> SHA-256: ${hash.slice(0,14)}…
        </span>` : ''}
        ${isIPFS ? `<span class="dv-tool-badge" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.25);color:var(--green,#10b981);">
          <i class="fa-solid fa-cloud"></i> IPFS
        </span>` : rawUri.startsWith('file://') ? `<span class="dv-tool-badge" style="background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.25);color:var(--amber,#f59e0b);">
          <i class="fa-solid fa-triangle-exclamation"></i> Local hash only
        </span>` : ''}
        <span class="dv-tool-sep"></span>
        ${hasDoc ? `
          <button class="dv-tool-btn dv-tool-btn-secondary" id="dv-btn-newtab" title="Open in new tab">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
          </button>
          <a class="dv-tool-btn dv-tool-btn-primary" id="dv-btn-download" href="${docUrl}" download="${filename}" title="Download">
            <i class="fa-solid fa-download"></i> Download
          </a>
        ` : ''}
      `;

      // Update preview
      const previewArea = overlay.querySelector('#dv-preview-area');
      previewArea.innerHTML = _buildPreview(docUrl, type, rawUri, hash);

      // Wire new-tab button
      const newTabBtn = toolbar.querySelector('#dv-btn-newtab');
      if (newTabBtn) {
        newTabBtn.addEventListener('click', () => window.open(docUrl, '_blank', 'noopener,noreferrer'));
      }

      // Wire image zoom
      const img = previewArea.querySelector('.dv-preview-img');
      if (img) img.addEventListener('click', () => img.classList.toggle('zoomed'));
    }

    // ── Build tabs HTML ──────────────────────────────────────────────────────
    function _buildTabsHtml() {
      if (docs.length === 0) return '<div class="dv-doc-tabs"><span style="padding:8px 14px;font-size:12px;color:var(--text-muted);">No documents attached</span></div>';
      return `<div class="dv-doc-tabs" id="dv-tabs">
        ${docs.map((d, i) => `
          <button class="dv-doc-tab${i === 0 ? ' active' : ''}" data-idx="${i}" title="${_esc(d.label)}">
            <span class="dv-doc-tab-dot ${d.status === 'ipfs' ? 'ipfs' : d.status === 'local' ? 'local' : 'empty'}"></span>
            ${_esc(d.label || `Doc ${i+1}`)}
          </button>
        `).join('')}
      </div>`;
    }

    overlay.innerHTML = `
      <div class="dv-viewer" role="dialog" aria-modal="true" aria-labelledby="dv-viewer-title">

        <!-- Header -->
        <div class="dv-viewer-header">
          <div class="dv-viewer-icon"><i class="fa-solid fa-folder-open"></i></div>
          <div style="flex:1;min-width:0;">
            <div class="dv-viewer-title" id="dv-viewer-title">Borrower Documents — Loan #${loanId}</div>
            <div class="dv-viewer-subtitle">
              ${col.colTypeLabel || 'RWA'}${col.assetType ? ' · ' + _esc(col.assetType) : ''}
              · ${docs.length} document(s) · ${docs.filter(d=>d.status==='ipfs').length} on IPFS
            </div>
          </div>
          <button class="dv-viewer-close" id="dv-close" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0
                111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293
                4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </button>
        </div>

        <!-- Document tabs -->
        ${_buildTabsHtml()}

        <!-- Toolbar -->
        <div class="dv-viewer-toolbar" id="dv-toolbar"></div>

        <!-- Preview area -->
        <div class="dv-preview-area" id="dv-preview-area"></div>

        <!-- Consent footer -->
        <div class="dv-consent-badge">
          <i class="fa-solid fa-circle-check"></i>
          Legal agreement accepted this session — viewing authorised under your declared compliance responsibility.
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    // Wire close
    overlay.querySelector('#dv-close').addEventListener('click', () => _closeOverlay(overlay));

    // Wire tabs
    overlay.querySelector('#dv-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.dv-doc-tab');
      if (!btn) return;
      activeIdx = parseInt(btn.dataset.idx, 10);
      _renderDoc(activeIdx);
    });

    // Render first doc
    if (docs.length > 0) {
      _renderDoc(0);
    } else {
      overlay.querySelector('#dv-toolbar').innerHTML = `
        <span class="dv-tool-badge"><i class="fa-solid fa-shield-halved"></i> Consent Verified</span>
      `;
      overlay.querySelector('#dv-preview-area').innerHTML = `
        <div class="dv-empty">
          <div class="dv-empty-icon">📂</div>
          <div class="dv-empty-text">No documents were submitted with this loan request.</div>
        </div>`;
    }
  }

  // ── Public entry point ─────────────────────────────────────────────────────
  async function open(loanId, col) {
    if (!col) {
      const rc = window.web3?.getReadContract?.();
      if (rc) {
        const toast = typeof showToast === 'function' ? showToast('Loading collateral data…', 'info', 0) : null;
        try {
          const raw  = await rc.getLoan(loanId);
          const loan = window.web3._normalizeLoan(raw);
          col = loan?.collateral || null;
          toast?.remove?.();
        } catch (e) {
          toast?.remove?.();
          if (typeof showToast === 'function') showToast('Failed to load collateral data.', 'error');
          return;
        }
      }
      if (!col) {
        if (typeof showToast === 'function') showToast('No collateral data available for this loan.', 'warning');
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

  global.DOCS = { open };

})(window);
