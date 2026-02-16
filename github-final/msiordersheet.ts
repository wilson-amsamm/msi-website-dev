function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.data);
    const recaptchaToken = payload.recaptcha && payload.recaptcha.token ? payload.recaptcha.token : "";
    const recaptchaAction = payload.recaptcha && payload.recaptcha.action ? payload.recaptcha.action : "";

    verifyRecaptcha(recaptchaToken, recaptchaAction);

    const orderNumber = getNextOrderNumber();

    const sheet = SpreadsheetApp
      .openById('1Y0APyfPAonXk8upVwPQTFLC2pG2zHXqLTA9bWsb4QUg')
      .getSheetByName('Orders');

    if (!sheet) {
        throw new Error('Sheet "Orders" not found');
      }
    

    const rows = [];
    const variantCacheBySku = {};

    payload.items.forEach(item => {
      const lookedUp = lookupVariantFromWoo(item, variantCacheBySku);
      const resolvedVariationId = lookedUp.variation_id || item.variation_id || '';
      const resolvedStockNo = lookedUp.stock_no || item.stock_no || '';
      const stockNoMissing = !resolvedStockNo;

      // Keep payload aligned with looked-up values so email and attachments
      // use the same stock mapping as the sheet rows.
      item.variation_id = resolvedVariationId;
      item.stock_no = resolvedStockNo;
      item.stock_no_missing = stockNoMissing;

      rows.push([
        payload.transaction_id,
        orderNumber,
        payload.customer.first_name,
        payload.customer.last_name,
        payload.customer.phone,
        payload.customer.email,
        payload.customer.company,
        payload.customer.address,
        item.sku,
        item.name,
        item.color,
        item.size,
        resolvedVariationId,
        resolvedStockNo,
        stockNoMissing ? 'YES' : 'NO',
        item.price,
        item.qty,
        item.amount,
        payload.total,
        new Date()
      ]);
    });

    sheet.getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      rows[0].length
    ).setValues(rows);

    sendOrderEmail(payload, orderNumber);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, order_number: orderNumber }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: err.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getWooApiBaseUrl() {
  const prop = PropertiesService.getScriptProperties().getProperty('MSI_WOO_BASE_URL');
  const rawBase = prop ? String(prop).trim() : 'https://www.metroshirtinc.com';
  return rawBase.replace(/\/+$/, '');
}

function normalizeLookupValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '');
}

function normalizeLookupColor(value) {
  const normalized = normalizeLookupValue(value);
  return normalized === 'grey' ? 'gray' : normalized;
}

function normalizeLookupSize(value) {
  const normalized = normalizeLookupValue(value);
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

function fetchVariantsBySku(sku, cache) {
  const normalizedSku = String(sku || '').trim().toUpperCase();
  if (!normalizedSku) return [];

  if (Object.prototype.hasOwnProperty.call(cache, normalizedSku)) {
    return cache[normalizedSku];
  }

  const baseUrl = getWooApiBaseUrl();
  const endpoint = `${baseUrl}/wp-json/orderform/v1/product/${encodeURIComponent(normalizedSku)}`;

  try {
    const res = UrlFetchApp.fetch(endpoint, { muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      cache[normalizedSku] = [];
      return [];
    }

    const data = JSON.parse(res.getContentText() || '{}');
    const variants = Array.isArray(data && data.variants) ? data.variants : [];
    cache[normalizedSku] = variants;
    return variants;
  } catch (err) {
    cache[normalizedSku] = [];
    return [];
  }
}

function findVariantBySelection(item, variants) {
  if (!Array.isArray(variants) || !variants.length) return null;

  const targetColor = normalizeLookupColor(item && item.color);
  const targetSize = normalizeLookupSize(item && item.size);
  if (!targetColor || !targetSize) return null;

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const variantColor = normalizeLookupColor(variant && variant.color);
    const variantSize = normalizeLookupSize(variant && variant.size);
    if (variantColor === targetColor && variantSize === targetSize) {
      return variant;
    }
  }

  return null;
}

function lookupVariantFromWoo(item, cache) {
  const variants = fetchVariantsBySku(item && item.sku, cache);
  const variant = findVariantBySelection(item, variants);
  if (!variant) {
    return {
      variation_id: '',
      stock_no: ''
    };
  }

  return {
    variation_id: variant && variant.variation_id ? variant.variation_id : '',
    stock_no: variant && variant.stock_no ? String(variant.stock_no).trim() : ''
  };
}

function getNextOrderNumber() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const props = PropertiesService.getScriptProperties();
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearKey = `20${String(year).padStart(2, '0')}`;

    const lastYear = props.getProperty('ORDER_SEQ_YEAR');
    const raw = props.getProperty('ORDER_SEQ');
    const current = raw ? parseInt(raw, 10) : 0;

    const next = lastYear === yearKey && Number.isFinite(current) ? current + 1 : 1;
    props.setProperty('ORDER_SEQ', String(next));
    props.setProperty('ORDER_SEQ_YEAR', yearKey);

    const padded = String(next).padStart(4, '0');
    return `MSISO${String(year).padStart(2, '0')}${padded}`;
  } finally {
    lock.releaseLock();
  }
}

function verifyRecaptcha(token, action) {
  if (!token) {
    throw new Error('Missing reCAPTCHA token');
  }

  const secret = PropertiesService.getScriptProperties().getProperty('RECAPTCHA_SECRET');
  if (!secret) {
    throw new Error('Missing reCAPTCHA secret in script properties');
  }

  const response = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'post',
    payload: {
      secret: secret,
      response: token
    }
  });

  const result = JSON.parse(response.getContentText());
  if (!result || !result.success) {
    throw new Error('reCAPTCHA verification failed');
  }

  if (action && result.action && result.action !== action) {
    throw new Error('reCAPTCHA action mismatch');
  }

  const minScore = 0.5;
  if (typeof result.score === 'number' && result.score < minScore) {
    throw new Error('reCAPTCHA score too low');
  }
}

function sendOrderEmail(payload, orderNumber) {
  const to = payload && payload.customer && payload.customer.email
    ? String(payload.customer.email).trim()
    : '';

  if (!to) {
    throw new Error('Missing customer email for order notification');
  }

  const senderName = 'metroshirtinc';
  const senderEmail = getSenderCopyEmail();
  const subject = orderNumber
    ? `Metro Shirt Order Confirmation - ${orderNumber}`
    : 'Metro Shirt Order Confirmation';

  const items = Array.isArray(payload.items) ? payload.items : [];

  const textLines = [
    `Order Number: ${orderNumber || 'N/A'}`,
    `Customer: ${(payload.customer.first_name || '')} ${(payload.customer.last_name || '')}`.trim(),
    `Email: ${payload.customer.email || ''}`,
    `Phone: ${payload.customer.phone || ''}`,
    `Company: ${payload.customer.company || ''}`,
    `Address: ${payload.customer.address || ''}`,
    '',
    'Items:'
  ];

  items.forEach((item) => {
    textLines.push(
      `${item.sku || ''} | ${item.name || ''} | ${item.color || ''} | ${item.size || ''} | Stock No: ${item.stock_no || 'MISSING'} | PHP ${Number(item.price || 0).toFixed(2)} x ${item.qty || 0} = PHP ${Number(item.amount || 0).toFixed(2)}`
    );
  });

  textLines.push('');
  textLines.push(`Total: PHP ${Number(payload.total || 0).toFixed(2)}`);
  textLines.push('');
  textLines.push('Payment Details:');
  textLines.push('Hi! You may settle your payment via BDO or BPI:');
  textLines.push('');
  textLines.push('BDO Account Name: METRO SHIRT INC.');
  textLines.push('Account Number: 00-2590033911');
  textLines.push('or');
  textLines.push('BDO Account Name: ANTONIO CO');
  textLines.push('Account Number: 0391000603');
  textLines.push('');
  textLines.push('Gcash');
  textLines.push('RO*A J** P.');
  textLines.push('09759047246');
  textLines.push('');
  textLines.push('Please send your proof of payment to our Viber at 0933 824 2859 so we can process your order. Thank you!');

  const textBody = textLines.join('\n');

  const attachments = [];

  items.forEach((item, index) => {
    if (!item.image_url) return;
    try {
      const response = UrlFetchApp.fetch(item.image_url);
      const blob = response.getBlob();
      const safeName = (item.sku || `item-${index + 1}`).toString().replace(/[^\w.-]+/g, '_');
      blob.setName(`${safeName}.jpg`);
      attachments.push(blob);
    } catch (err) {
      // ignore image fetch failures so email still sends
    }
  });

  const itemRows = items.map((item) => {
    const imageCell = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name || ''}" width="64" height="64" style="object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;" />`
      : '';

    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${imageCell}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.sku || ''}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.name || ''}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.color || ''}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.size || ''}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.stock_no || 'MISSING'}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">PHP ${Number(item.price || 0).toFixed(2)}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.qty || 0}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">PHP ${Number(item.amount || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const htmlBody = `
    <div style="font-family:Arial, sans-serif;color:#111;">
      <h2 style="margin:0 0 12px;">Order Summary</h2>
      <div style="font-size:14px;line-height:1.5;margin-bottom:16px;">
        <div><strong>Order Number:</strong> ${orderNumber || 'N/A'}</div>
        <div><strong>Customer:</strong> ${(payload.customer.first_name || '')} ${(payload.customer.last_name || '')}</div>
        <div><strong>Email:</strong> ${payload.customer.email || ''}</div>
        <div><strong>Phone:</strong> ${payload.customer.phone || ''}</div>
        <div><strong>Company:</strong> ${payload.customer.company || ''}</div>
        <div><strong>Address:</strong> ${payload.customer.address || ''}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Image</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">SKU</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Product</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Color</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Size</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Stock No</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Price</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Qty</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
      <div style="margin-top:14px;font-size:14px;">
        <strong>Total:</strong> PHP ${Number(payload.total || 0).toFixed(2)}
      </div>
      <div style="margin-top:14px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;font-size:13px;line-height:1.5;">
        <h3 style="margin:0 0 8px;font-size:14px;">Payment Details</h3>
        <p style="margin:0 0 8px;">Hi! You may settle your payment via BDO or BPI:</p>
        <p style="margin:0 0 8px;"><strong>Account Name:</strong> BDO METRO SHIRT INC.<br><strong>Account Number:</strong> 00-2590033911</p>
        <p style="margin:0 0 8px;font-weight:600;text-transform:uppercase;">or</p>
        <p style="margin:0 0 8px;"><strong>Account Name:</strong> BPI ANTONIO CO<br><strong>Account Number:</strong> 0391000603</p>
        <p style="margin:0 0 8px;"><strong>Gcash</strong><br>RO*A J** P.<br>09759047246</p>
        <p style="margin:0;">Please send your proof of payment to our Viber at 0933 824 2859 so we can process your order. Thank you!</p>
      </div>
    </div>
  `;

  const ccRecipients = [];
  addCcRecipient(ccRecipients, 'wilson.amsamm@gmail.com');
  addCcRecipient(ccRecipients, 'metro.shirt.inc@gmail.com');
  addCcRecipient(ccRecipients, senderEmail);

  MailApp.sendEmail({
    to,
    cc: ccRecipients.join(','),
    subject,
    htmlBody,
    body: textBody,
    name: senderName,
    attachments: attachments.length ? attachments : undefined
  });
}

function getSenderCopyEmail() {
  // Preferred: explicit override for reliable behavior across account/domain setups.
  const fromProperty = String(
    PropertiesService.getScriptProperties().getProperty('SENDER_COPY_EMAIL') || ''
  ).trim();
  if (isValidEmailAddress(fromProperty)) return fromProperty;

  // Fallbacks: these can be blank depending Workspace/privacy/deployment mode.
  const effective = getSessionEmailSafe(() => Session.getEffectiveUser().getEmail());
  if (isValidEmailAddress(effective)) return effective;

  const active = getSessionEmailSafe(() => Session.getActiveUser().getEmail());
  if (isValidEmailAddress(active)) return active;

  return '';
}

function getSessionEmailSafe(getter) {
  try {
    return String(getter() || '').trim();
  } catch (err) {
    return '';
  }
}

function isValidEmailAddress(email) {
  const value = String(email || '').trim();
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function addCcRecipient(list, email) {
  const value = String(email || '').trim();
  if (!isValidEmailAddress(value)) return;
  const exists = list.some((entry) => String(entry).toLowerCase() === value.toLowerCase());
  if (!exists) list.push(value);
}
