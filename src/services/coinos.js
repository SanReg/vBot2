const { COINOS_API, COINOS_TOKEN } = require('../config');

async function coinosRequest(path, method, body) {
  const response = await fetch(`${COINOS_API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${COINOS_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data && data.error ? data.error : response.statusText;
    throw new Error(message);
  }

  return data;
}

module.exports = { coinosRequest };
