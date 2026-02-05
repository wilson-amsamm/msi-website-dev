document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM ready');

  const GSHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbzr6mErbrtZNrOObgwD24JNWxZ9Ew5oErhK2eWZtWdYwp_S9L8KC7rCUbpF4tD0B5bnQA/exec";
  const RECAPTCHA_SITE_KEY = "6Ld_AWAsAAAAAKW-OCc7goto86eCafzuB3w0-9ob";
  const RECAPTCHA_ACTION = "order_submit";

  const form = document.getElementById('bulk-order-form');
  if (!form) return;

  console.log('Form element:', form);

  const table = document.getElementById('order-table');
  if (!table) return;

  function getTableBody() {
    const currentTable = document.getElementById('order-table');
    if (!currentTable) return null;
    let body = currentTable.querySelector('tbody');
    if (!body) {
      body = document.createElement('tbody');
      currentTable.appendChild(body);
    }
    return body;
  }

  let tableBody = getTableBody();

  const submitBtn = document.getElementById('submit-order-btn');
  let isSubmitting = false;

  if (submitBtn) {
    submitBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (isSubmitting) return;

      // 1) Validate first
      if (!validateForm()) return;

      // 2-4) Lock UI + show loading
      setSubmittingUI(true);
      isSubmitting = true;

      try {
        // 5) Submit in background
        const recaptchaToken = await getRecaptchaToken();
        const payload = await buildOrderPayload(recaptchaToken);
        const result = await submitToGoogleSheets(payload);

        setSubmittingUI(false);
        isSubmitting = false;

        showOrderSummaryModal(payload, result && result.order_number ? result.order_number : '');

        // 6b) Reload after a short delay (smooth UX)
        // handled by modal "OK"
      } catch (err) {
        // 7) Failure recovery
        console.error(err);
        alert('Submission failed. Please try again.');
        setSubmittingUI(false);
        isSubmitting = false;
      }
    });
  }

  function setSubmittingUI(isSubmitting) {
    const btn = document.getElementById('submit-order-btn');
    const overlay = document.getElementById('submit-overlay');
    if (!btn) return;

    if (isSubmitting) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerText;
      btn.innerText = 'Submitting...';
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
      if (overlay) overlay.classList.add('active');
    } else {
      btn.disabled = false;
      btn.innerText = btn.dataset.originalText || 'Submit Order';
      btn.style.opacity = '';
      btn.style.cursor = '';
      if (overlay) overlay.classList.remove('active');
    }
  }

  const addRowBtn = document.getElementById('add-row');

  let rowIndex = 0;

  const clearBtn = document.getElementById('clear-table');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('Clear all items from the order?')) return;

      // remove all rows / reset row index / reset grand total
      tableBody.innerHTML = '';
      rowIndex = 0;
      updateGrandTotal();

      createRow();
      renderMobileList();
    });
  }

  let productCatalog = {};
  const productDetailCache = new Map();

  fetch('/wp-json/orderform/v1/products')
    .then(res => res.json())
    .then(data => {
      productCatalog = data;
      window.productCatalog = productCatalog;
      console.log('Woo products loaded:', productCatalog);
    })
    .catch(err => {
      console.error('Failed to load Woo products', err);
    });

  /* =========================
     PRODUCT CATALOG
     =========================
  const productCatalog = {
    "SKU-001": { name: "Item A", price: 250 },
    "SKU-002": { name: "Item B", price: 400 },
    "SKU-003": { name: "Item C", price: 125 }
  };*/

  function fuzzyMatch(query, text) {
    query = query.toLowerCase();
    text = text.toLowerCase();

    let qIndex = 0;
    for (let i = 0; i < text.length && qIndex < query.length; i++) {
      if (text[i] === query[qIndex]) {
        qIndex++;
      }
    }
    return qIndex === query.length;
  }

  function showSkuSuggestions(row, query) {
    removeSkuSuggestions(row);

    if (!query) return;

    const matches = Object.keys(productCatalog)
      .filter(sku => fuzzyMatch(query, sku))
      .slice(0, 5);

    if (matches.length === 0) return;

    const list = document.createElement('div');
    list.className = 'sku-suggestions';
    list.dataset.activeIndex = '-1';

    matches.forEach((sku, index) => {
      const item = document.createElement('div');
      item.className = 'sku-suggestion';
      item.textContent = `${sku} - ${productCatalog[sku].name}`;
      item.dataset.index = index;

      item.addEventListener('mousedown', () => {
        const skuInput = row.querySelector('.sku');
        skuInput.value = sku;
        handleSkuLookup(row);
        removeSkuSuggestions(row);
      });

      list.appendChild(item);
    });

    const skuInput = row.querySelector('.sku');
    const parent = skuInput ? skuInput.parentElement : row;
    parent.appendChild(list);

    // Mobile: anchor dropdown to viewport to avoid clipping inside scroll containers
    if (window.matchMedia && window.matchMedia('(max-width: 840px)').matches && skuInput) {
      const rect = skuInput.getBoundingClientRect();
      list.classList.add('sku-suggestions--floating');
      list.style.position = 'fixed';
      list.style.left = '12px';
      list.style.right = '12px';
      list.style.top = `${rect.bottom + 6}px`;
      list.style.width = 'auto';
    }
  }

  function removeSkuSuggestions(row) {
    const existing = row.querySelector('.sku-suggestions');
    if (existing) existing.remove();
  }

  /* =========================
     ROW TOTAL
     ========================= */
  function updateRowTotal(row) {
    const priceInput = row.querySelector('.price-input');
    const qtyInput = row.querySelector('.qty');
    const totalInput = row.querySelector('.total-input');

    if (!priceInput || !qtyInput || !totalInput) return;

    const price = parseFloat(priceInput.value.replace(/[^\d.]/g, '')) || 0;
    const qty = parseInt(qtyInput.value, 10) || 0;

    totalInput.value = formatMoney(price * qty);
    updateGrandTotal();
    if (isMobileView()) {
      renderMobileList();
    }
  }

  /* =========================
     GRAND TOTAL
     ========================= */
  function updateGrandTotal() {
    tableBody = getTableBody() || tableBody;
    if (!tableBody) return;
    let total = 0;

    tableBody.querySelectorAll('.total-input').forEach(input => {
      total += parseFloat(input.value.replace(/[^\d.]/g, '')) || 0;
    });

    const grandTotalEl = document.getElementById('grand-total');
    if (grandTotalEl) {
      grandTotalEl.textContent = formatMoney(total);
    }
  }

  /* =========================
     SKU LOOKUP
     ========================= */
  function handleSkuLookup(row) {
    const skuInput = row.querySelector('.sku');
    const nameInput = row.querySelector('.product-name');
    const priceInput = row.querySelector('.price-input');
    const colorSelect = row.querySelector('.color-select');
    const sizeSelect = row.querySelector('.size-select');

    if (!productCatalog || Object.keys(productCatalog).length === 0) return;

    if (!skuInput || !nameInput || !priceInput) return;

    const sku = skuInput.value.trim().toUpperCase();
    if (!sku) return;

    const product = productCatalog[sku];

    if (!product) {
      row.dataset.invalidSku = "true";
      row.dataset.imageUrl = '';

      nameInput.value = '';
      priceInput.value = formatMoney(0);
      if (colorSelect) resetSelect(colorSelect, 'Color');
      if (sizeSelect) resetSelect(sizeSelect, 'Size');
      updateRowTotal(row);

      // visual cue only
      skuInput.classList.add('invalid');

      return;
    }

    nameInput.value = product.name;
    priceInput.value = formatMoney(product.price);
    row.dataset.invalidSku = "false";
    skuInput.classList.remove('invalid');
    const selectedColor = colorSelect ? colorSelect.value.trim() : '';
    row.dataset.imageUrl = getRowImageUrl(row, sku, selectedColor);
    updateRowTotal(row);

    // load color/size options from SKU endpoint
    if (colorSelect || sizeSelect) {
      loadProductOptions(row, sku);
    }
  }

  /* =========================
     CREATE ROW
     ========================= */
  function createRow() {
    rowIndex++;

    tableBody = getTableBody() || tableBody;
    if (!tableBody) return;

    const row = document.createElement('tr');
    row.classList.add('order-row');

    row.innerHTML = `
      <td><input type="text" name="items[${rowIndex}][sku]" class="sku" placeholder="SKU"></td>
      <td><input type="text" name="items[${rowIndex}][name]" class="product-name" readonly></td>
      <td>
        <select name="items[${rowIndex}][color]" class="color-select">
          <option value="">Color</option>
        </select>
      </td>
      <td>
        <select name="items[${rowIndex}][size]" class="size-select">
          <option value="">Size</option>
        </select>
      </td>
      <td><input type="text" name="items[${rowIndex}][price]" class="price-input" value="${formatMoney(0)}" readonly></td>
      <td><input type="number" name="items[${rowIndex}][qty]" class="qty" min="1" value="1"></td>
      <td><input type="text" class="total-input" value="${formatMoney(0)}" readonly></td>
      <td><button type="button" class="remove-row">x</button></td>
    `;

    tableBody.appendChild(row);
    updateRowTotal(row);
  }

  /* =========================
     VALIDATION
     ========================= */
  function validateForm() {
    tableBody = getTableBody() || tableBody;
    if (!tableBody) return false;

    const rows = tableBody.querySelectorAll('.order-row');

    if (rows.length === 0) {
      alert('Please add at least one product.');
      return false;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sku = row.querySelector('.sku');
      const qty = row.querySelector('.qty');

      if (row.dataset.invalidSku === "true") {
        alert(`Invalid SKU on row ${i + 1}.`);
        sku.focus();
        return false;
      }

      if (!sku || sku.value.trim() === '') {
        alert(`SKU is required on row ${i + 1}.`);
        sku.focus();
        return false;
      }

      if (!qty || parseInt(qty.value, 10) < 1) {
        alert(`Quantity must be at least 1 on row ${i + 1}.`);
        qty.focus();
        return false;
      }
    }

    const emailEl = document.querySelector('[name="email"]');
    const email = emailEl ? emailEl.value.trim() : '';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!email) {
      alert('Email address is required.');
      if (emailEl) emailEl.focus();
      return false;
    }
    if (!emailOk) {
      alert('Please enter a valid email address.');
      if (emailEl) emailEl.focus();
      return false;
    }

    const grandTotal = parseFloat(
      document.getElementById('grand-total')?.textContent.replace(/[^\d.]/g, '')
    ) || 0;

    if (grandTotal <= 0) {
      alert('Total amount must be greater than 0.');
      return false;
    }

    return true;
  }

  function getInputValue(name) {
    const el = document.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : '';
  }

  async function buildOrderPayload(recaptchaToken) {
    const items = [];

    tableBody = getTableBody() || tableBody;
    if (!tableBody) {
      return {
        transaction_id: Date.now().toString(),
        recaptcha: {
          token: recaptchaToken || "",
          action: RECAPTCHA_ACTION
        },
        customer: {
          first_name: getInputValue('first_name'),
          last_name: getInputValue('last_name'),
          phone: getInputValue('phone'),
          email: getInputValue('email'),
          company: getInputValue('company'),
          address: getInputValue('address')
        },
        items: [],
        total: 0
      };
    }

    const rows = Array.from(tableBody.querySelectorAll('.order-row'));
    for (const row of rows) {
      const sku = row.querySelector('.sku').value.trim();
      const name = row.querySelector('.product-name').value.trim();
      const color = row.querySelector('.color-select')?.value.trim() || '';
      const size = row.querySelector('.size-select')?.value.trim() || '';
      const imageUrl = await ensureImageUrl(row, sku);
      const price = parseFloat(
        row.querySelector('.price-input').value.replace(/[^\d.]/g, '')
      ) || 0;
      const qty = parseInt(row.querySelector('.qty').value, 10) || 0;

      items.push({
        sku,
        name,
        color,
        size,
        image_url: imageUrl,
        price,
        qty,
        amount: price * qty
      });
    }

    const total = parseFloat(
      document.getElementById('grand-total').textContent.replace(/[^\d.]/g, '')
    ) || 0;

    return {
      transaction_id: Date.now().toString(),
      recaptcha: {
        token: recaptchaToken || "",
        action: RECAPTCHA_ACTION
      },
      customer: {
        first_name: getInputValue('first_name'),
        last_name: getInputValue('last_name'),
        phone: getInputValue('phone'),
        email: getInputValue('email'),
        company: getInputValue('company'),
        address: getInputValue('address')
      },
      items,
      total
    };
  }

  async function submitToGoogleSheets(payload) {
    const formData = new FormData();
    formData.append('data', JSON.stringify(payload));

    const res = await fetch(GSHEET_ENDPOINT, {
      method: 'POST',
      body: formData
    });

    const text = await res.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(`Invalid response from Google Sheets: ${text}`);
    }

    if (!result.success) {
      throw new Error(result.error || `Apps Script error: ${text}`);
    }
    return result;
  }

  let recaptchaPromise = null;

  function loadRecaptcha() {
    if (!RECAPTCHA_SITE_KEY) return Promise.reject(new Error('Missing reCAPTCHA site key.'));
    if (window.grecaptcha) return Promise.resolve();
    if (recaptchaPromise) return recaptchaPromise;

    recaptchaPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load reCAPTCHA.'));
      document.head.appendChild(script);
    });

    return recaptchaPromise;
  }

  function getRecaptchaToken() {
    if (!RECAPTCHA_SITE_KEY) return Promise.resolve('');

    return loadRecaptcha().then(() => new Promise((resolve, reject) => {
      if (!window.grecaptcha || !window.grecaptcha.ready) {
        reject(new Error('reCAPTCHA not ready.'));
        return;
      }
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: RECAPTCHA_ACTION })
          .then(resolve)
          .catch(err => {
            console.error('reCAPTCHA execute failed:', err);
            reject(err);
          });
      });
    }));
  }

  // Preload reCAPTCHA v3 so the badge appears and grecaptcha is available.
  loadRecaptcha().catch(err => {
    console.error('reCAPTCHA preload failed:', err);
  });

  function resetSelect(select, placeholder) {
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    select.appendChild(opt);
    select.disabled = true;
  }

  function formatMoney(value) {
    const number = Number(value || 0);
    const formatted = number.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `PHP ${formatted}`;
  }

  function createOrderSummaryModal() {
    let overlay = document.querySelector('.msi-order-summary-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'msi-order-summary-overlay';
    overlay.innerHTML = `
      <div class="msi-order-summary-modal" role="dialog" aria-modal="true" aria-labelledby="msi-order-summary-title">
        <div class="msi-order-summary-header">
          <h3 id="msi-order-summary-title">Order Summary</h3>
          <button type="button" class="msi-order-summary-close" aria-label="Close">×</button>
        </div>
        <div class="msi-order-summary-body"></div>
        <div class="msi-order-summary-actions">
          <button type="button" class="msi-order-summary-ok">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.msi-order-summary-close');
    const okBtn = overlay.querySelector('.msi-order-summary-ok');

    const close = () => {
      overlay.classList.remove('is-open');
      document.body.classList.remove('msi-order-summary-open');
      window.location.reload();
    };

    closeBtn.addEventListener('click', close);
    okBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    return overlay;
  }

  function showOrderSummaryModal(payload, orderNumber) {
    const overlay = createOrderSummaryModal();
    const body = overlay.querySelector('.msi-order-summary-body');

    const itemsRows = (payload.items || []).map((item) => `
      <tr>
        <td>${item.sku || ''}</td>
        <td>${item.name || ''}</td>
        <td>${item.color || ''}</td>
        <td>${item.size || ''}</td>
        <td>${formatMoney(item.price)}</td>
        <td>${item.qty || 0}</td>
        <td>${formatMoney(item.amount)}</td>
      </tr>
    `).join('');

    body.innerHTML = `
      <div class="msi-order-summary-meta">
        <div><strong>Order Number:</strong> ${orderNumber || 'N/A'}</div>
        <div><strong>Customer:</strong> ${payload.customer.first_name} ${payload.customer.last_name}</div>
        <div><strong>Email:</strong> ${payload.customer.email}</div>
        <div><strong>Phone:</strong> ${payload.customer.phone}</div>
        <div><strong>Company:</strong> ${payload.customer.company}</div>
        <div><strong>Address:</strong> ${payload.customer.address}</div>
      </div>
      <div class="msi-order-summary-table-wrap">
        <table class="msi-order-summary-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Color</th>
              <th>Size</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>
      <div class="msi-order-summary-total">
        <span>Total</span>
        <strong>${formatMoney(payload.total)}</strong>
      </div>
    `;

    overlay.classList.add('is-open');
    document.body.classList.add('msi-order-summary-open');
  }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = '';
    const keys = Object.keys(items || {});
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = placeholder;
    select.appendChild(placeholderOpt);

    keys.forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = String(key).toUpperCase();
      select.appendChild(opt);
    });

    if (keys.length > 0) {
      select.value = keys[0];
      select.disabled = false;
    } else {
      select.disabled = true;
    }

    if (select.classList.contains('color-select')) {
      applyColorDot(select);
    }
  }

  function applyColorDot(select) {
    const row = select.closest('.order-row');
    if (!row) return;

    row.querySelectorAll('.color-dot').forEach(dot => dot.remove());

    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.setProperty('--dot-color', select.value || 'transparent');

    select.insertAdjacentElement('beforebegin', dot);
  }

  async function fetchProductDetails(sku) {
    if (productDetailCache.has(sku)) {
      return productDetailCache.get(sku);
    }

    try {
      const res = await fetch(`/wp-json/orderform/v1/product/${encodeURIComponent(sku)}`);
      if (!res.ok) {
        productDetailCache.set(sku, null);
        return null;
      }
      const data = await res.json();
      productDetailCache.set(sku, data);
      return data;
    } catch (err) {
      console.error('Failed to load SKU details', err);
      productDetailCache.set(sku, null);
      return null;
    }
  }

  function extractImageUrl(data) {
    if (!data) return '';
    if (data.colors && typeof data.colors === 'object') {
      const colorValues = Object.values(data.colors).filter(Boolean);
      if (colorValues.length) return colorValues[0];
    }
    if (typeof data.image_url === 'string' && data.image_url) return data.image_url;
    if (typeof data.image === 'string' && data.image) return data.image;
    if (data.image && typeof data.image.src === 'string') return data.image.src;
    if (data.sizes && typeof data.sizes === 'object') {
      const sizeValues = Object.values(data.sizes).filter(Boolean);
      if (sizeValues.length) return sizeValues[0];
    }
    if (Array.isArray(data.images) && data.images.length) {
      const first = data.images[0];
      if (typeof first === 'string') return first;
      if (first && typeof first.src === 'string') return first.src;
    }
    return '';
  }

  function getColorImageUrl(data, selectedColor) {
    if (!data || !selectedColor) return '';
    const colors = data.colors;
    if (!colors || typeof colors !== 'object') return '';
    const key = selectedColor.toLowerCase();
    if (colors[key]) return colors[key];
    const match = Object.keys(colors).find((colorKey) => colorKey.toLowerCase() === key);
    return match ? colors[match] : '';
  }

  function getRowImageUrl(row, sku, selectedColor) {
    const rowUrl = row && row.dataset ? row.dataset.imageUrl : '';
    if (rowUrl) return rowUrl;
    if (sku && productCatalog && productCatalog[sku]) {
      const product = productCatalog[sku];
      const colorUrl = getColorImageUrl(product, selectedColor);
      if (colorUrl) return colorUrl;
      const extracted = extractImageUrl(product);
      if (extracted) return extracted;
      if (typeof product.imageUrl === 'string' && product.imageUrl) return product.imageUrl;
    }
    return '';
  }

  async function ensureImageUrl(row, sku) {
    const selectedColor = row && row.querySelector
      ? (row.querySelector('.color-select')?.value.trim() || '')
      : '';
    const existing = getRowImageUrl(row, sku, selectedColor);
    if (existing) return existing;

    if (sku) {
      const cached = productDetailCache.get(sku);
      const cachedColorUrl = getColorImageUrl(cached, selectedColor);
      if (cachedColorUrl) {
        row.dataset.imageUrl = cachedColorUrl;
        return cachedColorUrl;
      }
      const cachedUrl = extractImageUrl(cached);
      if (cachedUrl) {
        row.dataset.imageUrl = cachedUrl;
        return cachedUrl;
      }

      const data = await fetchProductDetails(sku);
      const fetchedColorUrl = getColorImageUrl(data, selectedColor);
      if (fetchedColorUrl) {
        row.dataset.imageUrl = fetchedColorUrl;
        return fetchedColorUrl;
      }
      const fetchedUrl = extractImageUrl(data);
      if (fetchedUrl) {
        row.dataset.imageUrl = fetchedUrl;
        return fetchedUrl;
      }
    }

    return '';
  }

  async function loadProductOptions(row, sku) {
    const colorSelect = row.querySelector('.color-select');
    const sizeSelect = row.querySelector('.size-select');
    if (!colorSelect && !sizeSelect) return;

    if (colorSelect) resetSelect(colorSelect, 'Color');
    if (sizeSelect) resetSelect(sizeSelect, 'Size');

    const data = await fetchProductDetails(sku);
    if (!data) return;

    const selectedColor = colorSelect ? colorSelect.value.trim() : '';
    const colorUrl = getColorImageUrl(data, selectedColor);
    const imageUrl = colorUrl || extractImageUrl(data);
    if (imageUrl) row.dataset.imageUrl = imageUrl;

    if (colorSelect) fillSelect(colorSelect, data.colors || {}, 'Color');
    if (sizeSelect) fillSelect(sizeSelect, data.sizes || {}, 'Size');
  }

  function isMobileView() {
    return window.matchMedia && window.matchMedia('(max-width: 840px)').matches;
  }

  function ensureMobileList() {
    if (!isMobileView()) return null;
    let list = document.getElementById('order-table-mobile-list');
    if (!list) {
      list = document.createElement('div');
      list.id = 'order-table-mobile-list';
      list.className = 'order-table-mobile-list';
      const tableEl = document.getElementById('order-table');
      if (tableEl && tableEl.parentElement) {
        tableEl.parentElement.insertBefore(list, tableEl.nextSibling);
      }
    }
    return list;
  }

  function renderMobileList() {
    if (!isMobileView()) return;
    const list = ensureMobileList();
    if (!list) return;
    list.innerHTML = '';
    const rows = tableBody.querySelectorAll('.order-row');
    rows.forEach((row, index) => {
      const sku = row.querySelector('.sku')?.value.trim() || '';
      const name = row.querySelector('.product-name')?.value.trim() || '';
      const color = row.querySelector('.color-select')?.value.trim() || '';
      const size = row.querySelector('.size-select')?.value.trim() || '';
      const qty = row.querySelector('.qty')?.value || '';
      const price = row.querySelector('.price-input')?.value || '';
      const total = row.querySelector('.total-input')?.value || '';

      const card = document.createElement('div');
      card.className = 'order-table-mobile-card';
      card.dataset.rowIndex = String(index);
      card.innerHTML = `
        <h4>${sku || 'New Item'}${name ? ` • ${name}` : ''}</h4>
        <div class="order-table-mobile-meta">
          <div>Color: ${color || '-'}</div>
          <div>Size: ${size || '-'}</div>
          <div>Qty: ${qty || '-'}</div>
          <div>Price: ${price || '-'}</div>
          <div>Total: ${total || '-'}</div>
        </div>
        <div class="order-table-mobile-actions">
          <button type="button" class="edit-row">Edit</button>
          <button type="button" class="remove-row">Remove</button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  function createMobileModal() {
    let overlay = document.querySelector('.msi-mobile-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'msi-mobile-modal-overlay';
    overlay.innerHTML = `
      <div class="msi-mobile-modal" role="dialog" aria-modal="true" aria-labelledby="msi-mobile-modal-title">
        <div class="msi-mobile-modal-header">
          <h3 id="msi-mobile-modal-title">Product</h3>
          <button type="button" class="msi-mobile-modal-close" aria-label="Close">×</button>
        </div>
        <div class="msi-mobile-modal-body">
          <div class="msi-modal-sku-wrap">
            <label for="msi-modal-sku">Product Code</label>
            <input id="msi-modal-sku" class="sku" type="text" autocomplete="off" />
          </div>
          <div class="full">
            <label for="msi-modal-name">Product Name</label>
            <input id="msi-modal-name" type="text" readonly />
          </div>
          <div>
            <label for="msi-modal-color">Color</label>
            <select id="msi-modal-color"></select>
          </div>
          <div>
            <label for="msi-modal-size">Size</label>
            <select id="msi-modal-size"></select>
          </div>
          <div>
            <label for="msi-modal-qty">Quantity</label>
            <input id="msi-modal-qty" type="number" min="1" />
          </div>
          <div>
            <label for="msi-modal-price">Price</label>
            <input id="msi-modal-price" type="text" readonly />
          </div>
          <div>
            <label for="msi-modal-total">Total</label>
            <input id="msi-modal-total" type="text" readonly />
          </div>
        </div>
        <div class="msi-mobile-modal-actions">
          <button type="button" class="msi-mobile-modal-cancel">Cancel</button>
          <button type="button" class="msi-mobile-modal-save primary">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.msi-mobile-modal-close');
    const cancelBtn = overlay.querySelector('.msi-mobile-modal-cancel');
    [closeBtn, cancelBtn].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => closeMobileModal());
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeMobileModal();
    });

    return overlay;
  }

  let activeMobileRow = null;

  function openMobileModal(row) {
    if (!isMobileView()) return;
    const overlay = createMobileModal();
    activeMobileRow = row;
    syncModalFromRow(row);
    overlay.classList.add('is-open');
  }

  function closeMobileModal() {
    const overlay = document.querySelector('.msi-mobile-modal-overlay');
    if (overlay) overlay.classList.remove('is-open');
    activeMobileRow = null;
  }

  function syncModalFromRow(row) {
    const overlay = createMobileModal();
    const skuInput = overlay.querySelector('#msi-modal-sku');
    const nameInput = overlay.querySelector('#msi-modal-name');
    const colorSelect = overlay.querySelector('#msi-modal-color');
    const sizeSelect = overlay.querySelector('#msi-modal-size');
    const qtyInput = overlay.querySelector('#msi-modal-qty');
    const priceInput = overlay.querySelector('#msi-modal-price');
    const totalInput = overlay.querySelector('#msi-modal-total');

    skuInput.value = row.querySelector('.sku')?.value.trim() || '';
    nameInput.value = row.querySelector('.product-name')?.value.trim() || '';
    qtyInput.value = row.querySelector('.qty')?.value || '1';
    priceInput.value = row.querySelector('.price-input')?.value || 'PHP 0';
    totalInput.value = row.querySelector('.total-input')?.value || 'PHP 0.00';

    const sku = skuInput.value.trim().toUpperCase();
    if (!sku) {
      colorSelect.innerHTML = '<option value="">Color</option>';
      sizeSelect.innerHTML = '<option value="">Size</option>';
      return;
    }

    fetchProductDetails(sku).then((data) => {
      if (!data) return;
      fillModalSelect(colorSelect, data.colors || {}, 'Color');
      fillModalSelect(sizeSelect, data.sizes || {}, 'Size');

      const rowColor = row.querySelector('.color-select')?.value || '';
      const rowSize = row.querySelector('.size-select')?.value || '';
      if (rowColor) colorSelect.value = rowColor;
      if (rowSize) sizeSelect.value = rowSize;
    }).catch(() => {});
  }

  function fillModalSelect(select, items, placeholder) {
    select.innerHTML = '';
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = placeholder;
    select.appendChild(placeholderOpt);

    Object.keys(items || {}).forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = String(key).toUpperCase();
      select.appendChild(opt);
    });
  }

  function syncRowFromModal(row) {
    const overlay = document.querySelector('.msi-mobile-modal-overlay');
    if (!overlay) return;
    const skuInput = overlay.querySelector('#msi-modal-sku');
    const nameInput = overlay.querySelector('#msi-modal-name');
    const colorSelect = overlay.querySelector('#msi-modal-color');
    const sizeSelect = overlay.querySelector('#msi-modal-size');
    const qtyInput = overlay.querySelector('#msi-modal-qty');
    const priceInput = overlay.querySelector('#msi-modal-price');

    const sku = skuInput.value.trim().toUpperCase();
    row.querySelector('.sku').value = sku;
    row.querySelector('.product-name').value = nameInput.value.trim();
    row.querySelector('.color-select').value = colorSelect.value;
    row.querySelector('.size-select').value = sizeSelect.value;
    row.querySelector('.qty').value = qtyInput.value || 1;
    row.querySelector('.price-input').value = priceInput.value || formatMoney(0);

    applyColorDot(row.querySelector('.color-select'));
    updateRowTotal(row);
    renderMobileList();
  }

  function refreshModalTotals() {
    const overlay = document.querySelector('.msi-mobile-modal-overlay');
    if (!overlay) return;
    const qtyInput = overlay.querySelector('#msi-modal-qty');
    const priceInput = overlay.querySelector('#msi-modal-price');
    const totalInput = overlay.querySelector('#msi-modal-total');

    const qty = parseInt(qtyInput.value, 10) || 0;
    const price = parseFloat((priceInput.value || '').replace(/[^\d.]/g, '')) || 0;
    totalInput.value = formatMoney(price * qty);
  }

  function removeModalSkuSuggestions() {
    const overlay = document.querySelector('.msi-mobile-modal-overlay');
    if (!overlay) return;
    const existing = overlay.querySelector('.sku-suggestions');
    if (existing) existing.remove();
  }

  function showModalSkuSuggestions(query) {
    const overlay = document.querySelector('.msi-mobile-modal-overlay');
    if (!overlay) return;
    const wrap = overlay.querySelector('.msi-modal-sku-wrap');
    const skuInput = overlay.querySelector('#msi-modal-sku');
    if (!wrap || !skuInput) return;

    removeModalSkuSuggestions();
    if (!query) return;

    const matches = Object.keys(productCatalog)
      .filter((sku) => fuzzyMatch(query, sku))
      .slice(0, 5);

    if (!matches.length) return;

    const list = document.createElement('div');
    list.className = 'sku-suggestions';

    matches.forEach((sku) => {
      const item = document.createElement('div');
      item.className = 'sku-suggestion';
      item.textContent = `${sku} - ${productCatalog[sku].name}`;
      item.addEventListener('mousedown', () => {
        skuInput.value = sku;
        applySkuToActiveRow();
        removeModalSkuSuggestions();
      });
      list.appendChild(item);
    });

    wrap.appendChild(list);
  }

  function applySkuToActiveRow() {
    const overlay = document.querySelector('.msi-mobile-modal-overlay');
    if (!overlay || !activeMobileRow) return;
    const skuInput = overlay.querySelector('#msi-modal-sku');
    if (!skuInput) return;

    activeMobileRow.querySelector('.sku').value = skuInput.value.trim();
    handleSkuLookup(activeMobileRow);

    setTimeout(() => {
      syncModalFromRow(activeMobileRow);
      refreshModalTotals();
    }, 200);
  }

  function bindMobileModalEvents() {
    const overlay = createMobileModal();
    if (!overlay || overlay.dataset.bound === 'true') return;
    overlay.dataset.bound = 'true';

    const skuInput = overlay.querySelector('#msi-modal-sku');
    const qtyInput = overlay.querySelector('#msi-modal-qty');
    const priceInput = overlay.querySelector('#msi-modal-price');
    const colorSelect = overlay.querySelector('#msi-modal-color');
    const sizeSelect = overlay.querySelector('#msi-modal-size');
    const saveBtn = overlay.querySelector('.msi-mobile-modal-save');

    skuInput.addEventListener('input', (e) => {
      showModalSkuSuggestions(e.target.value.trim());
    });

    skuInput.addEventListener('blur', () => {
      setTimeout(removeModalSkuSuggestions, 150);
      applySkuToActiveRow();
    });

    qtyInput.addEventListener('input', refreshModalTotals);
    qtyInput.addEventListener('change', refreshModalTotals);

    colorSelect.addEventListener('change', () => {
      if (!activeMobileRow) return;
      activeMobileRow.querySelector('.color-select').value = colorSelect.value;
      applyColorDot(activeMobileRow.querySelector('.color-select'));
      ensureImageUrl(activeMobileRow, activeMobileRow.querySelector('.sku').value.trim()).then(() => {});
    });

    sizeSelect.addEventListener('change', () => {
      if (!activeMobileRow) return;
      activeMobileRow.querySelector('.size-select').value = sizeSelect.value;
    });

    priceInput.addEventListener('change', refreshModalTotals);

    saveBtn.addEventListener('click', () => {
      if (!activeMobileRow) return;
      syncRowFromModal(activeMobileRow);
      ensureImageUrl(activeMobileRow, activeMobileRow.querySelector('.sku').value.trim()).then(() => {});
      closeMobileModal();
    });
  }

  /* =========================
     EVENTS
     ========================= */
  createRow();
  renderMobileList();
  bindMobileModalEvents();

  if (addRowBtn) {
    addRowBtn.addEventListener('click', (e) => {
      e.preventDefault();
      createRow();
      if (isMobileView()) {
        const rows = tableBody.querySelectorAll('.order-row');
        const newRow = rows[rows.length - 1];
        openMobileModal(newRow);
      }
    });
  }

  const mobileList = ensureMobileList();
  if (mobileList) {
    mobileList.addEventListener('click', (e) => {
      const card = e.target.closest('.order-table-mobile-card');
      if (!card) return;
      const index = parseInt(card.dataset.rowIndex, 10);
      const rows = tableBody.querySelectorAll('.order-row');
      const row = rows[index];
      if (!row) return;

      if (e.target.classList.contains('remove-row')) {
        row.remove();
        updateGrandTotal();
        renderMobileList();
        return;
      }

      if (e.target.classList.contains('edit-row')) {
        openMobileModal(row);
      }
    });
  }

  tableBody.addEventListener('click', e => {
    if (e.target.classList.contains('remove-row')) {
      e.target.closest('tr').remove();
      updateGrandTotal();
      renderMobileList();
    }
  });

  document.addEventListener('input', e => {
    if (e.target.classList.contains('qty')) {
      updateRowTotal(e.target.closest('.order-row'));
    }
  });

  document.addEventListener('change', e => {
    if (e.target.classList.contains('color-select')) {
      applyColorDot(e.target);
      const row = e.target.closest('.order-row');
      const sku = row ? row.querySelector('.sku')?.value.trim() : '';
      const colorValue = e.target.value.trim();
      if (row && sku && colorValue) {
        const cached = productDetailCache.get(sku);
        const cachedColorUrl = getColorImageUrl(cached, colorValue);
        if (cachedColorUrl) {
          row.dataset.imageUrl = cachedColorUrl;
          return;
        }
        fetchProductDetails(sku).then((data) => {
          const fetchedColorUrl = getColorImageUrl(data, colorValue);
          if (fetchedColorUrl) {
            row.dataset.imageUrl = fetchedColorUrl;
          }
        }).catch(() => {});
      }
    }
  });

  document.addEventListener('blur', e => {
    if (e.target.classList.contains('sku')) {
      handleSkuLookup(e.target.closest('.order-row'));
    }
  }, true);

  form.addEventListener('submit', e => {
    if (!validateForm()) e.preventDefault();
  });

  document.addEventListener('input', function (e) {
    if (!e.target.classList.contains('sku')) return;

    const row = e.target.closest('.order-row');
    if (!row) return;

    const query = e.target.value.trim();
    showSkuSuggestions(row, query);
  });

  document.addEventListener('blur', function (e) {
    if (!e.target.classList.contains('sku')) return;

    const row = e.target.closest('.order-row');
    if (!row) return;

    setTimeout(() => removeSkuSuggestions(row), 150);
  }, true);

  function updateActiveSuggestion(list, direction) {
    const items = list.querySelectorAll('.sku-suggestion');
    if (!items.length) return;

    let index = parseInt(list.dataset.activeIndex, 10);
    index += direction;

    if (index < 0) index = items.length - 1;
    if (index >= items.length) index = 0;

    items.forEach(item => item.classList.remove('active'));
    items[index].classList.add('active');

    list.dataset.activeIndex = index;
  }

  document.addEventListener('keydown', function (e) {
    if (!e.target.classList.contains('sku')) return;

    const row = e.target.closest('.order-row');
    if (!row) return;

    const list = row.querySelector('.sku-suggestions');
    if (!list) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateActiveSuggestion(list, 1);
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateActiveSuggestion(list, -1);
    }

    if (e.key === 'Enter') {
      const index = parseInt(list.dataset.activeIndex, 10);
      const items = list.querySelectorAll('.sku-suggestion');

      if (index >= 0 && items[index]) {
        e.preventDefault();
        items[index].dispatchEvent(new MouseEvent('mousedown'));
      }
    }

    if (e.key === 'Escape') {
      removeSkuSuggestions(row);
      e.preventDefault();
    }
  });

  console.log('Order form JS initialized');
});


