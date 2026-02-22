import { useEffect, useMemo, useState } from 'react';
import { getLinkedWallets, getWalletLedger, verifyStatement } from '../api/user';
import { getToken } from '../api/client';
import { downloadJson, exportPdf } from '../utils/proofExport';

async function hashId(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padLeft(2, '0')).join('');
}

function formatCents(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}

export default function UserPortal() {
  const hasToken = Boolean(getToken());
  const [wallets, setWallets] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hashMap, setHashMap] = useState<Record<string, string>>({});
  const [statementHash, setStatementHash] = useState('');
  const [statementSignature, setStatementSignature] = useState('');
  const [verification, setVerification] = useState<string | null>(null);
  const [statementMeta, setStatementMeta] = useState<any | null>(null);

  useEffect(() => {
    getLinkedWallets()
      .then((result) => setWallets(result.wallets || []))
      .catch((error) => setMessage(error.message || 'Failed to load wallets'));
  }, []);

  useEffect(() => {
    if (!selectedWallet) return;
    setMessage(null);
    getWalletLedger(selectedWallet)
      .then((result) => {
        setLedger(result.entries || []);
        setStatementMeta({
          statement_hash: result.statement_hash,
          bank_signature: result.bank_signature,
          confidence_seal: result.confidence_seal,
          walletId: result.walletId,
          from: result.from,
          to: result.to,
          nextCursor: result.nextCursor,
        });
        setStatementHash(result.statement_hash || '');
        setStatementSignature(result.bank_signature || '');
        return result.entries || [];
      })
      .then(async (entries) => {
        const hashEntries: Record<string, string> = {};
        for (const entry of entries) {
          if (entry.issuer_admin_id) {
            hashEntries[entry.issuer_admin_id] = await hashId(entry.issuer_admin_id);
          }
        }
        setHashMap(hashEntries);
      })
      .catch((error) => setMessage(error.message || 'Failed to load ledger'));
  }, [selectedWallet]);

  const totalCredits = useMemo(() => {
    return ledger
      .filter((entry) => entry.entry_type === 'CREDIT')
      .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);
  }, [ledger]);

  async function handleVerify() {
    setVerification(null);
    try {
      const result = await verifyStatement({
        statement_hash: statementHash,
        bank_signature: statementSignature,
      });
      setVerification(result.valid ? 'Statement verified' : 'Invalid signature');
    } catch (error: any) {
      setVerification(error.message || 'Verification failed');
    }
  }

  function exportStatementJson() {
    if (!statementMeta) {
      setMessage('No statement available to export.');
      return;
    }
    downloadJson('statement-proof.json', {
      ...statementMeta,
      entries: ledger,
      generatedAt: new Date().toISOString(),
    });
  }

  function exportStatementPdf() {
    if (!statementMeta) {
      setMessage('No statement available to export.');
      return;
    }
    const lines = ledger.slice(0, 100).map((entry) => (
      `${entry.entry_type} | ${formatCents(entry.amount_cents || 0)} | ${entry.hash_chain?.slice(0, 16)} | ${entry.created_at}`
    ));
    exportPdf('statement-proof.pdf', 'ZeroNetBank Statement Proof', lines);
  }

  if (!hasToken) {
    return (
      <div className="card">
        Please sign in to access your bank portal.
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="grid three">
        <div className="card">
          <div className="muted">Linked wallets</div>
          <div className="kpi">{wallets.length}</div>
          <div className="muted">Selected: {selectedWallet || 'None'}</div>
        </div>
        <div className="card">
          <div className="muted">Credits issued</div>
          <div className="kpi">{formatCents(totalCredits)}</div>
          <div className="muted">Ledger entries: {ledger.length}</div>
        </div>
        <div className="card">
          <div className="muted">Trust status</div>
          <div className="kpi">Verified</div>
          <div className="muted">Bank-issued seal required</div>
        </div>
      </section>

      {message && <div className="card">{message}</div>}

      <section className="card">
        <div className="section-title">Wallets</div>
        <table className="table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Status</th>
              <th>Last Sync</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((wallet) => (
              <tr key={wallet.wallet_id}>
                <td>{wallet.wallet_id}</td>
                <td>{wallet.status || 'pending'}</td>
                <td>{wallet.last_sync_at || 'Never'}</td>
                <td>
                  <button className="btn" onClick={() => setSelectedWallet(wallet.wallet_id)}>
                    View Ledger
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="section-title">Money Provenance Timeline</div>
        <div className="timeline">
          {ledger.filter((entry) => entry.entry_type === 'CREDIT').slice(0, 6).map((entry) => (
            <div key={entry.id} className="timeline-step">
              <div className="timeline-label">Credit {entry.credit_id?.slice(0, 6) || entry.id}</div>
              <div>
                <div className="muted">Amount: {formatCents(entry.amount_cents || 0)} | Hash: {entry.hash_chain?.slice(0, 12)}...</div>
                <div className="muted">Issuer hash: {entry.issuer_admin_id ? hashMap[entry.issuer_admin_id]?.slice(0, 16) : 'unknown'}...</div>
                <div className="muted">Created: {entry.created_at}</div>
                <div className="muted">Synced: {entry.timeline?.ackAt || 'pending'}</div>
                <div className="muted">Confirmed: {entry.timeline?.commitAt || 'pending'}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Ledger Entries</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button className="btn" onClick={exportStatementJson}>Download JSON Proof</button>
          <button className="btn" onClick={exportStatementPdf}>Download PDF Proof</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>Description</th>
              <th>Hash</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {ledger.slice(0, 20).map((entry) => (
              <tr key={entry.id}>
                <td>{entry.entry_type}</td>
                <td>{formatCents(entry.amount_cents || 0)}</td>
                <td>{entry.description}</td>
                <td>{entry.hash_chain?.slice(0, 12)}...</td>
                <td>{entry.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="section-title">Verify Statement</div>
        <div className="form">
          <input
            className="input"
            placeholder="Statement hash"
            value={statementHash}
            onChange={(event) => setStatementHash(event.target.value)}
          />
          <input
            className="input"
            placeholder="Bank signature"
            value={statementSignature}
            onChange={(event) => setStatementSignature(event.target.value)}
          />
          <button className="btn" onClick={handleVerify}>Verify</button>
          {verification && <div className="muted">{verification}</div>}
        </div>
      </section>
    </div>
  );
}
