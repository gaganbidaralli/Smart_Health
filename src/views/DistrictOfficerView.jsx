/**
 * @file DistrictOfficerView.jsx
 * @description National Operations Command Center view for the DISTRICT_OFFICER role.
 * Renders: Regional filter, summary cards, India heatmap, tabbed district report
 * (rankings / staff & labs / AI forecasts), trend charts, alerts panel,
 * transfer approvals, active dispatches, and the operations audit log.
 */

import React from 'react';
import CustomDropdown from '../components/CustomDropdown';
import { getHealthBadgeClass, getHealthText } from '../utils/healthScore';

// ─── Region Filter Options ─────────────────────────────────────────────────────
const REGION_OPTIONS = [
  { value: 'ALL',   label: 'All India Command' },
  { value: 'NORTH', label: 'North Region (Delhi & Lucknow)' },
  { value: 'WEST',  label: 'West Region (Mumbai)' },
  { value: 'SOUTH', label: 'South Region (Bengaluru & Chennai)' },
  { value: 'EAST',  label: 'East Region (Kolkata)' },
];

/**
 * @param {object}   props
 * @param {object}   props.centers
 * @param {object[]} props.alerts
 * @param {object[]} props.transferOrders
 * @param {object[]} props.auditLog
 * @param {object}   props.demandForecasts
 * @param {string|null} props.selectedCenterId
 * @param {Function} props.setSelectedCenterId
 * @param {Function} props.approveTransferOrder
 * @param {Function} props.rejectTransferOrder
 * @param {string}   props.selectedRegion
 * @param {Function} props.setSelectedRegion
 * @param {string}   props.districtTab
 * @param {Function} props.setDistrictTab
 */
function DistrictOfficerView({
  centers,
  alerts,
  transferOrders,
  auditLog,
  demandForecasts,
  selectedCenterId,
  setSelectedCenterId,
  approveTransferOrder,
  rejectTransferOrder,
  selectedRegion,
  setSelectedRegion,
  districtTab,
  setDistrictTab,
}) {
  // ── Derived data based on selected region ──────────────────────────────────
  const filteredCenters = selectedRegion === 'ALL'
    ? Object.values(centers)
    : Object.values(centers).filter(c => c.region === selectedRegion);

  const filteredCenterIds = filteredCenters.map(c => c.id);

  const filteredAlerts       = alerts.filter(a => filteredCenterIds.includes(a.centerId));
  const criticalCount        = filteredAlerts.filter(a => a.type === 'RED').length;
  const warningCount         = filteredAlerts.filter(a => a.type === 'YELLOW').length;
  const dataGapCount         = filteredAlerts.filter(a => a.type === 'DATA_GAP').length;

  const filteredTransferOrders = transferOrders.filter(o =>
    selectedRegion === 'ALL' ||
    filteredCenterIds.includes(o.fromCenterId) ||
    filteredCenterIds.includes(o.toCenterId)
  );

  const filteredAuditLog = auditLog.filter(log => {
    if (selectedRegion === 'ALL') return true;
    return filteredCenters.some(c => log.action.includes(c.name) || log.action.includes(c.id));
  });

  const chartCenters = selectedRegion === 'ALL'
    ? [centers.center_1, centers.center_2, centers.center_3, centers.center_4]
    : filteredCenters;

  const pendingOrders   = filteredTransferOrders.filter(o => o.status === 'PENDING');
  const dispatchOrders  = filteredTransferOrders.filter(o => o.status === 'SHIPPED' || o.status === 'DELIVERED');

  return (
    <>
      {/* Regional Operations Unit Filter */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '16px 24px', position: 'relative', zIndex: 100 }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>📍 Regional Command Operations</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Isolate approvals, alerts, and forecasts by State/Region</p>
        </div>
        <CustomDropdown
          value={selectedRegion}
          onChange={val => setSelectedRegion(val)}
          options={REGION_OPTIONS}
          width="260px"
        />
      </div>

      {/* Summary Grid */}
      <div className="summary-grid">
        <div className="glass-panel summary-card">
          <span className="label">Centers Logged</span>
          <span className="value">{filteredCenters.length} / {Object.keys(centers).length}</span>
        </div>
        <div className="glass-panel summary-card red-glow">
          <span className="label">Critical Alerts (RED)</span>
          <span className="value">{criticalCount}</span>
        </div>
        <div className="glass-panel summary-card amber-glow">
          <span className="label">Warnings (YELLOW)</span>
          <span className="value">{warningCount}</span>
        </div>
        <div className="glass-panel summary-card amber-glow">
          <span className="label">Data Gaps Tracker</span>
          <span className="value">{dataGapCount}</span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* ── Left Column ── */}
        <div className="left-column">
          {/* India Heatmap */}
          <div className="glass-panel">
            <h3 className="panel-title">📍 National India Map & Score Heatmap</h3>
            <div className="map-container">
              <svg className="map-svg" viewBox="0 0 400 370">
                {/* Tactical grid */}
                <g stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" strokeDasharray="3,3" style={{ pointerEvents: 'none' }}>
                  <line x1="100" y1="20" x2="100" y2="350" />
                  <line x1="200" y1="20" x2="200" y2="350" />
                  <line x1="300" y1="20" x2="300" y2="350" />
                  <line x1="40"  y1="100" x2="360" y2="100" />
                  <line x1="40"  y1="200" x2="360" y2="200" />
                  <line x1="40"  y1="300" x2="360" y2="300" />
                </g>

                {/* Region labels */}
                <g style={{ pointerEvents: 'none' }}>
                  <text x="175" y="70"  textAnchor="middle" fill={selectedRegion === 'NORTH' ? 'var(--neon-blue)' : 'rgba(255,255,255,0.15)'} fontSize="8px" fontWeight="700" style={{ transition: 'fill 0.3s ease' }}>NORTH UNIT</text>
                  <text x="95"  y="195" textAnchor="middle" fill={selectedRegion === 'WEST'  ? 'var(--neon-blue)' : 'rgba(255,255,255,0.15)'} fontSize="8px" fontWeight="700" style={{ transition: 'fill 0.3s ease' }}>WEST UNIT</text>
                  <text x="175" y="295" textAnchor="middle" fill={selectedRegion === 'SOUTH' ? 'var(--neon-blue)' : 'rgba(255,255,255,0.15)'} fontSize="8px" fontWeight="700" style={{ transition: 'fill 0.3s ease' }}>SOUTH UNIT</text>
                  <text x="275" y="180" textAnchor="middle" fill={selectedRegion === 'EAST'  ? 'var(--neon-blue)' : 'rgba(255,255,255,0.15)'} fontSize="8px" fontWeight="700" style={{ transition: 'fill 0.3s ease' }}>EAST UNIT</text>
                </g>

                {/* India outline */}
                <path
                  d="M 135,40 L 145,55 L 140,75 L 160,85 L 180,95 L 210,115 L 230,115 L 245,105 L 265,108 L 290,115 L 320,120 L 325,135 L 305,145 L 285,148 L 280,165 L 260,168 L 250,185 L 253,205 L 235,215 L 225,235 L 205,265 L 175,295 L 150,340 L 142,335 L 125,285 L 115,250 L 105,215 L 85,210 L 65,200 L 60,185 L 75,170 L 95,160 L 105,140 L 100,115 L 110,90 L 122,80 Z"
                  fill="rgba(255,255,255,0.02)"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="2"
                />

                {/* Centre pins */}
                {Object.values(centers).map(c => {
                  // Longitude 68–98 → X 60–340 | Latitude 8–36 → Y 340–40
                  const x = 60 + ((c.longitude - 68) / 30) * 280;
                  const y = 340 - ((c.latitude  - 8)  / 28) * 300;

                  let color = 'var(--neon-green)';
                  if (c.healthScores.overall < 60) color = 'var(--neon-red)';
                  else if (c.healthScores.overall < 80) color = 'var(--neon-amber)';

                  const isSelected = selectedCenterId === c.id;
                  const isInRegion = selectedRegion === 'ALL' || c.region === selectedRegion;

                  return (
                    <g
                      key={c.id}
                      className="map-pin"
                      onClick={() => { if (isInRegion) setSelectedCenterId(isSelected ? null : c.id); }}
                      style={{ cursor: isInRegion ? 'pointer' : 'default', opacity: isInRegion ? 1 : 0.08, pointerEvents: isInRegion ? 'auto' : 'none', transition: 'opacity 0.3s ease' }}
                    >
                      <circle cx={x} cy={y} r={isSelected ? '14' : '9'} fill={color} opacity="0.3" />
                      <circle cx={x} cy={y} r={isSelected ? '8'  : '5'} fill={color} />
                      <text   x={x}  y={y - (isSelected ? 18 : 12)} className="pin-label" fill="white">
                        {c.name} ({c.healthScores.overall})
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Selected centre detail card */}
            {selectedCenterId && (() => {
              const sc = centers[selectedCenterId];
              return (
                <div className="glass-panel" style={{ marginTop: '16px', background: 'rgba(255,255,255,0.02)', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontWeight: '600', color: 'var(--neon-blue)' }}>{sc.name} Details</h4>
                    <button className="btn-action approve" onClick={() => setSelectedCenterId(null)}>Close</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
                    <div>
                      <p style={{ color: 'var(--text-secondary)' }}>Block: {sc.block}</p>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Beds: {sc.beds.occupied} occupied / {sc.beds.capacity} capacity</p>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Footfall: IPD: {sc.footfall.ipdCount} | OPD: {sc.footfall.opdCount} | Total: {sc.footfall.total}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)' }}>Stock Health: {sc.healthScores.stock}%</p>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Doctors Active: {Object.values(sc.doctors || {}).filter(d => d.status === 'PRESENT').length} / {Object.values(sc.doctors || {}).length} present
                      </p>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>
                        Lab Gaps: <span style={{ color: 'var(--neon-red)' }}>
                          {Object.values(sc.tests || {}).filter(t => t.isEssential && (t.kitCount < 10 || t.expiryTimestamp < Date.now())).map(t => t.name).join(', ') || 'None'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Tabbed District Report */}
          <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '16px' }}>
              <h3 className="panel-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>📊 District Operations Center</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['rankings', 'staff', 'forecast'].map(tab => (
                  <button key={tab} className={`role-btn ${districtTab === tab ? 'active' : ''}`} style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setDistrictTab(tab)}>
                    {tab === 'rankings' ? 'Rankings' : tab === 'staff' ? 'Staff & Labs' : 'AI Forecasts'}
                  </button>
                ))}
              </div>
            </div>

            {/* Rankings Tab */}
            {districtTab === 'rankings' && (
              <div className="table-container">
                <table>
                  <thead><tr><th>Rank</th><th>Center Name</th><th>Block</th><th>Overall Score</th><th>Status</th><th>Action Needed</th></tr></thead>
                  <tbody>
                    {[...filteredCenters].sort((a, b) => b.healthScores.overall - a.healthScores.overall).map((c, idx) => (
                      <tr key={c.id}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: '500' }}>{c.name}</td>
                        <td>{c.block}</td>
                        <td style={{ fontWeight: '600' }}>{c.healthScores.overall} / 100</td>
                        <td><span className={getHealthBadgeClass(c.healthScores.overall)}>{getHealthText(c.healthScores.overall)}</span></td>
                        <td style={{ color: c.healthScores.overall < 60 ? 'var(--neon-red)' : 'var(--text-secondary)' }}>
                          {c.healthScores.overall < 60 ? 'Deploy support/audit' : 'Routine monitoring'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Staff & Labs Tab */}
            {districtTab === 'staff' && (
              <div className="table-container">
                <table>
                  <thead><tr><th>Center Name</th><th>Staff Present</th><th>Staffing Status</th><th>Essential Labs Gaps</th><th>Kit Warnings</th></tr></thead>
                  <tbody>
                    {filteredCenters.map(c => {
                      const docs    = Object.values(c.doctors || {});
                      const present = docs.filter(d => d.status === 'PRESENT').length;
                      const total   = docs.length;

                      let staffBadge = 'good', staffText = 'NORMAL';
                      if (present === 0)                  { staffBadge = 'critical'; staffText = 'CRITICAL EMERGENCY'; }
                      else if (present / total < 0.50)    { staffBadge = 'warning';  staffText = 'UNDERSTAFFED'; }

                      const now = Date.now();
                      const essentialGaps = [], kitShortages = [];
                      Object.values(c.tests || {}).forEach(t => {
                        if (t.kitCount < 10 || t.expiryTimestamp < now) {
                          (t.isEssential ? essentialGaps : kitShortages).push(t.name);
                        }
                      });

                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: '500' }}>{c.name}</td>
                          <td>{present} / {total} Present</td>
                          <td><span className={`health-badge ${staffBadge}`}>{staffText}</span></td>
                          <td style={{ color: 'var(--neon-red)',   fontWeight: '600' }}>{essentialGaps.length > 0 ? essentialGaps.join(', ') : 'None'}</td>
                          <td style={{ color: 'var(--neon-amber)'               }}>{kitShortages.length  > 0 ? kitShortages.join(', ')  : 'None'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* AI Forecast Tab */}
            {districtTab === 'forecast' && (
              <div className="table-container">
                <table>
                  <thead><tr><th>Center / AI Score</th><th>Item / Match Pattern</th><th>Stock Level</th><th>Surge Factor</th><th>AI Predicted (30D)</th><th>Procurement Reason</th><th>Shortfall ETA</th></tr></thead>
                  <tbody>
                    {filteredCenters.flatMap(c =>
                      Object.entries(c.stocks || {}).map(([medId, med]) => {
                        const forecast      = demandForecasts[c.id]?.[medId] || { predictedDemand: 0, recommendedProcurement: 0, shortfallDays: 0, pctIncrease: 15, confidenceScore: 92, matchedPattern: 'generic', reason: 'Standard telemetry baseline' };
                        const shortfallColor = forecast.shortfallDays < 5 ? 'var(--neon-red)' : forecast.shortfallDays < 15 ? 'var(--neon-amber)' : 'var(--neon-green)';
                        return (
                          <tr key={`${c.id}-${medId}`}>
                            <td>
                              <div>{c.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--neon-blue)', fontWeight: '600' }}>Confidence: {forecast.confidenceScore}%</div>
                            </td>
                            <td style={{ fontWeight: '500' }}>
                              <div>{med.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Pattern: {forecast.matchedPattern}</div>
                            </td>
                            <td>{med.currentStock} units</td>
                            <td style={{ color: 'var(--neon-blue)', fontWeight: 600 }}>+{forecast.pctIncrease}% surge</td>
                            <td>{forecast.predictedDemand} units</td>
                            <td style={{ fontWeight: '600', color: forecast.recommendedProcurement > 0 ? 'var(--neon-amber)' : 'white' }}>
                              <div>{forecast.recommendedProcurement} units recommended</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'normal', whiteSpace: 'normal', maxWidth: '200px', marginTop: '3px' }}>{forecast.reason}</div>
                            </td>
                            <td style={{ color: shortfallColor, fontWeight: '600' }}>{forecast.shortfallDays} days left</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Trend Charts */}
          <div className="glass-panel">
            <h3 className="panel-title">📈 30-Day Footfall & Stock Trends</h3>
            <div className="chart-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Footfall line chart */}
              <div>
                <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Average Patient Footfall Trend</h4>
                <svg className="chart-svg" viewBox="0 0 200 100">
                  <line x1="10" y1="10" x2="190" y2="10" className="chart-grid" />
                  <line x1="10" y1="40" x2="190" y2="40" className="chart-grid" />
                  <line x1="10" y1="70" x2="190" y2="70" className="chart-grid" />
                  <line x1="10" y1="75" x2="190" y2="75" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  <path d="M 10,75 Q 40,65 70,55 T 130,35 T 190,15" className="chart-path" stroke="var(--neon-blue)" />
                  <text x="10"  y="90" className="chart-label">Jun 1</text>
                  <text x="95"  y="90" className="chart-label">Jun 13</text>
                  <text x="170" y="90" className="chart-label">Jun 25</text>
                </svg>
              </div>

              {/* Stock bar chart */}
              <div>
                <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Average Stock Availability</h4>
                <svg className="chart-svg" viewBox="0 0 200 100">
                  <line x1="10" y1="10" x2="190" y2="10" className="chart-grid" />
                  <line x1="10" y1="40" x2="190" y2="40" className="chart-grid" />
                  <line x1="10" y1="70" x2="190" y2="70" className="chart-grid" />
                  <line x1="10" y1="75" x2="190" y2="75" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  {chartCenters.map((c, idx) => {
                    if (!c) return null;
                    const stockVal   = c.healthScores.stock;
                    const barHeight  = stockVal * 0.55;
                    const barY       = 75 - barHeight;
                    const colWidth   = 180 / chartCenters.length;
                    const barWidth   = Math.max(8, colWidth - 12);
                    const barX       = 10 + idx * colWidth + (colWidth - barWidth) / 2;
                    const color      = stockVal < 60 ? 'var(--neon-red)' : stockVal < 80 ? 'var(--neon-amber)' : 'var(--neon-green)';
                    const labelText  = c.name.replace(/^(PHC|CHC)\s+/, '').split(' (')[0];
                    return (
                      <g key={c.id}>
                        <rect x={barX} y={barY} width={barWidth} height={barHeight} className="chart-bar" fill={color} rx="2" />
                        <text x={barX + barWidth / 2} y="90" className="chart-label" textAnchor="middle" fill="var(--text-secondary)" style={{ fontSize: '7px' }}>{labelText}</text>
                        <text x={barX + barWidth / 2} y={barY - 4} textAnchor="middle" fill="white" style={{ fontSize: '6px', fontWeight: 'bold' }}>{stockVal}%</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column ── */}
        <div className="right-column">
          {/* Alerts Panel */}
          <div className="glass-panel" style={{ maxHeight: '420px', display: 'flex', flexDirection: 'column' }}>
            <h3 className="panel-title">🚨 Real-time Critical Alerts ({filteredAlerts.length})</h3>
            <div className="alerts-stack" style={{ overflowY: 'auto' }}>
              {filteredAlerts.map(a => (
                <div key={a.id} className={`alert-item ${a.type === 'RED' ? 'red' : a.type === 'YELLOW' ? 'yellow' : 'data-gap'}`}>
                  <div className="alert-title">{a.title}</div>
                  <div className="alert-desc">{a.desc}</div>
                  <div className="alert-action">Action: {a.action}</div>
                </div>
              ))}
              {filteredAlerts.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>No active alerts in this region.</div>
              )}
            </div>
          </div>

          {/* Pending Transfer Approvals */}
          <div className="glass-panel">
            <h3 className="panel-title">⚡ Pending Transfer Approvals</h3>
            <div className="table-container">
              <table>
                <thead><tr><th>Order</th><th>Detail</th><th>Qty</th><th>Actions</th></tr></thead>
                <tbody>
                  {pendingOrders.map(o => (
                    <tr key={o.id}>
                      <td>TRF-{o.id}</td>
                      <td>
                        <div>{o.medicineName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>From: {o.fromCenterName} → To: {o.toCenterName}</div>
                      </td>
                      <td style={{ fontWeight: '600' }}>{o.qty}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn-action approve" onClick={() => approveTransferOrder(o.id)} style={{ border: 'none', cursor: 'pointer' }}>Approve</button>
                          <button className="btn-action reject"  onClick={() => rejectTransferOrder(o.id)}  style={{ border: 'none', cursor: 'pointer' }}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendingOrders.length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No pending transfer orders.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Dispatches */}
          <div className="glass-panel">
            <h3 className="panel-title">🚚 Active Supply Chain Dispatches</h3>
            <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Order ID</th><th>Medicine</th><th>Qty</th><th>Transit Status</th></tr></thead>
                <tbody>
                  {dispatchOrders.map(o => (
                    <tr key={o.id}>
                      <td>TRF-{o.id}</td>
                      <td>
                        <div style={{ fontWeight: '500' }}>{o.medicineName}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{o.fromCenterName} ➔ {o.toCenterName}</div>
                      </td>
                      <td style={{ fontWeight: '600' }}>{o.qty} units</td>
                      <td>
                        {o.status === 'SHIPPED' ? (
                          <span style={{ color: 'var(--neon-amber)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="sync-dot-anim" style={{ width: '6px', height: '6px', background: 'var(--neon-amber)', borderRadius: '50%', display: 'inline-block' }} />
                            Shipping (ETA: {o.remainingTicks} ticks)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--neon-green)', fontWeight: '600' }}>✅ Arrived</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {dispatchOrders.length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>No active shipments or deliveries yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Log */}
          <div className="glass-panel">
            <h3 className="panel-title">📋 Operations System Log</h3>
            <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              {filteredAuditLog.map(l => (
                <div key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>[{l.timestamp}]</span>
                  <span style={{ color: 'var(--neon-blue)', fontWeight: '600', marginRight: '6px' }}>{l.userId}:</span>
                  <span>{l.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default DistrictOfficerView;
