import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { post, setDeviceFingerprint, setToken } from '../api/client';

export default function Login() {
  const [params] = useSearchParams();
  const role = params.get('role') || 'user';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceFingerprint, setDeviceFingerprint] = useState('web-console');
  const [message, setMessage] = useState<string | null>(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState('');
  const navigate = useNavigate();

  async function handleLogin() {
    setMessage(null);
    try {
      const response = await post('/api/v1/auth/login', {
        email,
        password,
        deviceFingerprint,
      });

      if (response.requiresOtp) {
        setOtpRequired(true);
        setUserId(response.userId);
        setMessage('OTP required. Check email/console logs for code.');
        return;
      }

      setToken(response.token);
      setDeviceFingerprint(deviceFingerprint);
      navigate(role === 'admin' ? '/admin' : '/portal');
    } catch (error: any) {
      setMessage(error.message || 'Login failed');
    }
  }

  async function handleOtp() {
    setMessage(null);
    try {
      const response = await post('/api/v1/auth/otp/verify', {
        userId,
        code: otp,
        deviceFingerprint,
      });
      setToken(response.token);
      setDeviceFingerprint(deviceFingerprint);
      navigate(role === 'admin' ? '/admin' : '/portal');
    } catch (error: any) {
      setMessage(error.message || 'OTP failed');
    }
  }

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <div className="section-title">{role === 'admin' ? 'Admin' : 'User'} Login</div>
      <div className="form">
        <input
          className="input"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <input
          className="input"
          placeholder="Device fingerprint"
          value={deviceFingerprint}
          onChange={(event) => setDeviceFingerprint(event.target.value)}
        />
        <button className="btn primary" onClick={handleLogin}>Login</button>
        {otpRequired && (
          <>
            <input
              className="input"
              placeholder="OTP code"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
            />
            <button className="btn" onClick={handleOtp}>Verify OTP</button>
          </>
        )}
        {message && <div className="muted">{message}</div>}
      </div>
    </div>
  );
}
