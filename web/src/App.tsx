import { Route, Routes, useNavigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import UserPortal from './pages/UserPortal';
import VerifyStatement from './pages/VerifyStatement';
import { clearDeviceFingerprint, clearToken, getToken } from './api/client';

export default function App() {
  const navigate = useNavigate();
  const hasToken = Boolean(getToken());

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">ZeroNetBank Console</div>
        <div className="nav-actions">
          <button className="btn ghost" onClick={() => navigate('/')}>Home</button>
          <button className="btn ghost" onClick={() => navigate('/portal')}>User Portal</button>
          <button className="btn ghost" onClick={() => navigate('/admin')}>Admin</button>
          {hasToken ? (
            <button
              className="btn"
              onClick={() => {
                clearToken();
                clearDeviceFingerprint();
                navigate('/');
              }}
            >
              Sign out
            </button>
          ) : (
            <button className="btn primary" onClick={() => navigate('/login')}>Sign in</button>
          )}
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/portal" element={<UserPortal />} />
        <Route path="/verify" element={<VerifyStatement />} />
      </Routes>
    </div>
  );
}
