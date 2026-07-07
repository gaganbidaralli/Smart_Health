/**
 * @file HealthContext.jsx
 * @description Global React context for the SmartHealth AI dashboard.
 *
 * Provides:
 *   - Authentication state and actions (login / logout)
 *   - All centre data and real-time simulation loop
 *   - Transfer order management (approve / reject)
 *   - Field-worker data entry actions (stock, beds, doctors, test kits)
 *   - Demand forecasts and alert re-evaluation on every tick
 *
 * Data constants live in src/data/.
 * Pure computation functions live in src/utils/.
 */

import React, { createContext, useState, useContext, useEffect } from 'react';
import { INITIAL_CENTERS }        from '../data/initialCenters';
import { INITIAL_ALERTS }         from '../data/initialAlerts';
import { INITIAL_TRANSFER_ORDERS} from '../data/initialTransferOrders';
import { evaluateAlerts }         from '../utils/alertEvaluator';
import { computeForecasts }       from '../utils/forecastComputer';
import { runAutoRedistribution }  from '../utils/redistributionEngine';

const HealthContext = createContext();

/** @returns {string} ISO timestamp trimmed to minute precision (e.g. "2026-06-26 19:30") */
function nowTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 16);
}

export const HealthProvider = ({ children }) => {
  // ── Role & Auth ──────────────────────────────────────────────────────────────
  /** @type {'DISTRICT_OFFICER'|'CENTER_ADMIN'|'FIELD_WORKER'} */
  const [currentRole,      setCurrentRole]      = useState('DISTRICT_OFFICER');
  const [selectedCenterId, setSelectedCenterId] = useState(null);
  const [isAuthenticated,  setAuthenticated]    = useState(false);

  // ── Simulation config ────────────────────────────────────────────────────────
  const [isSimActive, setSimActive] = useState(true);
  const [simSpeed,    setSimSpeed]  = useState(1); // 1x | 5x | 10x

  // ── Core data ────────────────────────────────────────────────────────────────
  const [centers,         setCenters]         = useState(INITIAL_CENTERS);
  const [alerts,          setAlerts]          = useState(INITIAL_ALERTS);
  const [transferOrders,  setTransferOrders]  = useState(INITIAL_TRANSFER_ORDERS);
  const [demandForecasts, setDemandForecasts] = useState({});

  const [auditLog, setAuditLog] = useState([
    { id: 'a1', timestamp: nowTimestamp(), userId: 'SYS', action: 'Weekly Center Health Scores computed' },
    { id: 'a2', timestamp: nowTimestamp(), userId: 'SYS', action: 'Daily footfall analysis execution' },
  ]);

  // ── Audit log helper ─────────────────────────────────────────────────────────
  /**
   * Prepends a new entry to the audit log.
   * @param {string} userId
   * @param {string} action
   */
  const addAuditEntry = (userId, action) => {
    setAuditLog(prev => [
      { id: `audit-${Date.now()}`, timestamp: nowTimestamp(), userId, action },
      ...prev,
    ]);
  };

  // ── Refs for Interval Access ───────────────────────────────────────────────────
  const centersRef = React.useRef(centers);
  const transferOrdersRef = React.useRef(transferOrders);
  const alertsRef = React.useRef(alerts);

  useEffect(() => { centersRef.current = centers; }, [centers]);
  useEffect(() => { transferOrdersRef.current = transferOrders; }, [transferOrders]);
  useEffect(() => { alertsRef.current = alerts; }, [alerts]);

  // ── Main Simulation Loop ─────────────────────────────────────────────────────
  useEffect(() => {
    // Generate initial demand forecasts on mount
    setDemandForecasts(computeForecasts(centersRef.current));

    if (!isSimActive) return;

    const interval = setInterval(() => {
      let currentCenters = JSON.parse(JSON.stringify(centersRef.current));
      let currentOrders = [...transferOrdersRef.current];
      let currentAlerts = [...alertsRef.current];

      // 1. Process in-transit orders: tick down remainingTicks, mark delivered
      const deliveredOrders = [];
      const nextOrders = currentOrders.map(o => {
        if (o.status !== 'SHIPPED') return o;
        const nextTicks = o.remainingTicks - 1;
        if (nextTicks <= 0) {
          deliveredOrders.push(o);
          return { ...o, status: 'DELIVERED', remainingTicks: 0 };
        }
        return { ...o, remainingTicks: nextTicks };
      });

      // Apply delivered stock to recipient centres
      if (deliveredOrders.length > 0) {
        deliveredOrders.forEach(o => {
          const toC = currentCenters[o.toCenterId];
          if (toC?.stocks[o.medicineId]) {
            toC.stocks[o.medicineId].currentStock += o.qty;
            toC.lastSync = Date.now();
          }
          // Clear the now-resolved stock critical alert
          currentAlerts = currentAlerts.filter(a => a.id !== `ST-RED-${o.toCenterId}-${o.medicineId}`);
          addAuditEntry('SHIPPING_BOT', `🚚 Delivered Transfer TRF-${o.id}: ${o.qty} units of ${o.medicineName} arrived at ${o.toCenterName}`);
        });
      }

      // 2. Tick all centre statistics
      const now = Date.now();
      Object.values(currentCenters).forEach(c => {
        // A. Stock consumption (burn rate scaled by simulation speed)
        Object.values(c.stocks).forEach(med => {
          const burn = med.dailyBurnRate * 0.05 * simSpeed;
          med.currentStock = Math.max(0, Math.round(med.currentStock - (Math.random() > 0.3 ? burn : 0)));
        });

        // B. Diagnostic kit usage
        Object.values(c.tests).forEach(test => {
          const usage = (test.isEssential ? 0.3 : 0.15) * simSpeed;
          test.kitCount = Math.max(0, Math.round(test.kitCount - (Math.random() > 0.5 ? usage : 0)));
        });

        // C. Bed occupancy random fluctuation (±1)
        const bed        = c.beds;
        const fluctuation = Math.random() > 0.65 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        bed.occupied      = Math.max(0, Math.min(bed.capacity, bed.occupied + fluctuation));
        bed.available     = bed.capacity - bed.occupied;

        // D. Patient footfall increment
        c.footfall.opdCount += Math.max(1, Math.round(Math.random() * 3 * simSpeed));
        c.footfall.ipdCount += Math.random() > 0.8 ? 1 : 0;
        c.footfall.total     = c.footfall.opdCount + c.footfall.ipdCount;

        // E. Rare random doctor attendance change (~4% chance per tick)
        if (Math.random() > 0.96) {
          const docs = Object.values(c.doctors);
          if (docs.length > 0) {
            const doc  = docs[Math.floor(Math.random() * docs.length)];
            doc.status = doc.status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
          }
        }

        // F. Recompute component health scores
        const stockScores = Object.values(c.stocks).map(med => {
          const ratio = med.currentStock / med.bufferStock;
          if (ratio < 0.10) return 20;
          if (ratio < 0.20) return 50;
          if (ratio < 1.00) return 85;
          return 100;
        });
        c.healthScores.stock = Math.round(stockScores.reduce((a, b) => a + b, 0) / stockScores.length);

        const docs         = Object.values(c.doctors);
        const presentDocs  = docs.filter(d => d.status === 'PRESENT').length;
        c.healthScores.attendance = docs.length > 0 ? Math.round((presentDocs / docs.length) * 100) : 100;

        const bedRate = bed.capacity > 0 ? bed.occupied / bed.capacity : 0;
        if      (bedRate >= 1.00) c.healthScores.bed = 40;
        else if (bedRate >= 0.85) c.healthScores.bed = 75;
        else if (bedRate <  0.30) c.healthScores.bed = 60;
        else                      c.healthScores.bed = 100;

        const essentialTests = Object.values(c.tests).filter(t => t.isEssential);
        const essentialOk    = essentialTests.filter(t => t.kitCount > 0 && t.expiryTimestamp > now);
        c.healthScores.test  = essentialTests.length > 0 ? Math.round((essentialOk.length / essentialTests.length) * 100) : 100;

        c.healthScores.footfall = Math.min(100, Math.max(50, c.healthScores.footfall + (Math.random() > 0.5 ? 1 : -1)));

        c.healthScores.overall = Math.round(
          c.healthScores.stock      * 0.30 +
          c.healthScores.attendance * 0.25 +
          c.healthScores.test       * 0.20 +
          c.healthScores.bed        * 0.15 +
          c.healthScores.footfall   * 0.10
        );
      });

      // 3. Side Effects computed synchronously 
      const nextAlerts = evaluateAlerts(currentCenters, currentAlerts);
      const nextForecasts = computeForecasts(currentCenters);
      const finalOrders = runAutoRedistribution(currentCenters, nextOrders);

      // 4. Commit all states
      setCenters(currentCenters);
      setTransferOrders(finalOrders);
      setAlerts(nextAlerts);
      setDemandForecasts(nextForecasts);
      
    }, 4000);

    return () => clearInterval(interval);
  }, [isSimActive, simSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action: Approve Transfer Order ──────────────────────────────────────────
  /**
   * Marks an order as SHIPPED, deducts stock from the source centre, and logs the event.
   * @param {string} orderId
   * @param {string} [userId]
   */
  const approveTransferOrder = (orderId, userId = 'District Admin') => {
    setTransferOrders(prevOrders => {
      const order = prevOrders.find(o => o.id === orderId);
      if (!order) return prevOrders;

      setCenters(prevCenters => {
        const updated   = JSON.parse(JSON.stringify(prevCenters));
        const fromCenter = updated[order.fromCenterId];
        if (fromCenter?.stocks[order.medicineId]) {
          fromCenter.stocks[order.medicineId].currentStock = Math.max(
            0,
            fromCenter.stocks[order.medicineId].currentStock - order.qty
          );
          fromCenter.lastSync = Date.now();
        }
        return updated;
      });

      addAuditEntry(userId, `🚀 Shipped Transfer TRF-${orderId}: Dispatching ${order.qty} units of ${order.medicineName} from ${order.fromCenterName} to ${order.toCenterName} (in transit)`);
      return prevOrders.map(o => o.id === orderId ? { ...o, status: 'SHIPPED', remainingTicks: 3 } : o);
    });
  };

  // ── Action: Reject Transfer Order ────────────────────────────────────────────
  /**
   * Marks an order as REJECTED and logs the event.
   * @param {string} orderId
   * @param {string} [userId]
   */
  const rejectTransferOrder = (orderId, userId = 'District Admin') => {
    setTransferOrders(prevOrders => {
      const order = prevOrders.find(o => o.id === orderId);
      if (!order) return prevOrders;
      addAuditEntry(userId, `Rejected Transfer TRF-${orderId}: ${order.medicineName} redistribution cancelled`);
      return prevOrders.map(o => o.id === orderId ? { ...o, status: 'REJECTED' } : o);
    });
  };

  // ── Action: Field Worker — manual stock log ───────────────────────────────────
  /**
   * Overwrites the current stock level for a medicine and triggers instant alert re-evaluation.
   * @param {string}       centerId
   * @param {string}       medicineId
   * @param {string|number} newQty
   * @param {string}       [userId]
   */
  const updateStockLevel = (centerId, medicineId, newQty, userId = 'Field Worker') => {
    setCenters(prevCenters => {
      const updated = { ...prevCenters };
      const center  = updated[centerId];
      if (center?.stocks[medicineId]) {
        center.stocks[medicineId].currentStock = parseInt(newQty, 10);
        center.lastSync = Date.now();
      }
      setAlerts(prevAlerts => evaluateAlerts(updated, prevAlerts));
      return updated;
    });
    addAuditEntry(userId, `Manual Log: Updated stock level of ${medicineId} at ${centerId} to ${newQty} units.`);
  };

  // ── Action: Center Admin — update occupied beds ──────────────────────────────
  /**
   * Updates bed occupancy and triggers instant alert re-evaluation.
   * @param {string}       centerId
   * @param {string|number} occupiedQty
   * @param {string}       [userId]
   */
  const updateBedsOccupied = (centerId, occupiedQty, userId = 'Center Admin') => {
    setCenters(prevCenters => {
      const updated = { ...prevCenters };
      const center  = updated[centerId];
      if (center?.beds) {
        const qty             = parseInt(occupiedQty, 10);
        center.beds.occupied  = qty;
        center.beds.available = Math.max(0, center.beds.capacity - qty);
        center.lastSync       = Date.now();
      }
      setAlerts(prevAlerts => evaluateAlerts(updated, prevAlerts));
      return updated;
    });
    addAuditEntry(userId, `Manual Log: Updated beds occupancy at ${centerId} to ${occupiedQty}/${centers[centerId]?.beds.capacity}.`);
  };

  // ── Action: Center Admin — toggle doctor status ──────────────────────────────
  /**
   * Sets a doctor's attendance status and triggers instant alert re-evaluation.
   * @param {string} centerId
   * @param {string} docId
   * @param {'PRESENT'|'ABSENT'} newStatus
   * @param {string} [userId]
   */
  const updateDoctorStatus = (centerId, docId, newStatus, userId = 'Center Admin') => {
    setCenters(prevCenters => {
      const updated = { ...prevCenters };
      const c       = updated[centerId];
      if (c?.doctors?.[docId]) {
        c.doctors[docId].status = newStatus;
        c.lastSync              = Date.now();
      }
      setAlerts(prevAlerts => evaluateAlerts(updated, prevAlerts));
      return updated;
    });
    addAuditEntry(userId, `Staff Update: Changed doctor status of ${docId} at ${centerId} to ${newStatus}.`);
  };

  // ── Action: Center Admin — update diagnostic kit count ───────────────────────
  /**
   * Updates test-kit count and triggers instant alert re-evaluation.
   * @param {string}       centerId
   * @param {string}       testId
   * @param {string|number} count
   * @param {string}       [userId]
   */
  const updateTestKitCount = (centerId, testId, count, userId = 'Center Admin') => {
    setCenters(prevCenters => {
      const updated = { ...prevCenters };
      const c       = updated[centerId];
      if (c?.tests?.[testId]) {
        c.tests[testId].kitCount = parseInt(count, 10) || 0;
        c.lastSync               = Date.now();
      }
      setAlerts(prevAlerts => evaluateAlerts(updated, prevAlerts));
      return updated;
    });
    addAuditEntry(userId, `Lab Update: Logged kit count of ${testId} at ${centerId} as ${count} units.`);
  };

  // ── Action: Trigger simulation incident ──────────────────────────────────────
  /**
   * Applies a named incident to the simulation (outbreak, stock drain, etc.).
   * @param {'outbreak'|'stock_drain'|'staff_leave'|'kit_expiry'|''} incidentType
   */
  const triggerSimIncident = incidentType => {
    if (!incidentType) return;
    const now = Date.now();
    let updatedCenters = null;
    let customAlert    = null;

    setCenters(prevCenters => {
      const updated = JSON.parse(JSON.stringify(prevCenters));

      if (incidentType === 'outbreak') {
        const c = updated.center_2;
        c.footfall.opdCount += 120;
        c.footfall.total     = c.footfall.opdCount + c.footfall.ipdCount;
        customAlert = {
          id: 'FF-OUTBREAK-center_2', centerId: 'center_2', type: 'RED',
          title: '🚨 OUTBREAK SPIKE DETECTED',
          desc:   `CHC Bandra (Mumbai) saw 3.2x usual footfall today (${c.footfall.total} visits vs average 44). Possible disease cluster!`,
          action: 'Deploy Mobile Health Unit. Redirect patients to nearest facilities.',
          urgency: 4,
        };
        addAuditEntry('INCIDENT_ENGINE', '🚨 Triggered Outbreak Surge incident at CHC Bandra (Mumbai)');

      } else if (incidentType === 'stock_drain') {
        updated.center_1.stocks.med_paracetamol.currentStock = 2;
        updated.center_1.stocks.med_ors.currentStock         = 1;
        addAuditEntry('INCIDENT_ENGINE', '⚠️ Triggered Critical Stock Shortage incident at PHC Dwarka (Delhi)');

      } else if (incidentType === 'staff_leave') {
        Object.values(updated.center_3.doctors).forEach(d => { d.status = 'ABSENT'; });
        addAuditEntry('INCIDENT_ENGINE', '🚨 Triggered Staff Emergency: All Doctors Absent at PHC Indiranagar (Bengaluru)');

      } else if (incidentType === 'kit_expiry') {
        Object.values(updated.center_4.tests).forEach(t => {
          t.expiryTimestamp = now - 1000; // Expired
          t.kitCount        = 0;
        });
        addAuditEntry('INCIDENT_ENGINE', '🚨 Triggered Diagnostic Block: Lab kit expiry at CHC Salt Lake (Kolkata)');
      }

      updatedCenters = updated;
      return updated;
    });

    // Evaluate alerts after centres state is committed
    setTimeout(() => {
      if (updatedCenters) {
        setAlerts(prevAlerts => {
          let nextAlerts = evaluateAlerts(updatedCenters, prevAlerts);
          if (customAlert) {
            nextAlerts = nextAlerts.filter(a => a.id !== customAlert.id);
            nextAlerts.push(customAlert);
          }
          return nextAlerts;
        });
      }
    }, 50);
  };

  // ── Authentication ───────────────────────────────────────────────────────────
  /**
   * Validates credentials and sets the appropriate role.
   * @param {string} username
   * @param {string} password
   * @returns {boolean} true on success, false on bad credentials
   */
  const login = (username, password) => {
    const u = username.trim().toLowerCase();
    if      (u === 'district' && password === 'officerpass') { setCurrentRole('DISTRICT_OFFICER'); setSelectedCenterId(null);       setAuthenticated(true); return true; }
    else if (u === 'admin'    && password === 'adminpass')   { setCurrentRole('CENTER_ADMIN');    setSelectedCenterId('center_1'); setAuthenticated(true); return true; }
    else if (u === 'worker'   && password === 'workerpass')  { setCurrentRole('FIELD_WORKER');    setSelectedCenterId('center_1'); setAuthenticated(true); return true; }
    return false;
  };

  /** Clears authentication state and returns to the login portal. */
  const logout = () => {
    setAuthenticated(false);
    setCurrentRole('DISTRICT_OFFICER');
    setSelectedCenterId(null);
  };

  // ── Context value ────────────────────────────────────────────────────────────
  return (
    <HealthContext.Provider value={{
      // Auth
      isAuthenticated, login, logout,
      // Role
      currentRole, setCurrentRole,
      selectedCenterId, setSelectedCenterId,
      // Data
      centers, alerts, transferOrders, auditLog, demandForecasts,
      // Simulation
      isSimActive, setSimActive, simSpeed, setSimSpeed, triggerSimIncident,
      // Actions
      approveTransferOrder, rejectTransferOrder,
      updateStockLevel, updateBedsOccupied, updateDoctorStatus, updateTestKitCount,
    }}>
      {children}
    </HealthContext.Provider>
  );
};

/** @returns {ReturnType<typeof HealthProvider>} The full health context value */
export const useHealth = () => useContext(HealthContext);
