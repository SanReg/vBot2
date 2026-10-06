const bolt11 = require('bolt11');

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data && data.reason ? data.reason : response.statusText;
    throw new Error(message);
  }
  return data;
}

async function getLnurlPayInvoice(address, amountSats) {
  const parts = address.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid lightning address.');
  }

  const [name, domain] = parts;
  const lnurlUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
  const lnurlData = await fetchJson(lnurlUrl);

  if (lnurlData.tag !== 'payRequest' || !lnurlData.callback) {
    throw new Error('Lightning address does not support payments.');
  }

  const amountMsats = amountSats * 1000;
  const minSendable = Number(lnurlData.minSendable || 0);
  const maxSendable = Number(lnurlData.maxSendable || 0);

  if (amountMsats < minSendable || (maxSendable > 0 && amountMsats > maxSendable)) {
    throw new Error('Amount is outside the lightning address limits.');
  }

  const callbackUrl = new URL(lnurlData.callback);
  callbackUrl.searchParams.set('amount', String(amountMsats));
  const invoiceData = await fetchJson(callbackUrl.toString());

  const payreq = invoiceData.pr || invoiceData.payRequest;
  if (!payreq) {
    throw new Error('Failed to get invoice from lightning address.');
  }

  // The address server picks the invoice, so check it asks for exactly what was requested.
  let decoded;
  try {
    decoded = bolt11.decode(payreq);
  } catch {
    throw new Error('Lightning address returned an invalid invoice.');
  }
  if (decoded.millisatoshis !== String(amountMsats)) {
    throw new Error('Lightning address returned an invoice for the wrong amount.');
  }

  return payreq;
}

async function validateLightningAddress(address) {
  const parts = address.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid lightning address.');
  }

  const [name, domain] = parts;
  const lnurlUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
  const lnurlData = await fetchJson(lnurlUrl);

  if (lnurlData.tag !== 'payRequest' || !lnurlData.callback) {
    throw new Error('Lightning address does not support payments.');
  }
}

module.exports = { getLnurlPayInvoice, validateLightningAddress };
