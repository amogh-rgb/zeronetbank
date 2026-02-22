import { useState } from 'react';
import { verifyStatement } from '../api/user';

export default function VerifyStatement() {
  const [hash, setHash] = useState('');
  const [signature, setSignature] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function handleVerify() {
    setResult(null);
    try {
      const response = await verifyStatement({ statement_hash: hash, bank_signature: signature });
      setResult(response.valid ? 'Signature valid' : 'Signature invalid');
    } catch (error: any) {
      setResult(error.message || 'Verification failed');
    }
  }

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <div className="section-title">Public Statement Verification</div>
      <div className="form">
        <input
          className="input"
          placeholder="Statement hash"
          value={hash}
          onChange={(event) => setHash(event.target.value)}
        />
        <input
          className="input"
          placeholder="Bank signature"
          value={signature}
          onChange={(event) => setSignature(event.target.value)}
        />
        <button className="btn primary" onClick={handleVerify}>Verify</button>
        {result && <div className="muted">{result}</div>}
      </div>
    </div>
  );
}
