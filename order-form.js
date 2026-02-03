document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM ready');

  const form = document.getElementById('bulk-order-form');
  if (!form) return;

  const table = document.getElementById('order-table');
  if (!table) return;

  let tableBody = table.querySelector('tbody');
  if (!tableBody) {
    tableBody = document.createElement('tbody');
    table.appendChild(tableBody);
  }

  const addRowBtn = document.getElementById('add-row');
  if (!addRowBtn) return;

  let rowIndex = 0;

  const clearBtn = document.getElementById('clear-table');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!confirm('Clear all items from the order?')) return;


        //remove all rows / reset row index / reset grand total
            tableBody.innerHTML = '';
            rowIndex = 0;
            updateGrandTotal();

            createRow();
        });
    }
  let productCatalog = {};

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
    item.textContent = `${sku} — ${productCatalog[sku].name}`;
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

    totalInput.value = `₱${(price * qty).toFixed(2)}`;
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
      grandTotalEl.textContent = `₱${total.toFixed(2)}`;
    }
  }

  /* =========================
     SKU LOOKUP
     ========================= */
  function handleSkuLookup(row) {
    const skuInput = row.querySelector('.sku');
    const nameInput = row.querySelector('.product-name');
    const priceInput = row.querySelector('.price-input');

    if (!productCatalog || Object.keys(productCatalog).length === 0) return;


    if (!skuInput || !nameInput || !priceInput) return;

    const sku = skuInput.value.trim().toUpperCase();
    if (!sku) return;

    const product = productCatalog[sku];

    if (!product) {
      row.dataset.invalidSku = "true";

      nameInput.value = '';
      priceInput.value = '₱0';
      updateRowTotal(row);

      // visual cue only
      skuInput.classList.add('invalid');

      return;
    }


    nameInput.value = product.name;
    priceInput.value = `₱${product.price}`;
    row.dataset.invalidSku = "false";
    skuInput.classList.remove('invalid');
    updateRowTotal(row);
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
      <td><input type="text" name="items[${rowIndex}][price]" class="price-input" value="₱0" readonly></td>
      <td><input type="number" name="items[${rowIndex}][qty]" class="qty" min="1" value="1"></td>
      <td><input type="text" class="total-input" value="₱0.00" readonly></td>
      <td><button type="button" class="remove-row">✕</button></td>
    `;

    tableBody.appendChild(row);
    updateRowTotal(row);
  }

  /* =========================
     VALIDATION
     ========================= */
  function validateForm() {
    const rows = tableBody.querySelectorAll('.order-row');


    if (row.dataset.invalidSku === "true") {
      alert(`Please add at least one product`);
      row.querySelector('.sku').focus();
      return false;
    }


    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sku = rows[i].querySelector('.sku');
      const qty = rows[i].querySelector('.qty');

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