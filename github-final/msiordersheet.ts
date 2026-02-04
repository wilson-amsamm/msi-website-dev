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
