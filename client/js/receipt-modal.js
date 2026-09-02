// =============================================
// receipt-modal.js - In-System Receipt Lightbox & Preview Modal
//
// Features:
// 1. In-app pop-up preview for receipts (No external tab redirection).
// 2. Multi-format support: Supabase storage images, direct URLs, PDFs, and Google Drive previews.
// 3. Interactive controls: 90° Image Rotation, Zoom In/Out toggle, and Download/New-tab fallback.
// 4. Mobile & Desktop responsive layout with Dark/Light glassmorphism.
// 5. Global delegation: automatically intercepts any '.receipt-link' click.
// =============================================

const ReceiptModal = (() => {
  let _overlay = null;
  let _img = null;
  let _iframe = null;
  let _stage = null;
  let _loadingSpinner = null;
  let _errorMessage = null;
  let _titleEl = null;
  let _descEl = null;
  let _amountBadge = null;
  let _dateBadge = null;
  let _rotation = 0;
  let _isZoomed = false;
  let _currentUrl = '';
  let _prevActiveElement = null;

  // Normalizes Google Drive link for iframe preview
  function normalizeDriveUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return url;
  }

  function isPdfUrl(url) {
    if (!url) return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.pdf') || url.includes('/pdf') || url.includes('application%2Fpdf');
  }

  function isDriveUrl(url) {
    if (!url) return false;
    return url.includes('drive.google.com') || url.includes('docs.google.com');
  }

  function createModalDOM() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'receipt-viewer-overlay';
    _overlay.className = 'receipt-viewer-overlay hidden';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Receipt Preview');

    _overlay.innerHTML = `
      <div class="receipt-viewer-card" id="receipt-viewer-card">
        <!-- Header -->
        <div class="receipt-viewer-header">
          <div class="receipt-viewer-title-group">
            <div class="receipt-viewer-icon-badge">
              <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
            </div>
            <div class="receipt-viewer-text">
              <h3 id="receipt-viewer-title">Official Receipt</h3>
              <p id="receipt-viewer-desc" class="receipt-viewer-subtitle">Transaction Proof of Purchase</p>
            </div>
          </div>
          <div class="receipt-viewer-actions">
            <button type="button" class="receipt-viewer-btn" id="receipt-rotate-btn" title="Rotate 90°" aria-label="Rotate Image">
              <iconify-icon icon="solar:refresh-linear"></iconify-icon>
            </button>
            <button type="button" class="receipt-viewer-btn" id="receipt-zoom-btn" title="Toggle Zoom" aria-label="Toggle Zoom">
              <iconify-icon icon="solar:magnifer-zoom-in-linear"></iconify-icon>
            </button>
            <span class="receipt-viewer-divider"></span>
            <button type="button" class="receipt-viewer-btn receipt-viewer-close" id="receipt-close-btn" title="Close (Esc)" aria-label="Close">
              <iconify-icon icon="solar:close-circle-linear"></iconify-icon>
            </button>
          </div>
        </div>

        <!-- Stage Content -->
        <div class="receipt-viewer-stage" id="receipt-viewer-stage">
          <div class="receipt-viewer-spinner" id="receipt-viewer-spinner">
            <div class="receipt-spinner-ring"></div>
            <span>Loading receipt proof…</span>
          </div>

          <div class="receipt-viewer-error hidden" id="receipt-viewer-error">
            <iconify-icon icon="solar:shield-warning-linear" class="receipt-error-icon"></iconify-icon>
            <h4>Receipt preview unavailable</h4>
            <p>The document or image could not be loaded. Please check your connection or try again.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="receipt-retry-btn">
              <iconify-icon icon="solar:refresh-linear"></iconify-icon> Retry
            </button>
          </div>

          <div class="receipt-img-scroller" id="receipt-img-scroller">
            <img class="receipt-viewer-img hidden" id="receipt-viewer-img" alt="Official Receipt Preview" />
          </div>
          
          <iframe class="receipt-viewer-frame hidden" id="receipt-viewer-frame" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
        </div>

        <!-- Footer / Meta details -->
        <div class="receipt-viewer-footer">
          <div class="receipt-meta-chips">
            <span class="receipt-meta-chip receipt-meta-amount hidden" id="receipt-meta-amount">
              <iconify-icon icon="solar:wallet-money-linear"></iconify-icon>
              <strong id="receipt-meta-amount-val">₱0.00</strong>
            </span>
            <span class="receipt-meta-chip receipt-meta-date hidden" id="receipt-meta-date">
              <iconify-icon icon="solar:calendar-date-linear"></iconify-icon>
              <span id="receipt-meta-date-val">-</span>
            </span>
            <span class="receipt-meta-chip receipt-meta-category hidden" id="receipt-meta-type">
              <iconify-icon icon="solar:tag-linear"></iconify-icon>
              <span id="receipt-meta-type-val">-</span>
            </span>
          </div>
          <span class="receipt-hint-text">
            <iconify-icon icon="solar:keyboard-linear"></iconify-icon> Press <strong>ESC</strong> to close
          </span>
        </div>
      </div>
    `;

    document.body.appendChild(_overlay);

    // Cache elements
    _img = document.getElementById('receipt-viewer-img');
    _iframe = document.getElementById('receipt-viewer-frame');
    _stage = document.getElementById('receipt-viewer-stage');
    _loadingSpinner = document.getElementById('receipt-viewer-spinner');
    _errorMessage = document.getElementById('receipt-viewer-error');
    _titleEl = document.getElementById('receipt-viewer-title');
    _descEl = document.getElementById('receipt-viewer-desc');
    _amountBadge = document.getElementById('receipt-meta-amount');
    _dateBadge = document.getElementById('receipt-meta-date');

    // Bind Retry button
    const retryBtn = document.getElementById('receipt-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (_currentUrl) open(_currentUrl, {
          title: _titleEl?.textContent,
          desc: _descEl?.textContent,
        });
      });
    }

    // Bind Close events
    document.getElementById('receipt-close-btn').addEventListener('click', close);
    _overlay.addEventListener('click', (e) => {
      if (e.target === _overlay) close();
    });

    // Rotation Control
    const rotateBtn = document.getElementById('receipt-rotate-btn');
    rotateBtn.addEventListener('click', () => {
      _rotation = (_rotation + 90) % 360;
      applyTransform();
    });

    // Zoom Toggle Control
    const zoomBtn = document.getElementById('receipt-zoom-btn');
    zoomBtn.addEventListener('click', () => {
      _isZoomed = !_isZoomed;
      const scroller = document.getElementById('receipt-img-scroller');
      if (_isZoomed) {
        scroller.classList.add('is-zoomed');
        zoomBtn.innerHTML = '<iconify-icon icon="solar:magnifer-zoom-out-linear"></iconify-icon>';
        zoomBtn.setAttribute('title', 'Fit to Window');
      } else {
        scroller.classList.remove('is-zoomed');
        zoomBtn.innerHTML = '<iconify-icon icon="solar:magnifer-zoom-in-linear"></iconify-icon>';
        zoomBtn.setAttribute('title', 'Zoom In (Actual Size)');
      }
      applyTransform();
    });

    // Keyboard handlers
    window.addEventListener('keydown', (e) => {
      if (!_overlay || _overlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'r' || e.key === 'R') {
        rotateBtn.click();
      }
    });
  }

  function applyTransform() {
    if (!_img) return;
    _img.style.transform = `rotate(${_rotation}deg)`;
  }

  function resetState() {
    _rotation = 0;
    _isZoomed = false;
    if (_img) {
      _img.style.transform = '';
      _img.classList.add('hidden');
      _img.src = '';
    }
    if (_iframe) {
      _iframe.classList.add('hidden');
      _iframe.src = 'about:blank';
    }
    const scroller = document.getElementById('receipt-img-scroller');
    if (scroller) scroller.classList.remove('is-zoomed');

    const zoomBtn = document.getElementById('receipt-zoom-btn');
    if (zoomBtn) {
      zoomBtn.innerHTML = '<iconify-icon icon="solar:magnifer-zoom-in-linear"></iconify-icon>';
      zoomBtn.style.display = '';
    }
    const rotateBtn = document.getElementById('receipt-rotate-btn');
    if (rotateBtn) rotateBtn.style.display = '';

    if (_loadingSpinner) _loadingSpinner.classList.remove('hidden');
    if (_errorMessage) _errorMessage.classList.add('hidden');
  }

  // ---- Public API: open(url, details) ----
  function open(url, meta = {}) {
    if (!url) return;
    createModalDOM();
    resetState();

    _prevActiveElement = document.activeElement;
    _currentUrl = url;

    // Populate Headers & Meta Chips
    const desc = meta.desc || meta.description || 'Transaction Receipt Proof';
    if (_titleEl) _titleEl.textContent = meta.title || 'Official Receipt';
    if (_descEl) _descEl.textContent = desc;

    // Currency Amount
    const amountValEl = document.getElementById('receipt-meta-amount-val');
    if (meta.amount && amountValEl && _amountBadge) {
      const formatted = typeof UI !== 'undefined' && UI.currency ? UI.currency(meta.amount) : `₱${Number(meta.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
      amountValEl.textContent = formatted;
      _amountBadge.classList.remove('hidden');
    } else if (_amountBadge) {
      _amountBadge.classList.add('hidden');
    }

    // Date
    const dateValEl = document.getElementById('receipt-meta-date-val');
    if (meta.date && dateValEl && _dateBadge) {
      const formattedDate = typeof UI !== 'undefined' && UI.dateStr ? UI.dateStr(meta.date) : meta.date;
      dateValEl.textContent = formattedDate;
      _dateBadge.classList.remove('hidden');
    } else if (_dateBadge) {
      _dateBadge.classList.add('hidden');
    }

    // Category / Event Tag
    const typeBadge = document.getElementById('receipt-meta-type');
    const typeValEl = document.getElementById('receipt-meta-type-val');
    const tagText = meta.event || meta.type;
    if (tagText && typeBadge && typeValEl) {
      typeValEl.textContent = tagText;
      typeBadge.classList.remove('hidden');
    } else if (typeBadge) {
      typeBadge.classList.add('hidden');
    }

    // Show Overlay
    _overlay.classList.remove('hidden', 'receipt-viewer-closing');
    document.body.style.overflow = 'hidden';

    // Content Display Strategy
    const isDrive = isDriveUrl(url);
    const isPdf = isPdfUrl(url);

    if (isDrive) {
      // Google Drive Preview Iframe
      const previewUrl = normalizeDriveUrl(url);
      const rotateBtn = document.getElementById('receipt-rotate-btn');
      const zoomBtn = document.getElementById('receipt-zoom-btn');
      if (rotateBtn) rotateBtn.style.display = 'none';
      if (zoomBtn) zoomBtn.style.display = 'none';

      _iframe.onload = () => {
        if (_loadingSpinner) _loadingSpinner.classList.add('hidden');
        _iframe.classList.remove('hidden');
      };
      _iframe.onerror = () => {
        if (_loadingSpinner) _loadingSpinner.classList.add('hidden');
        if (_errorMessage) _errorMessage.classList.remove('hidden');
      };
      _iframe.src = previewUrl;
    } else if (isPdf) {
      // Direct PDF Embed
      const rotateBtn = document.getElementById('receipt-rotate-btn');
      const zoomBtn = document.getElementById('receipt-zoom-btn');
      if (rotateBtn) rotateBtn.style.display = 'none';
      if (zoomBtn) zoomBtn.style.display = 'none';

      _iframe.onload = () => {
        if (_loadingSpinner) _loadingSpinner.classList.add('hidden');
        _iframe.classList.remove('hidden');
      };
      _iframe.onerror = () => {
        if (_loadingSpinner) _loadingSpinner.classList.add('hidden');
        if (_errorMessage) _errorMessage.classList.remove('hidden');
      };
      _iframe.src = url;
    } else {
      // Image rendering (JPG, PNG, WebP)
      const testImg = new Image();
      testImg.onload = () => {
        if (_loadingSpinner) _loadingSpinner.classList.add('hidden');
        _img.src = url;
        _img.classList.remove('hidden');
      };
      testImg.onerror = () => {
        if (_loadingSpinner) _loadingSpinner.classList.add('hidden');
        if (_errorMessage) _errorMessage.classList.remove('hidden');
      };
      testImg.src = url;
    }
  }

  function close() {
    if (!_overlay || _overlay.classList.contains('hidden')) return;

    _overlay.classList.add('receipt-viewer-closing');
    setTimeout(() => {
      _overlay.classList.add('hidden');
      _overlay.classList.remove('receipt-viewer-closing');
      document.body.style.overflow = '';
      resetState();
      if (_prevActiveElement && typeof _prevActiveElement.focus === 'function') {
        _prevActiveElement.focus();
      }
    }, 180);
  }

  // ---- Global Interceptor for all .receipt-link elements ----
  function initGlobalInterceptor() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.receipt-link, [data-receipt-preview]');
      if (!link) return;

      const url = link.getAttribute('href') || link.dataset.receipt || link.dataset.receiptUrl;
      if (!url || url === '#' || url.startsWith('javascript:')) return;

      // Prevent the browser from opening a new tab
      e.preventDefault();
      e.stopPropagation();

      // Gather contextual metadata from attributes or nearest card/table row
      let desc = link.dataset.desc || link.getAttribute('title');
      let amount = link.dataset.amount;
      let date = link.dataset.date;
      let type = link.dataset.type;
      let eventName = link.dataset.event;

      if (!desc || !amount) {
        const tr = link.closest('tr');
        const card = link.closest('.data-card, .tx-item, .of-recent-item');
        if (tr) {
          const cells = tr.querySelectorAll('td');
          if (cells.length >= 4) {
            date = date || cells[0]?.textContent?.trim();
            eventName = eventName || cells[1]?.textContent?.trim();
            desc = desc || cells[3]?.textContent?.trim();
            amount = amount || cells[4]?.textContent?.replace(/[^0-9.-]/g, '');
          }
        } else if (card) {
          desc = desc || card.querySelector('.tx-desc, .of-recent-desc, [style*="font-weight:700"]')?.textContent?.trim();
          amount = amount || card.querySelector('.tx-amount, .is-neg, .is-pos')?.textContent?.replace(/[^0-9.-]/g, '');
        }
      }

      open(url, {
        desc: desc || 'Official Receipt Proof',
        amount: amount,
        date: date,
        type: type,
        event: eventName,
      });
    }, true); // Capture phase to intercept reliably
  }

  // Auto initialize interceptor on script load
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initGlobalInterceptor);
    } else {
      initGlobalInterceptor();
    }
  }

  return {
    open,
    show: open,
    close,
  };
})();

if (typeof window !== 'undefined') {
  window.ReceiptModal = ReceiptModal;
}
