/**
 * @file LoginPortal.jsx
 * @description Full-screen authentication gate for the SmartHealth AI dashboard.
 * Renders over the app with a glassmorphism card and calls `login(username, password)`.
 */

import React, { useState } from 'react';

// ─── Shared Style Objects ──────────────────────────────────────────────────────
const OVERLAY_STYLE = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  minHeight:      '100vh',
  width:          '100vw',
  background:     'radial-gradient(circle at center, #111827 0%, #030712 100%)',
  fontFamily:     'var(--font-body)',
  color:          'white',
  position:       'fixed',
  top:            0,
  left:           0,
  zIndex:         999999,
};

const CARD_STYLE = {
  width:          '100%',
  maxWidth:       '400px',
  padding:        '36px',
  boxSizing:      'border-box',
  borderRadius:   '16px',
  border:         '1px solid rgba(255, 255, 255, 0.08)',
  background:     'rgba(17, 24, 39, 0.7)',
  backdropFilter: 'blur(16px)',
  boxShadow:      '0 8px 32px rgba(0,0,0,0.5)',
  textAlign:      'center',
};

const INPUT_STYLE = {
  background:   'rgba(255,255,255,0.02)',
  border:       '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '6px',
  padding:      '10px 12px',
  color:        'white',
  outline:      'none',
  fontSize:     '13px',
};

const SUBMIT_BTN_STYLE = {
  background:    'var(--neon-blue)',
  color:         'white',
  border:        'none',
  padding:       '11px',
  fontSize:      '13px',
  fontWeight:    '600',
  borderRadius:  '6px',
  cursor:        'pointer',
  marginTop:     '6px',
  boxShadow:     '0 0 16px rgba(59, 130, 246, 0.3)',
};

/**
 * @param {object}   props
 * @param {Function} props.login - Context login action; returns `true` on success
 */
function LoginPortal({ login }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  const handleSubmit = e => {
    e.preventDefault();
    const success = login(username, password);
    setError(success ? '' : 'Invalid credentials. Check hints below.');
  };

  return (
    <div style={OVERLAY_STYLE}>
      <div className="glass-panel" style={CARD_STYLE}>
        <div style={{ fontSize: '44px', marginBottom: '12px' }}>🏥</div>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '6px', fontFamily: 'var(--font-heading)' }}>
          SmartHealth AI
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          National CHC/PHC Operations Co-Pilot
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username..."
              style={INPUT_STYLE}
              required
            />
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password..."
              style={INPUT_STYLE}
              required
            />
          </div>

          {error && (
            <div style={{ color: 'var(--neon-red)', fontSize: '11px', textAlign: 'center', marginTop: '2px' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-submit" style={SUBMIT_BTN_STYLE}>
            Authenticate Portal
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPortal;
