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

    payload.items.forEach(item => {
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
      `${item.sku || ''} | ${item.name || ''} | ${item.color || ''} | ${item.size || ''} | PHP ${Number(item.price || 0).toFixed(2)} x ${item.qty || 0} = PHP ${Number(item.amount || 0).toFixed(2)}`
    );
  });

  textLines.push('');
  textLines.push(`Total: PHP ${Number(payload.total || 0).toFixed(2)}`);

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
    </div>
  `;

  MailApp.sendEmail({
    to,
    subject,
    htmlBody,
    body: textBody,
    name: senderName,
    attachments: attachments.length ? attachments : undefined
  });
}
