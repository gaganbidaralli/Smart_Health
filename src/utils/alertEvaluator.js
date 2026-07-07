/**
 * @file alertEvaluator.js
 * @description Pure function that inspects all health-centre data and produces
 * a fresh, deduplicated alert array. Stateless — safe to call on every tick.
 *
 * Alert types generated:
 *   DATA_GAP      — centre hasn't synced in >24 h
 *   RED / YELLOW  — stock critical / warning
 *   UNDERUTILIZED — bed occupancy <30 %
 *   RED / YELLOW  — bed full / near-full
 *   RED / YELLOW  — doctor attendance emergency / understaffed
 *   RED / YELLOW  — diagnostic kit essential gaps / shortage
 */

// ─── Thresholds ────────────────────────────────────────────────────────────────
const DATA_GAP_MS          = 24 * 60 * 60 * 1000; // 24 hours in ms
const STOCK_RED_RATIO      = 0.10; // < 10 % of buffer → RED
const STOCK_YELLOW_RATIO   = 0.20; // < 20 % of buffer → YELLOW
const BED_FULL_RATIO       = 1.00; // 100 % occupied → RED
const BED_NEAR_FULL_RATIO  = 0.85; // ≥ 85 %         → YELLOW
const BED_LOW_RATIO        = 0.30; // < 30 %          → UNDERUTILIZED
const KIT_LOW_COUNT        = 10;   // fewer kits than this → shortage flag
const STAFF_CRITICAL_COUNT = 0;    // zero doctors present → emergency
const STAFF_LOW_RATIO      = 0.50; // < 50 % present  → understaffed
const MOBILE_UNIT_THRESHOLD = 3;   // ≥ 3 short/expired basic tests → deploy mobile unit

/**
 * Re-evaluates all alert conditions across all centres and returns an updated
 * alert array. Previous alerts for each condition are replaced (not duplicated).
 *
 * @param {Record<string, object>} currentCenters  - Current centres state object
 * @param {object[]}               currentAlerts   - Previous alerts array
 * @returns {object[]} Fresh, deduplicated alerts array
 */
export function evaluateAlerts(currentCenters, currentAlerts) {
  let updatedAlerts = [...currentAlerts];
  const now = Date.now();

  Object.values(currentCenters).forEach(c => {
    const { id: centerId, name: centerName, block: blockName } = c;

    // ── 1. Data Gap ──────────────────────────────────────────────────────────
    updatedAlerts = updatedAlerts.filter(
      a => !(a.centerId === centerId && a.type === 'DATA_GAP')
    );
    if (now - c.lastSync > DATA_GAP_MS) {
      const hoursAgo = Math.floor((now - c.lastSync) / (60 * 60 * 1000));
      updatedAlerts.push({
        id: `DG-${centerId}`,
        centerId,
        type: 'DATA_GAP',
        title: '⚠️ DATA GAP WARNING',
        desc: `No updates received. Last Sync: ${hoursAgo} hours ago.`,
        action: 'Contact Center Admin to update stock',
        urgency: 3,
      });
    }

    // ── 2. Bed Alerts ────────────────────────────────────────────────────────
    const occupancyRate = c.beds.occupied / c.beds.capacity;
    updatedAlerts = updatedAlerts.filter(
      a => !(a.centerId === centerId && (
        a.id.includes('BD-RED') || a.id.includes('BD-YELLOW') || a.id.includes('BD-LOW')
      ))
    );

    if (occupancyRate >= BED_FULL_RATIO) {
      updatedAlerts.push({
        id: `BD-RED-${centerId}`,
        centerId,
        type: 'RED',
        title: '🔴 BEDS CRITICAL: FULL',
        desc: `Occupancy: 100% (${c.beds.occupied}/${c.beds.capacity}). Status: REDIRECT PATIENTS NOW.`,
        action: 'Redirect to PHC Guindy (6 beds free)',
        urgency: 4,
      });
    } else if (occupancyRate >= BED_NEAR_FULL_RATIO) {
      updatedAlerts.push({
        id: `BD-YELLOW-${centerId}`,
        centerId,
        type: 'YELLOW',
        title: '🟡 BEDS WARNING: NEAR FULL',
        desc: `Occupancy: ${Math.round(occupancyRate * 100)}% (${c.beds.occupied}/${c.beds.capacity}). Status: MONITOR CLOSELY.`,
        action: 'Alert district for coordination',
        urgency: 2,
      });
    } else if (occupancyRate < BED_LOW_RATIO) {
      updatedAlerts.push({
        id: `BD-LOW-${centerId}`,
        centerId,
        type: 'UNDERUTILIZED',
        title: '🟡 BEDS UNDERUTILIZATION AUDIT',
        desc: `Occupancy: <30% (${c.beds.occupied}/${c.beds.capacity}) for consecutive days.`,
        action: 'Flag for resources audit',
        urgency: 1,
      });
    }

    // ── 3. Stock Alerts ──────────────────────────────────────────────────────
    Object.entries(c.stocks).forEach(([medId, med]) => {
      updatedAlerts = updatedAlerts.filter(
        a => !(a.centerId === centerId && a.id.includes(medId))
      );
      const { bufferStock: buffer, currentStock: current, dailyBurnRate } = med;
      const redLimit    = STOCK_RED_RATIO    * buffer;
      const yellowLimit = STOCK_YELLOW_RATIO * buffer;

      if (current < redLimit) {
        updatedAlerts.push({
          id: `ST-RED-${centerId}-${medId}`,
          centerId,
          type: 'RED',
          title: '🔴 STOCK CRITICAL',
          desc: `Medicine: ${med.name} | Current: ${current} units | Buffer: ${buffer} units (${(current / (dailyBurnRate || 1)).toFixed(1)} days left)`,
          action: 'Transfer from surplus or raise urgent procurement',
          urgency: 4,
        });
      } else if (current < yellowLimit) {
        updatedAlerts.push({
          id: `ST-YELLOW-${centerId}-${medId}`,
          centerId,
          type: 'YELLOW',
          title: '🟡 STOCK WARNING',
          desc: `Medicine: ${med.name} | Current: ${current} units | Buffer: ${buffer} units`,
          action: 'raise procurement order',
          urgency: 2,
        });
      }
    });

    // ── 4. Attendance Alerts ─────────────────────────────────────────────────
    const docs        = Object.values(c.doctors);
    const totalDocs   = docs.length;
    const presentDocs = docs.filter(d => d.status === 'PRESENT').length;
    const staffPct    = totalDocs > 0 ? presentDocs / totalDocs : 1.0;

    updatedAlerts = updatedAlerts.filter(
      a => !(a.centerId === centerId && (
        a.id.includes('AT-RED') || a.id.includes('AT-YELLOW')
      ))
    );

    if (presentDocs === STAFF_CRITICAL_COUNT && c.footfall.total > 50) {
      updatedAlerts.push({
        id: `AT-RED-${centerId}`,
        centerId,
        type: 'RED',
        title: '🔴 ATTENDANCE: CRITICAL EMERGENCY',
        desc: `Critical: 0 doctors present for ${c.footfall.total} active patients today.`,
        action: 'Deploy emergency medical officer',
        urgency: 4,
      });
    } else if (staffPct < STAFF_LOW_RATIO) {
      updatedAlerts.push({
        id: `AT-YELLOW-${centerId}`,
        centerId,
        type: 'YELLOW',
        title: '🟡 ATTENDANCE: UNDERSTAFFED',
        desc: `Understaffed: Only ${presentDocs}/${totalDocs} doctors present today (${Math.round(staffPct * 100)}%).`,
        action: 'Raise staff replacement request',
        urgency: 2,
      });
    }

    // ── 5. Diagnostic Kit Alerts ─────────────────────────────────────────────
    const unavailableEssentialTests = [];
    let basicTestsShortCount = 0;

    Object.entries(c.tests).forEach(([testId, test]) => {
      const isExpired = test.expiryTimestamp < now;
      const isShort   = test.kitCount < KIT_LOW_COUNT || isExpired;

      updatedAlerts = updatedAlerts.filter(
        a => !(a.centerId === centerId && a.id.includes(testId))
      );

      if (isShort) {
        basicTestsShortCount++;
        if (test.isEssential) {
          unavailableEssentialTests.push(test.name);
        }
        updatedAlerts.push({
          id: `TS-LOW-${centerId}-${testId}`,
          centerId,
          type: 'YELLOW',
          title: '🟡 DIAGNOSTIC WARNING: KIT SHORTAGE',
          desc: `Test: ${test.name} | Kits: ${test.kitCount} | Status: ${isExpired ? 'EXPIRED' : 'LOW STOCK'}`,
          action: 'raise procurement order',
          urgency: 2,
        });
      }
    });

    updatedAlerts = updatedAlerts.filter(
      a => !(a.centerId === centerId && (
        a.id.includes('TS-RED') || a.id.includes('TS-MOBILE')
      ))
    );

    if (unavailableEssentialTests.length > 0) {
      updatedAlerts.push({
        id: `TS-RED-${centerId}`,
        centerId,
        type: 'RED',
        title: '🔴 DIAGNOSTIC BLOCKED: ESSENTIAL GAPS',
        desc: `Blocked essential tests: ${unavailableEssentialTests.join(', ')}.`,
        action: 'Immediate kit dispatch required',
        urgency: 4,
      });
    }
    if (basicTestsShortCount >= MOBILE_UNIT_THRESHOLD) {
      updatedAlerts.push({
        id: `TS-MOBILE-${centerId}`,
        centerId,
        type: 'YELLOW',
        title: '🟡 MOBILE DIAGNOSTIC RECOMMENDATION',
        desc: `3+ basic tests unavailable/short at this center.`,
        action: 'Deploy Mobile Diagnostic Unit in 24 hours',
        urgency: 3,
      });
    }
  });

  return updatedAlerts;
}
