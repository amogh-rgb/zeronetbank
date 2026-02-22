import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="grid two">
      <section className="card">
        <div className="section-title">Bank Admin Dashboard</div>
        <p className="muted">
          Issue credits with dual approval, monitor ledger integrity, and manage containment
          actions. All actions are audited and hash-chained.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className="btn primary" onClick={() => navigate('/login?role=admin')}>
            Admin Login
          </button>
          <button className="btn" onClick={() => navigate('/admin')}>
            Open Dashboard
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-title">User Portal (Read-only)</div>
        <p className="muted">
          View signed credits, trust seals, and provenance timelines. Download statements
          and verify signatures without mutating any ledger state.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className="btn primary" onClick={() => navigate('/login?role=user')}>
            User Login
          </button>
          <button className="btn" onClick={() => navigate('/portal')}>
            Open Portal
          </button>
        </div>
      </section>
    </div>
  );
}
