/**
 * @file CenterAdminView.jsx
 * @description Local dashboard for the CENTER_ADMIN role.
 * Renders: Bed capacity management, local alerts, and a tabbed console
 * (Stocks / Staff / Labs / AI Forecast).
 */

import React from 'react';

// ─── Tab IDs ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'stock',    label: 'Stocks'      },
  { id: 'staff',    label: 'Staff'       },
  { id: 'labs',     label: 'Labs'        },
  { id: 'forecast', label: 'AI Forecast' },
];

/**
 * @param {object}   props
 * @param {object}   props.centers
 * @param {object[]} props.alerts
 * @param {object}   props.demandForecasts
 * @param {string}   props.activeCenterId    - Resolved centre ID for this view
 * @param {string}   props.adminTab
 * @param {Function} props.setAdminTab
 * @param {Function} props.updateBedsOccupied
 * @param {Function} props.updateDoctorStatus
 * @param {Function} props.updateTestKitCount
 */
function CenterAdminView({
  centers,
  alerts,
  demandForecasts,
  activeCenterId,
  adminTab,
  setAdminTab,
  updateBedsOccupied,
  updateDoctorStatus,
  updateTestKitCount,
}) {
  const center         = centers[activeCenterId];
  const localAlerts    = alerts.filter(a => a.centerId === activeCenterId);
  const beds           = center?.beds || { occupied: 0, capacity: 1, available: 0 };
  const occupancyPct   = Math.round((beds.occupied / beds.capacity) * 100);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '24px' }}>

      {/* ── Left Column ── */}
      <div className="left-column">

        {/* Bed Capacity Management */}
        <div className="glass-panel">
          <h3 className="panel-title">🛏️ Bed Capacity Management</h3>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current Bed Utilization</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
              <span style={{ fontSize: '28px', fontWeight: '700' }}>{beds.occupied} / {beds.capacity}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{occupancyPct}% Occupancy</span>
            </div>
          </div>

          <div className="form-group">
            <label>Update Occupied Beds Count</label>
            <input
              type="number"
              min="0"
              max={beds.capacity}
              value={beds.occupied}
              onChange={e => updateBedsOccupied(activeCenterId, e.target.value, `MO ${center?.name}`)}
              style={{ background: '#0e1320', color: 'white', border: '1px solid var(--border-glass)' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Changing this value dynamically updates the RED/YELLOW alarms.
            </span>
          </div>
        </div>

        {/* Local Alerts */}
        <div className="glass-panel">
          <h3 className="panel-title">⚠️ Local Active Alerts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {localAlerts.map(a => (
              <div key={a.id} className={`alert-item ${a.type === 'RED' ? 'red' : 'yellow'}`}>
                <div style={{ fontWeight: '600', fontSize: '12px' }}>{a.title}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{a.desc}</div>
              </div>
            ))}
            {localAlerts.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                No active warnings or alerts for this center.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Column — Tabbed Console ── */}
      <div className="right-column">
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '16px' }}>
            <h3 className="panel-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>📦 Center Operations Console</h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              {TABS.map(t => (
                <button key={t.id} className={`role-btn ${adminTab === t.id ? 'active' : ''}`} style={{ padding: '4px 6px', fontSize: '11px' }} onClick={() => setAdminTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Stocks Tab ── */}
          {adminTab === 'stock' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Medicine Name</th><th>Current Stock</th><th>Buffer Target</th><th>Burn Rate (day)</th><th>Days to Out</th><th>Status</th></tr></thead>
                <tbody>
                  {Object.entries(center?.stocks || {}).map(([medId, med]) => {
                    const daysLeft    = med.dailyBurnRate > 0 ? (med.currentStock / med.dailyBurnRate).toFixed(1) : 'Indefinite';
                    const ratio       = med.currentStock / med.bufferStock;
                    let statusText    = 'Normal', colorStyle = 'var(--neon-green)';
                    if (ratio < 0.10) { statusText = 'Critical'; colorStyle = 'var(--neon-red)'; }
                    else if (ratio < 0.20) { statusText = 'Warning'; colorStyle = 'var(--neon-amber)'; }
                    return (
                      <tr key={medId}>
                        <td style={{ fontWeight: '500' }}>{med.name}</td>
                        <td style={{ fontWeight: '600', color: colorStyle }}>{med.currentStock} units</td>
                        <td>{med.bufferStock} units</td>
                        <td>{med.dailyBurnRate} units</td>
                        <td>{daysLeft} days</td>
                        <td style={{ color: colorStyle, fontWeight: '600' }}>{statusText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Staff Tab ── */}
          {adminTab === 'staff' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Doctor Name</th><th>Absent Days (10D)</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {Object.entries(center?.doctors || {}).map(([docId, doc]) => {
                    const isPresent   = doc.status === 'PRESENT';
                    const badgeClass  = isPresent ? 'good' : 'critical';
                    const nextStatus  = isPresent ? 'ABSENT' : 'PRESENT';
                    const buttonText  = isPresent ? 'Call Out Sick' : 'Check In';
                    return (
                      <tr key={docId}>
                        <td style={{ fontWeight: '500' }}>{doc.name}</td>
                        <td>{doc.absentDaysOfLast10} days</td>
                        <td><span className={`health-badge ${badgeClass}`}>{doc.status}</span></td>
                        <td>
                          <button className={`btn-action ${isPresent ? 'reject' : 'approve'}`} onClick={() => updateDoctorStatus(activeCenterId, docId, nextStatus)} style={{ border: 'none', cursor: 'pointer' }}>
                            {buttonText}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Labs Tab ── */}
          {adminTab === 'labs' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Test Kit Name</th><th>Essential</th><th>Availability</th><th>Expiry Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {Object.entries(center?.tests || {}).map(([testId, test]) => {
                    const isExpired = test.expiryTimestamp < Date.now();
                    const isLow     = test.kitCount < 10 || isExpired;
                    const color     = isLow ? (test.isEssential ? 'var(--neon-red)' : 'var(--neon-amber)') : 'var(--neon-green)';
                    return (
                      <tr key={testId}>
                        <td style={{ fontWeight: '500' }}>{test.name}</td>
                        <td style={{ fontWeight: 600 }}>{test.isEssential ? '🔴 YES (Essential)' : '🟡 NO (Basic)'}</td>
                        <td style={{ color, fontWeight: '600' }}>{test.kitCount} kits</td>
                        <td style={{ fontSize: '11px' }}>{isExpired ? 'EXPIRED' : 'Valid'}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={test.kitCount}
                            style={{ width: '70px', display: 'inline-block', padding: '4px', borderRadius: '4px', marginRight: '4px', background: '#0e1320', color: 'white', border: '1px solid var(--border-glass)' }}
                            onChange={e => updateTestKitCount(activeCenterId, testId, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── AI Forecast Tab ── */}
          {adminTab === 'forecast' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Item Name / AI Confidence</th><th>Seasonal Surge Factor</th><th>AI Predicted (30D)</th><th>Procurement Detail</th><th>Shortfall ETA</th></tr></thead>
                <tbody>
                  {Object.entries(center?.stocks || {}).map(([medId, med]) => {
                    const forecast = demandForecasts[activeCenterId]?.[medId] || { predictedDemand: 0, recommendedProcurement: 0, shortfallDays: 0, pctIncrease: 15, confidenceScore: 92, matchedPattern: 'generic', reason: 'Standard telemetry baseline' };
                    return (
                      <tr key={medId}>
                        <td style={{ fontWeight: '500' }}>
                          <div>{med.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--neon-blue)', fontWeight: '600' }}>AI Confidence: {forecast.confidenceScore}%</div>
                        </td>
                        <td style={{ color: 'var(--neon-blue)' }}>
                          <div>+{forecast.pctIncrease}% seasonal surge</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Pattern: {forecast.matchedPattern}</div>
                        </td>
                        <td>{forecast.predictedDemand} units</td>
                        <td style={{ color: 'var(--neon-amber)', fontWeight: '600' }}>
                          <div>{forecast.recommendedProcurement} units Needed</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'normal', whiteSpace: 'normal', maxWidth: '200px', marginTop: '3px' }}>{forecast.reason}</div>
                        </td>
                        <td>{forecast.shortfallDays} days left</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CenterAdminView;
