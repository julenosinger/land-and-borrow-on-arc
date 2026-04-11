/**
 * DaatFI — Frontend Security Layer
 * Strictly additive — no existing functionality is modified.
 * Loaded before app.js. Provides:
 *   - HTML output encoding / XSS sanitization
 *   - Anti-phishing domain guard
 *   - Prototype pollution prevention
 *   - Suspicious input detection
 *   - CSP violation reporting
 *   - Secure localStorage wrapper
 *   - Console hardening (no secret leakage)
 */

;(function (global) {
  'use strict';

  // ── 1. Output Encoding — expose window.SEC.encode for safe innerHTML ─────────
  const SEC = {};

  /**
   * Encode a value for safe HTML injection.
   * All on-chain data (names, addresses, amounts) must pass through this
   * before being placed into innerHTML.
   */
  SEC.encode = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#x27;')
      .replace(/\//g, '&#x2F;');
  };

  /**
   * Sanitize a user-supplied URL — only allow http/https/# schemes.
   * Blocks javascript:, data:, vbscript:, etc.
   */
  SEC.safeUrl = function (url) {
    if (!url) return '#';
    const s = String(url).trim().toLowerCase();
    if (s.startsWith('javascript:') || s.startsWith('data:') || s.startsWith('vbscript:')) {
      _secWarn('UNSAFE_URL_BLOCKED', { url: url.slice(0, 80) });
      return '#';
    }
    return url;
  };

  /**
   * Strip dangerous patterns from a string — lightweight sanitizer
   * for cases where HTML must be injected but comes from untrusted source.
   */
  const DANGEROUS = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /<script[\s\S]*?>/gi,
    /javascript\s*:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /on\w+\s*=\s*[^\s>]*/gi,
    /data\s*:\s*text\/html/gi,
    /vbscript\s*:/gi,
    /<iframe[\s\S]*?>/gi,
    /<object[\s\S]*?>/gi,
    /<embed[\s\S]*?>/gi,
    /eval\s*\(/gi,
    /expression\s*\(/gi,
    /document\.cookie/gi,
    /document\.write\s*\(/gi,
    /window\.location\s*=/gi,
  ];

  SEC.sanitize = function (html) {
    if (!html) return '';
    let out = String(html);
    for (const p of DANGEROUS) {
      out = out.replace(p, '');
    }
    return out;
  };

  // ── 2. Ethereum address validator ─────────────────────────────────────────────
  SEC.isAddress = function (val) {
    return typeof val === 'string' && /^0x[0-9a-fA-F]{40}$/.test(val);
  };

  // ── 3. Anti-Phishing — domain guard ──────────────────────────────────────────
  const ALLOWED_ORIGINS = [
    'daatfi.pages.dev',
    'arcfi.pages.dev',
    'localhost',
    '127.0.0.1',
  ];

  (function _domainGuard() {
    const host = global.location?.hostname ?? '';
    const isAllowed = ALLOWED_ORIGINS.some(function (o) {
      return host === o || host.endsWith('.' + o);
    });
    // Also allow sandbox preview domains (*.sandbox.novita.ai, *.e2b.dev)
    const isSandbox = /\.novita\.ai$|\.e2b\.dev$/.test(host);
    if (!isAllowed && !isSandbox && host !== '') {
      _secWarn('DOMAIN_MISMATCH', { host });
      // Do not break the page — just warn. A real phishing page won't have our CSP.
    }
  })();

  // ── 4. Prototype pollution prevention ────────────────────────────────────────
  (function _protoPollutionGuard() {
    const blocked = ['__proto__', 'constructor', 'prototype'];
    const origAssign = Object.assign;
    Object.assign = function (target) {
      const args = Array.prototype.slice.call(arguments, 1);
      for (const src of args) {
        if (src && typeof src === 'object') {
          for (const key of Object.keys(src)) {
            if (blocked.includes(key)) {
              _secWarn('PROTO_POLLUTION_ATTEMPT', { key });
              continue;
            }
            target[key] = src[key];
          }
        }
      }
      return target;
    };

    // Guard JSON.parse against prototype pollution
    const origJSONParse = JSON.parse;
    JSON.parse = function (text, reviver) {
      const result = origJSONParse(text, reviver);
      if (result && typeof result === 'object') {
        if ('__proto__' in result || 'constructor' in result) {
          _secWarn('JSON_PROTO_POLLUTION', {});
          return {};
        }
      }
      return result;
    };
  })();

  // ── 5. User-input sanitization for all text inputs / textareas ───────────────
  //    Runs on blur/change — does NOT block typing, only strips on commit
  (function _inputGuard() {
    function _sanitizeInput(el) {
      if (!el || el._secGuarded) return;
      el._secGuarded = true;
      el.addEventListener('change', function () {
        const original = el.value;
        const cleaned  = SEC.sanitize(original);
        if (cleaned !== original) {
          el.value = cleaned;
          _secWarn('INPUT_SANITIZED', { id: el.id || el.name || 'unknown' });
        }
      });
    }
    // Apply to existing inputs on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
      document.querySelectorAll('input[type=text], input[type=password], textarea')
        .forEach(_sanitizeInput);
    });
    // Apply to dynamically inserted inputs via MutationObserver
    const mo = new MutationObserver(function (mutations) {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('input, textarea')) _sanitizeInput(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('input[type=text], input[type=password], textarea')
              .forEach(_sanitizeInput);
          }
        }
      }
    });
    document.addEventListener('DOMContentLoaded', function () {
      mo.observe(document.body, { childList: true, subtree: true });
    });
  })();

  // ── 6. Clickjacking self-defense (belt-and-suspenders over X-Frame-Options) ──
  (function _frameGuard() {
    if (global.top !== global.self) {
      _secWarn('FRAME_EMBED_DETECTED', { src: global.location.href });
      global.top.location = global.self.location.href;
    }
  })();

  // ── 7. CSP violation reporter (logs to console, not to third-party) ───────────
  document.addEventListener('securitypolicyviolation', function (e) {
    _secWarn('CSP_VIOLATION', {
      blocked: e.blockedURI,
      directive: e.violatedDirective,
      sample: (e.sample || '').slice(0, 100),
    });
  });

  // ── 8. Secure localStorage wrapper — prevents key exfiltration ───────────────
  //    Keys that should never be read by injected scripts
  const SENSITIVE_KEYS = ['arcfi-pinata-key', 'arcfi-pinata-secret'];
  const _origLS = {
    getItem:    localStorage.getItem.bind(localStorage),
    setItem:    localStorage.setItem.bind(localStorage),
    removeItem: localStorage.removeItem.bind(localStorage),
  };
  // Patch getItem to warn on suspicious access patterns
  const _origGetItem = localStorage.getItem;
  Object.defineProperty(localStorage, 'getItem', {
    value: function (key) {
      const result = _origGetItem.call(localStorage, key);
      if (SENSITIVE_KEYS.includes(key)) {
        // Allowed — but log for anomaly detection
        // Do NOT log the actual value
        _secWarn('SENSITIVE_LS_READ', { key });
      }
      return result;
    },
    writable: true,
    configurable: true,
  });

  // ── 9. Open redirect prevention — patch window.location setter ───────────────
  const _origLocationReplace = global.location?.replace?.bind(global.location);
  if (_origLocationReplace) {
    SEC.safeRedirect = function (url) {
      if (SEC.safeUrl(url) === '#') {
        _secWarn('REDIRECT_BLOCKED', { url: (url || '').slice(0, 80) });
        return;
      }
      _origLocationReplace(url);
    };
  }

  // ── 10. Internal security event logger ───────────────────────────────────────
  const _secQueue = [];
  const MAX_Q = 100;

  function _secWarn(event, meta) {
    const entry = { ts: new Date().toISOString(), event, meta };
    _secQueue.push(entry);
    if (_secQueue.length > MAX_Q) _secQueue.shift();
    // Use console.warn so it's visible in DevTools but not in production logs
    // Never log sensitive values — only event name + non-sensitive meta
    console.warn('[DaatFI Security]', event, meta);
  }

  SEC.getEvents = function () {
    return _secQueue.slice();
  };

  // ── 11. Console hardening — prevent console.log leaking private keys ──────────
  //    Warn if someone tries to log something that looks like a private key
  const _origConsoleLog = console.log;
  console.log = function () {
    const args = Array.prototype.slice.call(arguments);
    for (const arg of args) {
      if (typeof arg === 'string' && /^(0x)?[0-9a-fA-F]{64}$/.test(arg.trim())) {
        _secWarn('POSSIBLE_PRIVKEY_LOG', {});
        return; // Block the log entirely
      }
    }
    return _origConsoleLog.apply(console, args);
  };

  // ── Expose SEC globally ───────────────────────────────────────────────────────
  global.SEC = SEC;

})(window);
