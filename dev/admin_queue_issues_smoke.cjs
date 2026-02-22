/*
 * Queue issue lifecycle smoke test:
 *   list -> resolve -> verify RESOLVED -> reopen -> verify NEEDS_REVIEW
 *
 * Usage (PowerShell):
 *   $env:ADMIN_API_TOKEN='your-token'; node dev/admin_queue_issues_smoke.cjs
 *
 * Optional:
 *   BANK_BASE_URL=http://localhost:3000
 *   QUEUE_ISSUE_ID=<specific issue id to test>
 */

const baseUrl = process.env.BANK_BASE_URL || 'http://localhost:3000';
const token = process.env.ADMIN_API_TOKEN || '';
const targetIssueId = (process.env.QUEUE_ISSUE_ID || '').trim();
const stamp = Date.now();

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Admin-Token': token,
  };
}

async function fetchJson(path, options = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    fail(`Network error calling ${baseUrl}${path}: ${msg}`);
  }
  let json = {};
  try {
    json = await res.json();
  } catch (_) {
    json = {};
  }
  return { res, json };
}

function pickIssue(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return null;
  if (targetIssueId) {
    return issues.find((i) => i.id === targetIssueId) || null;
  }
  return issues[0];
}

function assertStatus(issue, expected, stage) {
  if (!issue) fail(`${stage}: issue not found in list`);
  if (issue.status !== expected) {
    fail(`${stage}: expected status=${expected}, got=${issue.status}`);
  }
}

async function run() {
  if (!token) fail('Missing ADMIN_API_TOKEN env var');
  console.log(`[INFO] Base URL: ${baseUrl}`);

  const health = await fetchJson('/health', {
    method: 'GET',
    headers: headers(),
  });
  if (!health.res.ok) {
    fail(`Health check failed at ${baseUrl}/health: status ${health.res.status}`);
  }
  console.log(`[INFO] GET /health -> ${health.res.status}`);

  const list1 = await fetchJson('/api/admin/queue-issues', {
    method: 'GET',
    headers: headers(),
  });
  const issues1 = list1.json.issues || [];
  console.log(
    `[INFO] GET /api/admin/queue-issues -> ${list1.res.status}, count=${issues1.length}`,
  );
  if (!list1.res.ok) {
    fail(`Initial list call failed: ${list1.res.status} ${JSON.stringify(list1.json)}`);
  }

  const selected = pickIssue(issues1);
  if (!selected) {
    console.log('[INFO] No queue issues available. Smoke test skipped.');
    return;
  }
  console.log(`[INFO] Selected issue: ${selected.id} (status=${selected.status})`);

  const resolveNote = `smoke resolve ${stamp}`;
  const resolve = await fetchJson(`/api/admin/queue-issues/${selected.id}/resolve`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      resolution: 'smoke_test_resolve',
      resolutionNote: resolveNote,
      resolvedBy: 'smoke_script',
    }),
  });
  console.log(
    `[INFO] POST /api/admin/queue-issues/:id/resolve -> ${resolve.res.status}`,
  );
  if (!resolve.res.ok || !resolve.json.success) {
    fail(`Resolve failed: ${resolve.res.status} ${JSON.stringify(resolve.json)}`);
  }

  const list2 = await fetchJson('/api/admin/queue-issues', {
    method: 'GET',
    headers: headers(),
  });
  if (!list2.res.ok) {
    fail(`Post-resolve list failed: ${list2.res.status}`);
  }
  const resolvedView = (list2.json.issues || []).find((i) => i.id === selected.id);
  assertStatus(resolvedView, 'RESOLVED', 'verify-resolved');
  if ((resolvedView.resolutionNote || '') !== resolveNote) {
    fail(
      `verify-resolved: expected resolutionNote="${resolveNote}", got="${resolvedView.resolutionNote}"`,
    );
  }
  console.log('[PASS] Resolve verified with status + resolutionNote');

  const reopenReason = `smoke reopen ${stamp}`;
  const reopen = await fetchJson(`/api/admin/queue-issues/${selected.id}/reopen`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      reopenReason,
      reopenedBy: 'smoke_script',
    }),
  });
  console.log(
    `[INFO] POST /api/admin/queue-issues/:id/reopen -> ${reopen.res.status}`,
  );
  if (!reopen.res.ok || !reopen.json.success) {
    fail(`Reopen failed: ${reopen.res.status} ${JSON.stringify(reopen.json)}`);
  }

  const list3 = await fetchJson('/api/admin/queue-issues', {
    method: 'GET',
    headers: headers(),
  });
  if (!list3.res.ok) {
    fail(`Post-reopen list failed: ${list3.res.status}`);
  }
  const reopenedView = (list3.json.issues || []).find((i) => i.id === selected.id);
  assertStatus(reopenedView, 'NEEDS_REVIEW', 'verify-reopened');
  if ((reopenedView.resolutionNote || null) !== null) {
    fail('verify-reopened: resolutionNote should be cleared after reopen');
  }
  console.log('[PASS] Reopen verified with status reset and resolution fields cleared');

  console.log(`[PASS] Queue issue lifecycle smoke succeeded for ${selected.id}`);
}

run().catch((err) => {
  fail(`Unhandled error: ${err?.message || err}`);
});
