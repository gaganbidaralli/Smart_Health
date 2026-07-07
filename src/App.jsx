/**
 * @file App.jsx
 * @description Root application component for SmartHealth AI.
 *
 * Responsibilities:
 *   - Authentication gate (delegates to LoginPortal)
 *   - App chrome: header, simulation controls, role-title bar
 *   - Role-based view routing: renders one of
 *     DistrictOfficerView | CenterAdminView | FieldWorkerView
 *
 * All business logic and data live in HealthContext.
 * All view-specific JSX lives in src/views/.
 */

import React, { useState, useEffect } from 'react';
import { useHealth }          from './context/HealthContext';
import LoginPortal            from './components/LoginPortal';
import CustomDropdown         from './components/CustomDropdown';
import DistrictOfficerView    from './views/DistrictOfficerView';
import CenterAdminView        from './views/CenterAdminView';
import FieldWorkerView        from './views/FieldWorkerView';

// ─── Simulation Speed Options ──────────────────────────────────────────────────
const SIM_SPEED_OPTIONS = [
  { value: 1,  label: '1x Speed'  },
  { value: 5,  label: '5x Speed'  },
  { value: 10, label: '10x Speed' },
];

// ─── Incident Trigger Options ──────────────────────────────────────────────────
const INCIDENT_OPTIONS = [
  { value: '',            label: '⚡ Trigger Incident'       },
  { value: 'outbreak',    label: 'Simulate Outbreak Surge'   },
  { value: 'stock_drain', label: 'Simulate Stock Drain'      },
  { value: 'staff_leave', label: 'Simulate Staff Emergency'  },
  { value: 'kit_expiry',  label: 'Simulate Lab Kit Expiry'   },
];

// ─── Simulation Controls container style ──────────────────────────────────────
const SIM_CONTROLS_STYLE = {
  display:      'flex',
  gap:          '6px',
  alignItems:   'center',
  background:   'rgba(255, 255, 255, 0.03)',
  padding:      '4px 8px',
  borderRadius: '8px',
  border:       '1px solid var(--border-glass)',
};

function App() {
  const {
    currentRole,
    selectedCenterId,
    setSelectedCenterId,
    centers,
    alerts,
    transferOrders,
    auditLog,
    approveTransferOrder,
    rejectTransferOrder,
    updateStockLevel,
    updateBedsOccupied,
    isSimActive,
    setSimActive,
    simSpeed,
    setSimSpeed,
    demandForecasts,
    triggerSimIncident,
    updateDoctorStatus,
    updateTestKitCount,
    isAuthenticated,
    login,
    logout,
  } = useHealth();

  // ── Tab & selection state ────────────────────────────────────────────────────
  const [activeCenterAdminId,  setActiveCenterAdminId]  = useState('center_1');
  const [activeWorkerCenterId, setActiveWorkerCenterId] = useState('center_1');
  const [selectedRegion,       setSelectedRegion]       = useState('ALL');
  const [districtTab,          setDistrictTab]          = useState('rankings');
  const [adminTab,             setAdminTab]             = useState('stock');

  // ── Field worker form state ──────────────────────────────────────────────────
  const [medSelect,   setMedSelect]   = useState('med_paracetamol');
  const [stockInput,  setStockInput]  = useState('');

  // ── Voice interface state ────────────────────────────────────────────────────
  const [isRecording,   setIsRecording]   = useState(false);
  const [voiceResponse, setVoiceResponse] = useState(null);

  // ── Live sync pulse indicator ────────────────────────────────────────────────
  const [syncTime, setSyncTime] = useState(new Date().toLocaleString());
  const [pulse,    setPulse]    = useState(false);

  useEffect(() => {
    setSyncTime(new Date().toLocaleString());
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 200);
    return () => clearTimeout(t);
  }, [centers]);

  // Sync worker medSelect default when the active centre changes
  useEffect(() => {
    const activeId  = selectedCenterId || activeWorkerCenterId;
    const stockKeys = Object.keys(centers[activeId]?.stocks || {});
    if (stockKeys.length > 0 && !stockKeys.includes(medSelect)) {
      setMedSelect(stockKeys[0]);
    }
  }, [selectedCenterId, activeWorkerCenterId, centers, medSelect]);

  // ── Auth gate ────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return <LoginPortal login={login} />;
  }

  // ── Resolved centre IDs for admin/worker views ───────────────────────────────
  const activeCenterId = selectedCenterId || (
    currentRole === 'CENTER_ADMIN' ? activeCenterAdminId : activeWorkerCenterId
  );

  const roleName = currentRole.toLowerCase().replace('_', ' ');

  return (
    <div className="app-container">

      {/* ── Header ── */}
      <header className="header" style={{ position: 'relative', zIndex: 1000 }}>
        <div className="logo-section">
          <span style={{ fontSize: '32px' }}>🏥</span>
          <div>
            <h1>SmartHealth AI</h1>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Multilingual CHC/PHC Operations Co-Pilot</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {/* Live sync indicator */}
          <div style={{ textAlign: 'right', fontSize: '12px' }}>
            <span style={{ color: 'var(--neon-green)', fontWeight: '600', opacity: pulse ? 0.3 : 1, transition: 'opacity 0.2s ease', display: 'inline-block' }}>
              ● Live Sync Active
            </span>
            <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{syncTime}</div>
          </div>

          {/* Simulation controls */}
          <div style={SIM_CONTROLS_STYLE}>
            <button
              className="role-btn"
              style={{ padding: '4px 8px', fontSize: '11px', background: isSimActive ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)', color: isSimActive ? 'var(--neon-blue)' : 'var(--neon-green)', borderRadius: '4px', border: 'none', cursor: 'pointer', minHeight: '32px' }}
              onClick={() => setSimActive(!isSimActive)}
            >
              {isSimActive ? '⏸️ Pause' : '▶️ Resume'}
            </button>

            <CustomDropdown
              value={simSpeed}
              onChange={val => setSimSpeed(parseInt(val, 10))}
              options={SIM_SPEED_OPTIONS}
              width="105px"
            />

            <CustomDropdown
              value=""
              onChange={val => triggerSimIncident(val)}
              options={INCIDENT_OPTIONS}
              placeholder="⚡ Trigger Incident"
              width="155px"
              color="var(--neon-red)"
            />
          </div>

          {/* Role badge + logout */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Role: <strong style={{ color: 'var(--neon-blue)', textTransform: 'capitalize' }}>{roleName}</strong>
            </span>
            <button
              className="role-btn active"
              style={{ padding: '6px 12px', fontSize: '12px', background: 'rgba(239,68,68,0.2)', color: 'var(--neon-red)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.4)', cursor: 'pointer', fontWeight: '600' }}
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Role title bar with centre selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', width: '100%', justifyContent: 'space-between', position: 'relative', zIndex: 90 }}>
        <h2 style={{ fontSize: '20px', fontWeight: '500' }}>
          {currentRole === 'DISTRICT_OFFICER' && 'National Operations Command Center'}
          {currentRole === 'CENTER_ADMIN'     && `Center Dashboard: ${centers[activeCenterId]?.name}`}
          {currentRole === 'FIELD_WORKER'     && `Field Worker Mobile Console: ${centers[activeCenterId]?.name}`}
        </h2>

        {currentRole === 'CENTER_ADMIN' && (
          <CustomDropdown
            value={activeCenterId}
            onChange={val => { setSelectedCenterId(val); setActiveCenterAdminId(val); }}
            options={Object.values(centers).map(c => ({ value: c.id, label: c.name }))}
            width="200px"
          />
        )}
        {currentRole === 'FIELD_WORKER' && (
          <CustomDropdown
            value={activeCenterId}
            onChange={val => { setSelectedCenterId(val); setActiveWorkerCenterId(val); }}
            options={Object.values(centers).map(c => ({ value: c.id, label: c.name }))}
            width="200px"
          />
        )}
      </div>

      {/* ── Role-based view routing ── */}
      {currentRole === 'DISTRICT_OFFICER' && (
        <DistrictOfficerView
          centers={centers}
          alerts={alerts}
          transferOrders={transferOrders}
          auditLog={auditLog}
          demandForecasts={demandForecasts}
          selectedCenterId={selectedCenterId}
          setSelectedCenterId={setSelectedCenterId}
          approveTransferOrder={approveTransferOrder}
          rejectTransferOrder={rejectTransferOrder}
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
          districtTab={districtTab}
          setDistrictTab={setDistrictTab}
        />
      )}

      {currentRole === 'CENTER_ADMIN' && (
        <CenterAdminView
          centers={centers}
          alerts={alerts}
          demandForecasts={demandForecasts}
          activeCenterId={activeCenterId}
          adminTab={adminTab}
          setAdminTab={setAdminTab}
          updateBedsOccupied={updateBedsOccupied}
          updateDoctorStatus={updateDoctorStatus}
          updateTestKitCount={updateTestKitCount}
        />
      )}

      {currentRole === 'FIELD_WORKER' && (
        <FieldWorkerView
          centers={centers}
          activeCenterId={activeCenterId}
          medSelect={medSelect}
          setMedSelect={setMedSelect}
          stockInput={stockInput}
          setStockInput={setStockInput}
          isRecording={isRecording}
          setIsRecording={setIsRecording}
          voiceResponse={voiceResponse}
          setVoiceResponse={setVoiceResponse}
          updateStockLevel={updateStockLevel}
        />
      )}
    </div>
  );
}

export default App;
