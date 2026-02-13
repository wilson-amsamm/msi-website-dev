document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM ready');

  const GSHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbzr6mErbrtZNrOObgwD24JNWxZ9Ew5oErhK2eWZtWdYwp_S9L8KC7rCUbpF4tD0B5bnQA/exec";

  const form = document.getElementById('bulk-order-form');
  if (!form) return;

  console.log('Form element:', form);

  const table = document.getElementById('order-table');
  if (!table) return;

  let tableBody = table.querySelector('tbody');
  if (!tableBody) {
    tableBody = document.createElement('tbody');
    table.appendChild(tableBody);
  }

  const submitBtn = document.getElementById('submit-order-btn');

  if (submitBtn) {
    submitBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();

      // 1) Validate first
      if (!validateForm()) return;

      // 2-4) Lock UI + show loading
      setSubmittingUI(true);

      try {
        // 5) Submit in background
        const payload = buildOrderPayload();
        await submitToGoogleSheets(payload);

        // 6) Success confirmation
        alert('Order submitted successfully.');

        // 6b) Reload after a short delay (smooth UX)
        setTimeout(() => {
          window.location.reload();
        }, 700);
      } catch (err) {
        // 7) Failure recovery
        console.error(err);
        alert('Submission failed. Please try again.');
        setSubmittingUI(false);
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
  if (!addRowBtn) return;

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
    });
  }

  let productCatalog = {};
  const productDetailCache = new Map();

  fetch('/wp-json/orderform/v1/products')
    .then(res => res.json())
    .then(data => {
      productCatalog = data;
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

    row.querySelector('.sku').parentElement.appendChild(list);
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

    totalInput.value = `PHP ${(price * qty).toFixed(2)}`;
    updateGrandTotal();
  }

  /* =========================
     GRAND TOTAL
     ========================= */
  function updateGrandTotal() {
    let total = 0;

    tableBody.querySelectorAll('.total-input').forEach(input => {
      total += parseFloat(input.value.replace(/[^\d.]/g, '')) || 0;
    });

    const grandTotalEl = document.getElementById('grand-total');
    if (grandTotalEl) {
      grandTotalEl.textContent = `PHP ${total.toFixed(2)}`;
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

      nameInput.value = '';
      priceInput.value = 'PHP 0';
      if (colorSelect) resetSelect(colorSelect, 'Color');
      if (sizeSelect) resetSelect(sizeSelect, 'Size');
      updateRowTotal(row);

      // visual cue only
      skuInput.classList.add('invalid');

      return;
    }

    nameInput.value = product.name;
    priceInput.value = `PHP ${product.price}`;
    row.dataset.invalidSku = "false";
    skuInput.classList.remove('invalid');
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
      <td><input type="text" name="items[${rowIndex}][price]" class="price-input" value="PHP 0" readonly></td>
      <td><input type="number" name="items[${rowIndex}][qty]" class="qty" min="1" value="1"></td>
      <td><input type="text" class="total-input" value="PHP 0.00" readonly></td>
      <td><button type="button" class="remove-row">x</button></td>
    `;

    tableBody.appendChild(row);
    updateRowTotal(row);
  }

  /* =========================
     VALIDATION
     ========================= */
  function validateForm() {
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

  function buildOrderPayload() {
    const items = [];

    tableBody.querySelectorAll('.order-row').forEach(row => {
      const sku = row.querySelector('.sku').value.trim();
      const name = row.querySelector('.product-name').value.trim();
      const color = row.querySelector('.color-select')?.value.trim() || '';
      const size = row.querySelector('.size-select')?.value.trim() || '';
      const price = parseFloat(
        row.querySelector('.price-input').value.replace(/[^\d.]/g, '')
      ) || 0;
      const qty = parseInt(row.querySelector('.qty').value, 10) || 0;

      items.push({
        sku,
        name,
        color,
        size,
        price,
        qty,
        amount: price * qty
      });
    });

    const total = parseFloat(
      document.getElementById('grand-total').textContent.replace(/[^\d.]/g, '')
    ) || 0;

    return {
      transaction_id: Date.now().toString(),
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
      throw new Error('Invalid response from Google Sheets');
    }

    if (!result.success) {
      throw new Error(result.error || 'Apps Script error');
    }
  }

  function resetSelect(select, placeholder) {
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    select.appendChild(opt);
    select.disabled = true;
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `PHP ${formatted}`;
  }

  function normalizeVariantKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '');
  }

  function normalizeColorKey(value) {
    const normalized = normalizeVariantKey(value);
    if (normalized === 'grey') return 'gray';
    return normalized;
  }

  function normalizeSizeKey(value) {
    const normalized = normalizeVariantKey(value);
    const map = {
      extrasmall: 'xs',
      xsmall: 'xs',
      small: 's',
      medium: 'm',
      large: 'l',
      extralarge: 'xl',
      xlarge: 'xl',
      '2xl': 'xxl',
      '3xl': 'xxxl'
    };
    return map[normalized] || normalized;
  }

  function getVariantList(data) {
    return Array.isArray(data && data.variants) ? data.variants : [];
  }

  function findVariantBySelection(data, color, size) {
    const variants = getVariantList(data);
    if (!variants.length) return null;

    const targetColor = normalizeColorKey(color);
    const targetSize = normalizeSizeKey(size);

    let match = variants.find((variant) => {
      const variantColor = normalizeColorKey(variant && variant.color);
      const variantSize = normalizeSizeKey(variant && variant.size);
      return variantColor === targetColor && variantSize === targetSize;
    });

    // Fallbacks for mixed naming between image keys and Woo attributes.
    if (!match && targetSize) {
      match = variants.find((variant) => normalizeSizeKey(variant && variant.size) === targetSize);
    }
    if (!match && targetColor) {
      match = variants.find((variant) => normalizeColorKey(variant && variant.color) === targetColor);
    }

    return match || null;
  }

  function applyVariantSelectionToRow(row, data) {
    if (!row) return;
    const priceInput = row.querySelector('.price-input');
    const colorSelect = row.querySelector('.color-select');
    const sizeSelect = row.querySelector('.size-select');
    if (!priceInput) return;

    const selectedColor = colorSelect ? colorSelect.value : '';
    const selectedSize = sizeSelect ? sizeSelect.value : '';
    const variant = findVariantBySelection(data, selectedColor, selectedSize);

    if (variant && Number.isFinite(Number(variant.price))) {
      priceInput.value = formatMoney(Number(variant.price));
      row.dataset.variationId = String(variant.variation_id || '');
      row.dataset.stockNo = variant.stock_no ? String(variant.stock_no) : '';
    } else {
      const fallbackPrice = Number(data && data.price);
      if (Number.isFinite(fallbackPrice)) {
        priceInput.value = formatMoney(fallbackPrice);
      }
      row.dataset.variationId = '';
      row.dataset.stockNo = '';
    }

    updateRowTotal(row);
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

  async function loadProductOptions(row, sku) {
    const colorSelect = row.querySelector('.color-select');
    const sizeSelect = row.querySelector('.size-select');
    if (!colorSelect && !sizeSelect) return;

    if (colorSelect) resetSelect(colorSelect, 'Color');
    if (sizeSelect) resetSelect(sizeSelect, 'Size');

    const data = await fetchProductDetails(sku);
    if (!data) return;

    if (colorSelect) fillSelect(colorSelect, data.colors || {}, 'Color');
    if (sizeSelect) fillSelect(sizeSelect, data.sizes || {}, 'Size');
    applyVariantSelectionToRow(row, data);
  }

  /* =========================
     EVENTS
     ========================= */
  createRow();

  addRowBtn.addEventListener('click', createRow);

  tableBody.addEventListener('click', e => {
    if (e.target.classList.contains('remove-row')) {
      e.target.closest('tr').remove();
      updateGrandTotal();
    }
  });

  document.addEventListener('input', e => {
    if (e.target.classList.contains('qty')) {
      updateRowTotal(e.target.closest('.order-row'));
    }
  });

  document.addEventListener('change', e => {
    if (!e.target.classList.contains('color-select') && !e.target.classList.contains('size-select')) {
      return;
    }

    const row = e.target.closest('.order-row');
    if (!row) return;

    const sku = row.querySelector('.sku')?.value.trim();
    if (!sku) return;

    fetchProductDetails(sku).then((data) => {
      if (!data) return;
      applyVariantSelectionToRow(row, data);
    }).catch((err) => {
      console.error('Failed to apply variant pricing', err);
    });
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

