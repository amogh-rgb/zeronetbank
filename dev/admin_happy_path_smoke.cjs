/*
 * Admin happy-path smoke test:
 *   health -> register/ensure user -> admin users lookup -> add money
 *   -> verify updated balance -> verify admin transaction visibility -> overview
 *
 * Usage (PowerShell):
 *   $env:BANK_BASE_URL='http://127.0.0.1:3000'
 *   $env:ADMIN_API_TOKEN='change-this-admin-token'
 *   $env:TEST_PHONE='9480268832' # optional
 *   $env:TEST_AMOUNT='100'        # optional
 *   npm run smoke:admin-flow
 */

const crypto = require('crypto');

const baseUrl = (process.env.BANK_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const token = process.env.ADMIN_API_TOKEN || '';
const testPhone = (process.env.TEST_PHONE || '').trim() || `9${String(Date.now()).slice(-9)}`;
const testAmount = Number(process.env.TEST_AMOUNT || 101);
const displayName = `Smoke ${testPhone.slice(-4)}`;
const fakePublicKey = `04${crypto.randomBytes(64).toString('hex')}`;

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}`, 'X-Admin-Token': token } : {}),
  };
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

async function fetchJson(path, options = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    fail(`Network error ${baseUrl}${path}: ${err?.message || err}`);
  }
  let json = {};
  try {
    json = await res.json();
  } catch (_) {
    json = {};
  }
  return { res, json };
}

function findUser(users, phone) {
  if (!Array.isArray(users)) return null;
  return users.find((u) => u.phone === phone) || null;
}

async function run() {
  if (!Number.isFinite(testAmount) || testAmount <= 0) {
    fail(`Invalid TEST_AMOUNT: ${process.env.TEST_AMOUNT}`);
  }

  info(`Base URL: ${baseUrl}`);
  info(`Target phone: ${testPhone}`);
  info(`Deposit amount: ${testAmount}`);

  const health = await fetchJson('/health', { method: 'GET', headers: jsonHeaders() });
  info(`GET /health -> ${health.res.status}`);
  if (!health.res.ok) fail(`Health failed: ${health.res.status} ${JSON.stringify(health.json)}`);

  const register = await fetchJson('/auth/register', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      phone: testPhone,
      publicKey: fakePublicKey,
      displayName,
    }),
  });
  info(`POST /auth/register -> ${register.res.status}`);
  if (!register.res.ok || !register.json.success) {
    fail(`Register failed: ${register.res.status} ${JSON.stringify(register.json)}`);
  }
  pass(`Wallet ensured (${register.json.status || 'OK'})`);

  const usersBefore = await fetchJson(`/api/admin/users?q=${encodeURIComponent(testPhone)}&limit=50`, {
    method: 'GET',
    headers: adminHeaders(),
  });
  info(`GET /api/admin/users -> ${usersBefore.res.status}`);
  if (!usersBefore.res.ok || usersBefore.json.success !== true) {
    fail(`Admin users lookup failed: ${usersBefore.res.status} ${JSON.stringify(usersBefore.json)}`);
  }

  const userBefore = findUser(usersBefore.json.users, testPhone);
  if (!userBefore) fail('Target user missing from admin users lookup');
  const beforeBalance = Number(userBefore.balance || 0);
  info(`User balance before deposit: ${beforeBalance}`);

  const addMoney = await fetchJson('/api/admin/add-money', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      phone: testPhone,
      amount: testAmount,
      note: 'smoke admin flow deposit',
    }),
  });
  info(`POST /api/admin/add-money -> ${addMoney.res.status}`);
  if (!addMoney.res.ok || addMoney.json.success !== true) {
    fail(`Add money failed: ${addMoney.res.status} ${JSON.stringify(addMoney.json)}`);
  }
  pass(`Add money accepted. Returned balance=${addMoney.json.balance}`);

  const usersAfter = await fetchJson(`/api/admin/users?q=${encodeURIComponent(testPhone)}&limit=50`, {
    method: 'GET',
    headers: adminHeaders(),
  });
  info(`GET /api/admin/users (after) -> ${usersAfter.res.status}`);
  if (!usersAfter.res.ok || usersAfter.json.success !== true) {
    fail(`Admin users lookup after failed: ${usersAfter.res.status} ${JSON.stringify(usersAfter.json)}`);
  }
  const userAfter = findUser(usersAfter.json.users, testPhone);
  if (!userAfter) fail('Target user missing after deposit');
  const afterBalance = Number(userAfter.balance || 0);
  const expected = beforeBalance + testAmount;
  if (afterBalance !== expected) {
    fail(`Balance mismatch. expected=${expected} actual=${afterBalance}`);
  }
  pass(`Balance updated correctly to ${afterBalance}`);

  const txList = await fetchJson(`/api/admin/users/${encodeURIComponent(testPhone)}/transactions?limit=20`, {
    method: 'GET',
    headers: adminHeaders(),
  });
  info(`GET /api/admin/users/:phone/transactions -> ${txList.res.status}`);
  if (!txList.res.ok || txList.json.success !== true) {
    fail(`Transaction fetch failed: ${txList.res.status} ${JSON.stringify(txList.json)}`);
  }

  const depositTx = (txList.json.transactions || []).find(
    (tx) => tx.type === 'ADMIN_DEPOSIT' && Number(tx.amount) === testAmount,
  );
  if (!depositTx) {
    fail('No matching ADMIN_DEPOSIT transaction found in user history');
  }
  pass(`Deposit transaction found: ${depositTx.id}`);

  const overview = await fetchJson('/api/admin/overview', {
    method: 'GET',
    headers: adminHeaders(),
  });
  info(`GET /api/admin/overview -> ${overview.res.status}`);
  if (!overview.res.ok || overview.json.success !== true) {
    fail(`Overview failed: ${overview.res.status} ${JSON.stringify(overview.json)}`);
  }
  pass(`Overview metrics visible: users=${overview.json.metrics?.users ?? 'n/a'} tx=${overview.json.metrics?.transactionCount ?? 'n/a'}`);

  pass(`Admin happy-path smoke completed for ${testPhone}`);
}

run().catch((err) => fail(`Unhandled error: ${err?.message || err}`));
