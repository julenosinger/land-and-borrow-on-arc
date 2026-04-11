/**
 * DaatFI — PDF Receipt System
 * Strictly additive — zero impact on existing features.
 *
 * Public API:
 *   RCPT.generate(loanData, type, txHashes)  → stores receipt, returns receiptId
 *   RCPT.view(receiptId)                     → opens PDF in modal (no auto-download)
 *   RCPT.viewForLoan(loanId, type)           → open latest receipt for a loan
 *   RCPT.getForLoan(loanId, type)            → returns stored receipt object or null
 *
 * Receipt types: 'LOAN_FUNDED' | 'LOAN_REPAID'
 */

;(function (global) {
  'use strict';

  // ── Storage key ─────────────────────────────────────────────────────────────
  const LS_KEY = 'daatfi-receipts-v1';

  // ── Load jsPDF lazily ────────────────────────────────────────────────────────
  let _jsPDFReady = false;
  let _jsPDFCallbacks = [];

  function _loadjsPDF(cb) {
    if (_jsPDFReady && global.jspdf) { cb(); return; }
    _jsPDFCallbacks.push(cb);
    if (document.getElementById('jspdf-cdn')) return; // already loading
    const s = document.createElement('script');
    s.id  = 'jspdf-cdn';
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = function () {
      _jsPDFReady = true;
      _jsPDFCallbacks.forEach(function (fn) { fn(); });
      _jsPDFCallbacks = [];
    };
    s.onerror = function () {
      console.error('[DaatFI Receipt] Failed to load jsPDF from CDN.');
    };
    document.head.appendChild(s);
  }

  // ── Receipt storage (localStorage, keyed by loanId + type) ──────────────────
  function _store() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { return {}; }
  }
  function _save(store) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch {}
  }

  function _storeReceipt(receiptObj) {
    const store = _store();
    store[receiptObj.receiptId] = receiptObj;
    // Also index by loanId+type for quick lookup
    const indexKey = `${receiptObj.loanId}::${receiptObj.type}`;
    store[indexKey] = receiptObj.receiptId;
    _save(store);
  }

  function _getById(receiptId) {
    return _store()[receiptId] || null;
  }

  function _getByLoan(loanId, type) {
    const store = _store();
    const indexKey = `${loanId}::${type}`;
    const rid = store[indexKey];
    return rid ? (store[rid] || null) : null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
    return d.toUTCString();
  }

  function _shortAddr(addr) {
    if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
    return addr.slice(0, 8) + '…' + addr.slice(-6);
  }

  function _docId(loanId, type) {
    const ts = Date.now().toString(36).toUpperCase();
    const prefix = type === 'LOAN_FUNDED' ? 'LF' : 'LR';
    return `DAATFI-${prefix}-${String(loanId).padStart(5,'0')}-${ts}`;
  }

  // ── SHA-256 verification hash ─────────────────────────────────────────────────
  async function _hashDoc(receiptId, loanId, type, txHash, timestamp) {
    const raw = [receiptId, String(loanId), type, txHash || '', String(timestamp)].join('|');
    try {
      const buf  = new TextEncoder().encode(raw);
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch {
      // Fallback if crypto.subtle not available
      return raw.split('').reduce((a,c) => ((a<<5)-a+c.charCodeAt(0))|0, 0).toString(16).padStart(8,'0');
    }
  }

  // ── PDF Builder ──────────────────────────────────────────────────────────────
  function _buildPDF(receipt) {
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const W = 210, M = 18; // A4 width, margin
    let y = 0;

    // ── Color palette ──────────────────────────────────────────────────────────
    const C = {
      navy:    [10,  20,  45],
      cyan:    [6,  182, 212],
      ink:     [15,  23,  42],
      muted:   [100, 116, 139],
      green:   [16, 185, 129],
      divider: [226, 232, 240],
      white:   [255, 255, 255],
      bg:      [248, 250, 252],
      amber:   [245, 158,  11],
    };

    function setFont(size, style, color) {
      doc.setFontSize(size);
      doc.setFont('helvetica', style || 'normal');
      doc.setTextColor(...(color || C.ink));
    }

    function fillRect(x, _y, w, h, color) {
      doc.setFillColor(...color);
      doc.rect(x, _y, w, h, 'F');
    }

    function line(_y, color) {
      doc.setDrawColor(...(color || C.divider));
      doc.setLineWidth(0.3);
      doc.line(M, _y, W - M, _y);
    }

    function text(str, x, _y, opts) {
      doc.text(String(str || '—'), x, _y, opts || {});
    }

    function label(lbl, val, lx, vx, _y, valColor) {
      setFont(8.5, 'bold', C.muted);
      text(lbl, lx, _y);
      setFont(8.5, 'normal', valColor || C.ink);
      text(String(val || '—'), vx, _y);
    }

    // ── HEADER BAND ────────────────────────────────────────────────────────────
    fillRect(0, 0, W, 38, C.navy);

    // Logo D mark (simple geometric)
    doc.setFillColor(...C.cyan);
    doc.roundedRect(M, 8, 14, 14, 2, 2, 'F');
    setFont(11, 'bold', C.navy);
    text('D', M + 3.5, 17.5);

    // Brand name
    setFont(18, 'bold', C.white);
    text('DaatFI', M + 18, 16);
    setFont(8, 'normal', C.cyan);
    text('Decentralized Lending Protocol · Arc Testnet', M + 18, 22);

    // Receipt type badge
    const typeLbl = receipt.type === 'LOAN_FUNDED' ? 'LOAN FUNDED RECEIPT' : 'LOAN REPAID RECEIPT';
    const badgeW = 52;
    fillRect(W - M - badgeW, 10, badgeW, 10, receipt.type === 'LOAN_FUNDED' ? C.cyan : C.green);
    setFont(7.5, 'bold', C.navy);
    text(typeLbl, W - M - badgeW + 3, 16.5);

    y = 44;

    // ── DOCUMENT META ROW ──────────────────────────────────────────────────────
    fillRect(M, y, W - 2*M, 14, C.bg);
    setFont(7.5, 'bold', C.muted);
    text('DOCUMENT ID', M + 3, y + 5);
    setFont(8, 'normal', C.ink);
    text(receipt.receiptId, M + 3, y + 10);

    setFont(7.5, 'bold', C.muted);
    text('ISSUED', W/2, y + 5);
    setFont(8, 'normal', C.ink);
    text(_fmtDate(receipt.issuedAt), W/2, y + 10);

    setFont(7.5, 'bold', C.muted);
    text('STATUS', W - M - 50, y + 5);
    const statusColor = receipt.type === 'LOAN_FUNDED' ? C.cyan : C.green;
    setFont(8, 'bold', statusColor);
    text(receipt.type === 'LOAN_FUNDED' ? 'ACTIVE' : 'FULLY REPAID', W - M - 50, y + 10);

    y += 20;

    // ── SECTION: PARTIES ───────────────────────────────────────────────────────
    setFont(9, 'bold', C.cyan);
    text('PARTIES INVOLVED', M, y);
    y += 2;
    line(y);
    y += 6;

    // Borrower / Lender columns
    const col1 = M, col2 = W/2 + 2, colV1 = M + 30, colV2 = W/2 + 30;
    const b = receipt.borrower, l = receipt.lender;

    setFont(8, 'bold', C.navy); text('BORROWER', col1, y);
    setFont(8, 'bold', C.navy); text('LENDER',   col2, y);
    y += 6;

    const partyRows = [
      ['Full Name',       b.fullName,    l.fullName],
      ['Email',           b.email,       l.email],
      ['City',            b.city,        l.city],
      ['Country',         b.country,     l.country],
      ['Employment',      b.employment,  '—'],
      ['Wallet Address',  _shortAddr(b.wallet),  _shortAddr(l.wallet)],
    ];
    for (const [lbl, bv, lv] of partyRows) {
      label(lbl+':', bv || '—', col1, colV1, y);
      label(lbl+':', lv || '—', col2, colV2, y);
      y += 6;
    }
    // Full wallet addresses (monospace-style, smaller)
    setFont(7, 'bold', C.muted); text('Full Wallet:', col1, y);
    setFont(6.5, 'normal', C.ink); text(b.wallet || '—', colV1, y);
    setFont(7, 'bold', C.muted); text('Full Wallet:', col2, y);
    setFont(6.5, 'normal', C.ink); text(l.wallet || '—', colV2, y);
    y += 10;

    // ── SECTION: LOAN DETAILS ──────────────────────────────────────────────────
    setFont(9, 'bold', C.cyan);
    text('LOAN DETAILS', M, y);
    y += 2;
    line(y);
    y += 6;

    const loan = receipt.loan;
    const platformFeePct = 0.02;
    const platformFeeAmt = (parseFloat(loan.principalAmount || 0) * platformFeePct).toFixed(2);
    const loanRows = [
      ['Loan ID',              `#${loan.id}`],
      ['Principal Amount',     `$${parseFloat(loan.principalAmount || 0).toFixed(2)} USDC`],
      ['Interest Rate',        `${loan.interestRateMonthly || '—'}% / month`],
      ['Platform Fee (2%)',    `$${platformFeeAmt} USDC`],
      ['Total Repayable',      `$${(parseFloat(loan.totalRepayable || 0) + parseFloat(loan.principalAmount || 0) * platformFeePct).toFixed(2)} USDC`],
      ['Installments',         `${loan.paidInstallments || 0} / ${loan.totalInstallments || '—'} paid`],
      ['Installment Amount',   `$${parseFloat(loan.installmentAmount || 0).toFixed(2)} USDC`],
      ['Loan Status',          loan.statusLabel || '—'],
      ['Created At',           _fmtDate(loan.createdAt * 1000)],
      ['Funded At',            loan.fundedAt ? _fmtDate(loan.fundedAt * 1000) : '—'],
      ['Repaid At',            receipt.repaidAt ? _fmtDate(receipt.repaidAt) : '—'],
    ];

    const half = Math.ceil(loanRows.length / 2);
    for (let i = 0; i < half; i++) {
      const left  = loanRows[i];
      const right = loanRows[i + half];
      const leftColor  = left[0].startsWith('Platform Fee')  ? C.amber : undefined;
      const rightColor = right && right[0].startsWith('Platform Fee') ? C.amber : undefined;
      label(left[0]+':', left[1], col1, colV1, y, leftColor);
      if (right) label(right[0]+':', right[1], col2, colV2, y, rightColor);
      y += 6;
    }
    y += 4;

    // ── SECTION: COLLATERAL ────────────────────────────────────────────────────
    setFont(9, 'bold', C.cyan);
    text('COLLATERAL', M, y);
    y += 2;
    line(y);
    y += 6;

    const col = receipt.collateral;
    const colRows = [
      ['Type',              col.colTypeLabel || '—'],
      ['Asset Type',        col.assetType    || '—'],
      ['Description',       col.description  || '—'],
      ['Estimated Value',   col.estimatedValueUSD ? `$${col.estimatedValueUSD} USD` : '—'],
      ['Jurisdiction',      col.jurisdiction || '—'],
      ['Document Hash',     col.documentHash ? col.documentHash.slice(0,24)+'…' : '—'],
      ['On-chain Reference',col.reference   ? col.reference.slice(0,40)+'…' : '—'],
    ];
    for (const [lbl, val] of colRows) {
      label(lbl+':', val, col1, colV1, y);
      y += 5.5;
    }
    y += 4;

    // ── SECTION: ON-CHAIN DATA ─────────────────────────────────────────────────
    setFont(9, 'bold', C.cyan);
    text('ON-CHAIN VERIFICATION', M, y);
    y += 2;
    line(y);
    y += 6;

    const txRows = [
      ['Smart Contract',  receipt.contractAddress || window.CONTRACT_ADDRESS || '—'],
      ['Network',         'Arc Testnet · Chain ID 5042002'],
      ['Tx (Creation)',   receipt.txHashes.create  || '—'],
      ['Tx (Funding)',    receipt.txHashes.fund    || '—'],
      ['Tx (Repayment)',  receipt.txHashes.repay   || '—'],
    ];
    for (const [lbl, val] of txRows) {
      setFont(8, 'bold', C.muted);  text(lbl+':', col1, y);
      setFont(7, 'normal', C.ink);
      // Wrap long hashes
      const maxW = W - 2*M - 44;
      const lines = doc.splitTextToSize(String(val), maxW);
      doc.text(lines, col1 + 44, y);
      y += (lines.length > 1 ? lines.length * 4 : 5.5);
    }
    y += 4;

    // ── VERIFICATION BAND ──────────────────────────────────────────────────────
    if (y > 240) { doc.addPage(); y = 20; }
    fillRect(M, y, W - 2*M, 20, C.bg);
    setFont(7.5, 'bold', C.muted);
    text('DOCUMENT INTEGRITY HASH (SHA-256)', M + 3, y + 6);
    setFont(6.5, 'normal', C.ink);
    const hashLines = doc.splitTextToSize(receipt.verificationHash || '—', W - 2*M - 6);
    doc.text(hashLines, M + 3, y + 11);
    y += 26;

    // ── LEGAL FOOTER ───────────────────────────────────────────────────────────
    if (y > 255) { doc.addPage(); y = 20; }
    line(y, C.divider);
    y += 5;
    setFont(7, 'normal', C.muted);
    const legal = [
      'This document is an automated digital receipt generated by the DaatFI protocol on Arc Testnet.',
      'It does not constitute legal or financial advice. Verify all transaction hashes on https://testnet.arcscan.app',
      'DaatFI is a non-custodial, decentralized protocol. RWA collateral enforcement is off-chain.',
      `© ${new Date().getFullYear()} DaatFI — Decentralized Lending Protocol`,
    ];
    for (const ln of legal) {
      text(ln, W/2, y, { align: 'center' });
      y += 4.5;
    }

    // ── PAGE NUMBER ────────────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      setFont(7, 'normal', C.muted);
      text(`Page ${i} of ${pageCount}`, W/2, 292, { align: 'center' });
    }

    return doc;
  }

  // ── Open PDF in modal (no auto-download) ─────────────────────────────────────
  function _openPDFModal(doc, receiptId, loanId, type) {
    const pdfBlob  = doc.output('blob');
    const pdfUrl   = URL.createObjectURL(pdfBlob);
    const typeLbl  = type === 'LOAN_FUNDED' ? 'Loan Funded' : 'Loan Repaid';
    const filename = `DaatFI-Receipt-Loan${loanId}-${type}.pdf`;

    const html = `
      <div style="display:flex; flex-direction:column; height:75vh; gap:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-size:13px; color:var(--text-secondary);">Receipt ID: <span style="font-family:monospace; color:var(--cyan);">${receiptId}</span></div>
            <div style="font-size:12px; color:var(--text-muted);">Loan #${loanId} · ${typeLbl}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="window.open('${pdfUrl}','_blank')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in New Tab
            </button>
            <a class="btn btn-secondary btn-sm" href="${pdfUrl}" download="${filename}">
              <i class="fa-solid fa-download"></i> Download PDF
            </a>
            <button class="btn btn-secondary btn-sm" onclick="(function(){var w=window.open('','_blank');w.document.write('<iframe src=\\'${pdfUrl}\\' style=\\'width:100%;height:100vh;border:none;\\'></iframe>');w.document.close();w.focus();w.print();})()">
              <i class="fa-solid fa-print"></i> Print
            </button>
          </div>
        </div>
        <iframe src="${pdfUrl}" style="flex:1; width:100%; border:1px solid var(--border); border-radius:8px;" title="Loan Receipt PDF"></iframe>
      </div>
    `;

    if (typeof showModal === 'function') {
      showModal({
        title: `<i class="fa-solid fa-file-pdf" style="color:#38bdf8;"></i> Loan Receipt — #${loanId}`,
        content: html,
        size:  'modal-xl',
        actions: [],
      });
    } else {
      // Fallback: open in new tab
      window.open(pdfUrl, '_blank');
    }

    // Clean up blob URL after modal closes (5 min grace)
    setTimeout(function () { URL.revokeObjectURL(pdfUrl); }, 300_000);
  }

  // ── Main generate function ────────────────────────────────────────────────────
  /**
   * Generate, store and automatically open a receipt PDF.
   *
   * @param {object} loanData   - normalized loan object from _normalizeLoan()
   * @param {string} type       - 'LOAN_FUNDED' | 'LOAN_REPAID'
   * @param {object} txHashes   - { create, fund, repay } — any may be null
   * @param {object} [lenderInfo] - { fullName, email, city, country, wallet }
   * @returns {Promise<string>} receiptId
   */
  async function generate(loanData, type, txHashes, lenderInfo) {
    const receiptId  = _docId(loanData.id, type);
    const issuedAt   = Date.now();
    const verHash    = await _hashDoc(receiptId, loanData.id, type, txHashes?.fund || txHashes?.repay || '', issuedAt);

    const borrower = {
      fullName:   loanData.borrowerInfo?.fullName   || '—',
      email:      loanData.borrowerInfo?.email      || '—',
      city:       loanData.borrowerInfo?.city       || '—',
      country:    loanData.borrowerInfo?.country    || '—',
      employment: loanData.borrowerInfo?.employmentStatus || '—',
      wallet:     loanData.borrower || '—',
    };

    const lender = {
      fullName: lenderInfo?.fullName || '—',
      email:    lenderInfo?.email    || '—',
      city:     lenderInfo?.city     || '—',
      country:  lenderInfo?.country  || '—',
      wallet:   loanData.lender || lenderInfo?.wallet || (global.web3?.address) || '—',
    };

    const receipt = {
      receiptId,
      type,
      loanId:          loanData.id,
      issuedAt,
      repaidAt:        type === 'LOAN_REPAID' ? issuedAt : null,
      verificationHash: verHash,
      contractAddress: global.CONTRACT_ADDRESS || '0x413508DBCb5Cbf86b93C09b9AE633Af8B14cEF5F',
      network:         'Arc Testnet',
      chainId:         5042002,
      borrower,
      lender,
      loan: {
        id:                   loanData.id,
        principalAmount:      loanData.principalAmount,
        interestRateMonthly:  loanData.interestRateMonthly,
        totalRepayable:       loanData.totalRepayable,
        installmentAmount:    loanData.installmentAmount,
        totalInstallments:    loanData.totalInstallments,
        paidInstallments:     loanData.paidInstallments,
        statusLabel:          loanData.statusLabel,
        createdAt:            loanData.createdAt,
        fundedAt:             loanData.fundedAt,
      },
      collateral:  loanData.collateral || {},
      txHashes:    txHashes || {},
    };

    _storeReceipt(receipt);

    // ── Auto-open PDF immediately after generation ────────────────────────────
    // Load jsPDF and open the receipt modal without waiting for user to click
    _loadjsPDF(function () {
      try {
        const doc = _buildPDF(receipt);
        _openPDFModal(doc, receiptId, receipt.loanId, receipt.type);
      } catch (pdfErr) {
        console.error('[DaatFI Receipt] Auto-open PDF error:', pdfErr);
      }
    });

    // Persist to backend (non-blocking, best-effort)
    try {
      await fetch('/api/receipts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:       receipt.type,
          loanId:     String(receipt.loanId),
          receiptId:  receipt.receiptId,
          txHash:     txHashes?.fund || txHashes?.repay || '',
          amount:     loanData.principalAmount,
          network:    'ARC-TESTNET',
          address:    lender.wallet,
        }),
      });
    } catch { /* best-effort */ }

    return receiptId;
  }

  // ── View receipt by ID ────────────────────────────────────────────────────────
  function view(receiptId) {
    const receipt = _getById(receiptId);
    if (!receipt) {
      if (typeof showToast === 'function') showToast('Receipt not found.', 'warning');
      return;
    }
    _loadjsPDF(function () {
      try {
        const doc = _buildPDF(receipt);
        _openPDFModal(doc, receiptId, receipt.loanId, receipt.type);
      } catch (err) {
        console.error('[DaatFI Receipt] PDF build error:', err);
        if (typeof showToast === 'function') showToast('Failed to generate PDF. Check console.', 'error');
      }
    });
  }

  // ── View receipt by loan + type ───────────────────────────────────────────────
  function viewForLoan(loanId, type) {
    const receipt = _getByLoan(loanId, type);
    if (receipt) { view(receipt.receiptId); return; }
    if (typeof showToast === 'function') showToast('Receipt not yet available for this loan.', 'info');
  }

  // ── Check existence ───────────────────────────────────────────────────────────
  function getForLoan(loanId, type) {
    return _getByLoan(loanId, type);
  }

  // ── Expose global API ─────────────────────────────────────────────────────────
  global.RCPT = { generate, view, viewForLoan, getForLoan };

})(window);
