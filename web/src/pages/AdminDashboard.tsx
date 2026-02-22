import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  activateContainment,
  approveRequest,
  createCredit,
  type AdminProfile,
  type ApprovalRequest,
  getAdminProfile,
  getApprovalRequests,
  getAuditLogs,
  getContainmentStatus,
  getLedger,
  getWallets,
  type LedgerEntry,
  type WalletSummary,
  rejectRequest,
  sendAdminOtp,
  setContainmentMode as requestContainmentMode,
} from '../api/admin';
import { getDeviceFingerprint } from '../api/client';
import { downloadJson, exportPdf } from '../utils/proofExport';

function formatCents(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}

export default function AdminDashboard() {
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [containment, setContainment] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creditForm, setCreditForm] = useState({ walletPublicKey: '', amountCents: 0, description: '' });
  const [containmentReason, setContainmentReason] = useState('');
  const [containmentMode, setContainmentMode] = useState('NORMAL');
  const [otpCode, setOtpCode] = useState('');
  const [deviceFingerprint, setDeviceFingerprint] = useState(getDeviceFingerprint() || '');

  const can = (permission: string) => adminProfile?.permissions?.includes(permission);

  useEffect(() => {
    getAdminProfile()
      .then((profile) => {
        setAdminProfile(profile);
        return Promise.all([getWallets(), getLedger(), getApprovalRequests(), getAuditLogs(), getContainmentStatus()]);
      })
      .then(([walletsRes, ledgerRes, approvalsRes, auditRes, containmentRes]) => {
        setWallets(walletsRes.wallets || []);
        setLedger(ledgerRes.entries || []);
        setApprovals(approvalsRes.requests || []);
        setAuditLogs(auditRes.entries || []);
        setContainment(containmentRes);
      })
      .catch((error) => setMessage(error.message || 'Failed to load admin data'));
  }, []);

  const totalIssued = useMemo(() => {
    return ledger
      .filter((entry) => entry.entry_type === 'CREDIT')
      .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0 as number);
  }, [ledger]);

  const provenanceEntries = useMemo(
    () => ledger.filter((entry) => entry.entry_type === 'CREDIT').slice(0, 6),
    [ledger]
  );

  async function handleSendOtp() {
    setMessage(null);
    try {
      if (!deviceFingerprint) {
        setMessage('Device fingerprint required for OTP.');
        return;
      }
      await sendAdminOtp({ deviceFingerprint });
      setMessage('OTP sent to registered email.');
    } catch (error: any) {
      setMessage(error.message || 'Failed to send OTP');
    }
  }

  async function handleCreateCredit() {
    setMessage(null);
    try {
      await createCredit({
        walletPublicKey: creditForm.walletPublicKey,
        amountCents: Number(creditForm.amountCents),
        description: creditForm.description || 'Credit issuance',
      });
      const approvalsRes = await getApprovalRequests();
      setApprovals(approvalsRes.requests || []);
      setMessage('Credit request created. Awaiting approval.');
    } catch (error: any) {
      setMessage(error.message || 'Failed to create credit');
    }
  }

  async function handleApproval(id: string, action: 'approve' | 'reject') {
    setMessage(null);
    try {
      if (!otpCode || !deviceFingerprint) {
        setMessage('OTP required for approvals.');
        return;
      }
      if (action === 'approve') {
        await approveRequest(id, otpCode, deviceFingerprint);
      } else {
        await rejectRequest(id, otpCode, deviceFingerprint);
      }
      const approvalsRes = await getApprovalRequests();
      setApprovals(approvalsRes.requests || []);
      const ledgerRes = await getLedger();
      setLedger(ledgerRes.entries || []);
      setMessage(`Approval ${action}d.`);
    } catch (error: any) {
      setMessage(error.message || 'Approval action failed');
    }
  }

  async function handleContainment() {
    setMessage(null);
    try {
      if (!otpCode || !deviceFingerprint) {
        setMessage('OTP required for containment changes.');
        return;
      }
      const response = await requestContainmentMode(containmentMode, containmentReason, otpCode, deviceFingerprint);
      setContainment(response);
      setMessage('Containment mode updated.');
    } catch (error: any) {
      setMessage(error.message || 'Failed to update containment');
    }
  }

  async function handleContainmentActivate(approvalId: string, mode: string) {
    setMessage(null);
    try {
      if (!otpCode || !deviceFingerprint) {
        setMessage('OTP required for containment activation.');
        return;
      }
      await activateContainment(approvalId, mode, otpCode, deviceFingerprint);
      const approvalsRes = await getApprovalRequests();
      setApprovals(approvalsRes.requests || []);
      const containmentRes = await getContainmentStatus();
      setContainment(containmentRes);
      setMessage('Containment activated.');
    } catch (error: any) {
      setMessage(error.message || 'Containment activation failed');
    }
  }

  function exportLedgerJson() {
    downloadJson('ledger-proof.json', {
      generatedAt: new Date().toISOString(),
      totalIssuedCents: totalIssued,
      entries: ledger,
    });
  }

  function exportLedgerPdf() {
    const lines = ledger.slice(0, 100).map((entry) => (
      `${entry.entry_type} | ${entry.wallet_public_key?.slice(0, 16)} | ${formatCents(entry.amount_cents || 0)} | ${entry.hash_chain?.slice(0, 16)} | ${entry.created_at}`
    ));
    exportPdf('ledger-proof.pdf', 'ZeroNetBank Ledger Proof', lines);
  }

  if (!adminProfile) {
    return (
      <div className="card">
        Admin access required. Please sign in with an admin account.
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="grid three">
        <div className="card">
          <div className="muted">Bank health</div>
          <div className="kpi">{containment?.health || 'Online'}</div>
          <div className="muted">Containment: {containment?.mode || 'NORMAL'}</div>
        </div>
        <div className="card">
          <div className="muted">Active wallets</div>
          <div className="kpi">{wallets.length}</div>
          <div className="muted">Latest sync: {wallets[0]?.last_sync_at || 'N/A'}</div>
        </div>
        <div className="card">
          <div className="muted">Total issued</div>
          <div className="kpi">{formatCents(totalIssued)}</div>
          <div className="muted">Ledger entries: {ledger.length}</div>
        </div>
      </section>

      {message && <div className="card">{message}</div>}

      <section className="card">
        <div className="section-title">Admin Security (OTP)</div>
        <div className="form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <input
            className="input"
            placeholder="Device fingerprint"
            value={deviceFingerprint}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDeviceFingerprint(event.target.value)}
          />
          <input
            className="input"
            placeholder="OTP code"
            value={otpCode}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setOtpCode(event.target.value)}
          />
          <button className="btn" onClick={handleSendOtp}>Send OTP</button>
        </div>
        <div className="footer-note">OTP is required for approvals, containment changes, and freeze actions.</div>
      </section>

      {can('issue_credit') ? (
        <section className="card">
          <div className="section-title">Issue Credit (Dual Approval)</div>
          <div className="form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <input
              className="input"
              placeholder="Wallet public key"
              value={creditForm.walletPublicKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setCreditForm({ ...creditForm, walletPublicKey: event.target.value })}
            />
            <input
              className="input"
              type="number"
              placeholder="Amount (cents)"
              value={creditForm.amountCents}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setCreditForm({ ...creditForm, amountCents: Number(event.target.value) })}
            />
            <input
              className="input"
              placeholder="Reason"
              value={creditForm.description}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setCreditForm({ ...creditForm, description: event.target.value })}
            />
            <button className="btn primary" onClick={handleCreateCredit}>Create Draft</button>
          </div>
        </section>
      ) : (
        <section className="card">Permission required: issue_credit</section>
      )}

      {can('approve_credit') ? (
        <section className="card">
          <div className="section-title">Approval Requests</div>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Wallet</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((req) => (
                <tr key={req.id}>
                  <td>{req.id.slice(0, 8)}</td>
                  <td>{req.request_type}</td>
                  <td>{req.wallet_public_key?.slice(0, 16)}...</td>
                  <td>{formatCents(req.amount_cents || 0)}</td>
                  <td>{req.status}</td>
                  <td>
                    {req.status === 'pending' && (
                      <>
                        <button className="btn" onClick={() => handleApproval(req.id, 'approve')}>Approve</button>
                        <button className="btn ghost" onClick={() => handleApproval(req.id, 'reject')}>Reject</button>
                      </>
                    )}
                    {req.request_type === 'containment_mode_change' && req.status === 'approved' && (
                      <button
                        className="btn primary"
                        onClick={() => handleContainmentActivate(req.id, req.metadata?.new_mode || req.metadata?.newMode || 'NORMAL')}
                      >
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card">Permission required: approve_credit</section>
      )}

      <section className="card">
        <div className="section-title">Money Provenance Timeline</div>
        <div className="timeline">
          {provenanceEntries.map((entry) => {
            const approval = approvals.find((req) => req.metadata?.creditId === entry.credit_id);
            const approvalsCount = approval?.approvals?.length || 0;
            return (
              <div key={entry.id} className="timeline-step">
                <div className="timeline-label">Credit {entry.credit_id?.slice(0, 8) || entry.id}</div>
                <div>
                  <div className="muted">Issued: {entry.created_at}</div>
                  <div className="muted">Amount: {formatCents(entry.amount_cents || 0)}</div>
                  <div className="muted">Admin: {entry.issuer_admin_id?.slice(0, 8) || 'system'}</div>
                  <div className="muted">Approvals: {approvalsCount} / 2</div>
                  <div className="muted">Signature hash: {entry.bank_signature?.slice(0, 16)}...</div>
                  <div className="muted">Ledger hash: {entry.hash_chain?.slice(0, 16)}...</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {can('manage_containment') ? (
        <section className="card">
          <div className="section-title">Containment Control</div>
          <div className="form" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
            <select
              className="input"
              value={containmentMode}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setContainmentMode(event.target.value)}
            >
              <option value="NORMAL">NORMAL</option>
              <option value="HEIGHTENED">HEIGHTENED</option>
              <option value="CONTAINMENT">CONTAINMENT</option>
              <option value="EMERGENCY_FREEZE">EMERGENCY_FREEZE</option>
            </select>
            <input
              className="input"
              placeholder="Reason (min 20 chars)"
              value={containmentReason}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setContainmentReason(event.target.value)}
            />
            <button className="btn primary" onClick={handleContainment}>Request Change</button>
          </div>
          <div className="footer-note">Containment changes require dual approval and OTP.</div>
        </section>
      ) : (
        <section className="card">Permission required: manage_containment</section>
      )}

      {can('view_all_wallets') ? (
        <section className="card">
          <div className="section-title">Wallet Registry</div>
          <table className="table">
            <thead>
              <tr>
                <th>Wallet ID</th>
                <th>Status</th>
                <th>Last Sync</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
                <tr key={wallet.wallet_id}>
                  <td>{wallet.wallet_id}</td>
                  <td>{wallet.status}</td>
                  <td>{wallet.last_sync_at || 'Never'}</td>
                  <td>{formatCents(wallet.balance_cents || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card">Permission required: view_all_wallets</section>
      )}

      {can('view_ledger') ? (
        <section className="card">
          <div className="section-title">Ledger Explorer</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <button className="btn" onClick={exportLedgerJson}>Export JSON</button>
            <button className="btn" onClick={exportLedgerPdf}>Export PDF</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Wallet</th>
                <th>Amount</th>
                <th>Hash</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {ledger.slice(0, 20).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.entry_type}</td>
                  <td>{entry.wallet_public_key?.slice(0, 16)}...</td>
                  <td>{formatCents(entry.amount_cents || 0)}</td>
                  <td>{entry.hash_chain?.slice(0, 12)}...</td>
                  <td>{entry.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card">Permission required: view_ledger</section>
      )}

      {can('view_audit_log') ? (
        <section className="card">
          <div className="section-title">Audit Log (latest)</div>
          <table className="table">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 20).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.actor_id || 'system'}</td>
                  <td>{entry.action}</td>
                  <td>{entry.target_type}</td>
                  <td>{entry.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card">Permission required: view_audit_log</section>
      )}
    </div>
  );
}
