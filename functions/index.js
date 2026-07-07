/**
 * @module SmartHealthAI / CloudFunctions
 * @description Firebase Scheduled Cloud Functions for the SmartHealth AI backend.
 *
 * Exported functions (called via Firebase pub/sub schedules):
 *   - dailyStockCheck          : 6:00 AM daily stock alert analysis
 *   - dailyAttendanceCheck     : 6:00 PM daily doctor attendance check
 *   - dailyTestsCheck          : 8:00 AM daily diagnostic kit check
 *   - dailyBedCheck            : 6:00 AM daily bed utilisation check
 *   - weeklyForecastCheck      : 7:00 AM Sunday AI demand forecast
 *   - weeklyHealthCheck        : Midnight Sunday health score computation
 *
 * Exported analysis modules (can also be invoked directly):
 *   - analyzeStockAndGenerateAlerts
 *   - analyzeAttendanceAndAlert
 *   - analyzeDiagnosticKitsAndAlert
 *   - analyzeBedUtilizationAndAlert
 *   - generateDemandForecast
 *   - runResourceRedistribution
 *   - computeWeeklyHealthScores
 */

"use strict";

const functions = require("firebase-functions");
const admin     = require("firebase-admin");

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// ─── Module-wide Constants ─────────────────────────────────────────────────────
const ONE_DAY_MS         = 24 * 60 * 60 * 1000; // 1 day in milliseconds
const CARD_INNER_WIDTH   = 43;                   // Characters inside alert card borders

/** Stock thresholds (fraction of buffer stock) */
const STOCK_RED_RATIO    = 0.10; // < 10% → RED
const STOCK_YELLOW_RATIO = 0.20; // < 20% → YELLOW
const SURPLUS_RATIO      = 1.30; // > 130% → donor candidate

/** Bed occupancy thresholds */
const BED_FULL_RATIO         = 1.00;
const BED_NEAR_FULL_RATIO    = 0.85;
const BED_LOW_RATIO          = 0.30;

/** Diagnostic kit constants */
const KIT_LOW_COUNT          = 10;  // fewer kits → shortage alert
const MOBILE_UNIT_THRESHOLD  = 3;   // ≥ 3 short/expired basic tests → mobile unit

/** Doctor attendance thresholds */
const STAFF_CRITICAL_COUNT   = 0;    // 0 doctors → emergency
const STAFF_LOW_RATIO        = 0.50; // < 50% present → understaffed

/** Alert deadline hours */
const DEADLINE_RED_HOURS     = 24;   // 24 h for critical
const DEADLINE_YELLOW_HOURS  = 120;  // 5 days for warnings
const DEADLINE_DATA_GAP_HOURS = 4;   // 4 h to resolve data gap

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a Date object (or ms timestamp) into an ISO-like string truncated to
 * minute precision: "YYYY-MM-DD HH:mm".
 *
 * @param {Date|number} dateOrMs
 * @returns {string}
 */
function formatDateString(dateOrMs) {
  return new Date(dateOrMs).toISOString().replace("T", " ").substring(0, 16);
}

/**
 * Pads `text` to `width` characters and wraps it in box-drawing border chars.
 *
 * @param {string} text
 * @param {number} [width=CARD_INNER_WIDTH]
 * @returns {string}
 */
function formatLine(text, width = CARD_INNER_WIDTH) {
  const padding    = width - text.length;
  const paddedText = padding > 0 ? text + " ".repeat(padding) : text.substring(0, width);
  return `│ ${paddedText} │`;
}

/**
 * Builds a fixed-width ASCII alert card for storage in Firebase.
 *
 * @param {'RED'|'YELLOW'|'DATA_GAP'} type
 * @param {string} centerName
 * @param {string} blockName
 * @param {string} medName          - Medicine or test name (empty for DATA_GAP)
 * @param {number} currentStock     - Current stock level
 * @param {number} bufferStock      - Target buffer level
 * @param {string} daysToStockOut   - Pre-formatted string (e.g. "3.5 days" or sync timestamp)
 * @param {string} actionInfo       - Recommended action
 * @param {string} deadlineStr      - Deadline formatted with {@link formatDateString}
 * @returns {string} Multi-line ASCII card
 */
function generateAlertCard(type, centerName, blockName, medName, currentStock, bufferStock, daysToStockOut, actionInfo, deadlineStr) {
  const width        = CARD_INNER_WIDTH;
  const borderTop    = `┌${"─".repeat(width + 2)}┐`;
  const borderBottom = `└${"─".repeat(width + 2)}┘`;

  const lines = [borderTop];

  if (type === "RED") {
    lines.push(formatLine("🔴 STOCK CRITICAL", width));
  } else if (type === "YELLOW") {
    lines.push(formatLine("🟡 STOCK WARNING", width));
  } else if (type === "DATA_GAP") {
    lines.push(formatLine("⚠️ DATA GAP WARNING", width));
  }

  lines.push(formatLine(`Center: ${centerName} | Block: ${blockName}`, width));

  if (type === "DATA_GAP") {
    lines.push(formatLine(`Warning: No stock entry received in 24h`, width));
    lines.push(formatLine(`Last Sync: ${daysToStockOut}`, width)); // reuse parameter for last sync description
    lines.push(formatLine(`Action: ${actionInfo}`, width));
  } else {
    lines.push(formatLine(`Medicine: ${medName} | Current: ${currentStock} units`, width));
    lines.push(formatLine(`Buffer needed: ${bufferStock} units`, width));
    lines.push(formatLine(`Days to stock-out: ${daysToStockOut} days`, width));
    lines.push(formatLine(`Action: ${actionInfo}`, width));
  }

  lines.push(formatLine(`Deadline: ${deadlineStr}`, width));
  lines.push(borderBottom);

  return lines.join("\n");
}

// ─── Analysis Modules ─────────────────────────────────────────────────────────

/**
 * Module 1: Stock Analysis & Alerts.
 * Inspects medicine stock levels and writes RED / YELLOW / DATA_GAP alerts
 * to Firebase. Also identifies surplus centres for redistribution suggestions.
 *
 * @param {admin.database.Database} db
 * @param {number} [executionTimeMs] - Override for `Date.now()` (useful in tests)
 * @returns {Promise<object[]>} Array of alert payloads written to Firebase
 */
async function analyzeStockAndGenerateAlerts(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();

  const centersSnap = await db.ref("centers").once("value");
  const stockSnap = await db.ref("stock").once("value");

  const centers = centersSnap.val() || {};
  const stocks = stockSnap.val() || {};
  const alertsCreated = [];

  // 1. Build surplus pool — centres with currentStock > SURPLUS_RATIO * buffer
  const surplusPool = {}; // medId → [{ centerId, centerName, surplusQty }]
  
  for (const [cId, centerStock] of Object.entries(stocks)) {
    if (!centerStock) continue;
    for (const [mId, med] of Object.entries(centerStock)) {
      if (!med) continue;
      const surplusLimit = SURPLUS_RATIO * med.bufferStock;
      if (med.currentStock > surplusLimit) {
        const surplusQty = med.currentStock - med.bufferStock;
        if (!surplusPool[mId]) {
          surplusPool[mId] = [];
        }
        surplusPool[mId].push({
          centerId: cId,
          centerName: centers[cId] ? centers[cId].name : `PHC ${cId}`,
          surplusQty: surplusQty
        });
      }
    }
  }

  // Sort surplus pools so the center with the most surplus is first
  for (const mId of Object.keys(surplusPool)) {
    surplusPool[mId].sort((a, b) => b.surplusQty - a.surplusQty);
  }

  // 2. Scan each center for stock alerts or data gaps
  for (const [centerId, center] of Object.entries(centers)) {
    const centerName = center.name || "Unknown Center";
    const blockName = center.block || "Unknown Block";
    const lastSync = center.lastSync || 0;

    // Check Data Gap warning
    if (now - lastSync > ONE_DAY_MS) {
      const hoursAgo    = Math.floor((now - lastSync) / (60 * 60 * 1000));
      const syncStr     = lastSync === 0 ? "Never" : `${hoursAgo} hours ago`;
      const deadlineStr = formatDateString(now + DEADLINE_DATA_GAP_HOURS * 60 * 60 * 1000);

      const alertText = generateAlertCard(
        "DATA_GAP",
        centerName,
        blockName,
        "",
        0,
        0,
        syncStr,
        "Contact Center Admin to update stock",
        deadlineStr
      );

      const alertId = `DG-${centerId}-${now}`;
      const alertPayload = {
        centerId,
        medicineId: "ALL",
        type: "DATA_GAP",
        timestamp: now,
        status: "ACTIVE",
        formattedText: alertText
      };

      await db.ref(`alerts/${alertId}`).set(alertPayload);
      alertsCreated.push(alertPayload);
      continue; // Skip stock level check if there's a total data gap (data is stale)
    }

    // Check stock levels
    const centerStock = stocks[centerId] || {};
    for (const [medId, med] of Object.entries(centerStock)) {
      const current = med.currentStock;
      const buffer = med.bufferStock;
      const burnRate = med.dailyBurnRate || 0;

      const yellowThreshold = STOCK_YELLOW_RATIO * buffer;
      const redThreshold    = STOCK_RED_RATIO    * buffer;

      let alertType = null;
      if      (current < redThreshold)    alertType = "RED";
      else if (current < yellowThreshold) alertType = "YELLOW";

      if (alertType) {
        const daysToStockOut = burnRate > 0 ? (current / burnRate).toFixed(1) : "Indefinite";
        const deficit = Math.max(0, buffer - current);

        // Find potential source for redistribution (Center B)
        let actionInfo = "raise procurement order";
        const sources = surplusPool[medId] || [];
        // Filter out current center as source
        const validSources = sources.filter(s => s.centerId !== centerId);
        
        if (validSources.length > 0) {
          const bestSource = validSources[0];
          actionInfo = `Transfer ${deficit} units from ${bestSource.centerName}`;
        }

        // Set deadline based on urgency
        const deadlineHours = alertType === "RED" ? DEADLINE_RED_HOURS : DEADLINE_YELLOW_HOURS;
        const deadlineStr   = formatDateString(now + deadlineHours * 60 * 60 * 1000);

        const alertText = generateAlertCard(
          alertType,
          centerName,
          blockName,
          med.name,
          current,
          buffer,
          daysToStockOut,
          actionInfo,
          deadlineStr
        );

        const alertId = `ST-${alertType}-${centerId}-${medId}-${now}`;
        const alertPayload = {
          centerId,
          medicineId: medId,
          type: alertType,
          timestamp: now,
          status: "ACTIVE",
          formattedText: alertText
        };

        await db.ref(`alerts/${alertId}`).set(alertPayload);
        alertsCreated.push(alertPayload);

        // Simulate sending WhatsApp/SMS for RED alerts
        if (alertType === "RED" && center.adminPhone) {
          console.log(`[SMS OUTBOUND] To: ${center.adminPhone}\n${alertText}`);
        }
      }
    }
  }

  return alertsCreated;
}

/**
 * Firebase Scheduled Function: Runs daily at 6:00 AM
 */
exports.dailyStockCheck = functions.pubsub
  .schedule("0 6 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    const db = admin.database();
    console.log("Starting scheduled 6 AM stock validation check...");
    const alerts = await analyzeStockAndGenerateAlerts(db);
    console.log(`Completed scheduled check. Generated ${alerts.length} new alerts.`);
    return null;
  });

// Export helper for direct invocation in tests
exports.analyzeStockAndGenerateAlerts = analyzeStockAndGenerateAlerts;

// Haversine distance calculator
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return null;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Module 2: Patient Footfall Intelligence and Outbreak Spike Detection
 */
async function analyzeFootfallAndDetectSpikes(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const centersSnap = await db.ref("centers").once("value");
  const footfallSnap = await db.ref("footfall").once("value");
  const bedsSnap = await db.ref("beds").once("value");

  const centers = centersSnap.val() || {};
  const footfalls = footfallSnap.val() || {};
  const beds = bedsSnap.val() || {};
  const alertsCreated = [];

  // Get current date string (YYYY-MM-DD)
  const todayDate = new Date(now);
  const yyyy = todayDate.getFullYear();
  const mm = String(todayDate.getMonth() + 1).padStart(2, "0");
  const dd = String(todayDate.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Get date strings for previous 7 days
  const prevDateStrs = [];
  for (let i = 1; i <= 7; i++) {
    const prev = new Date(now - i * ONE_DAY_MS);
    const pY = prev.getFullYear();
    const pM = String(prev.getMonth() + 1).padStart(2, "0");
    const pD = String(prev.getDate()).padStart(2, "0");
    prevDateStrs.push(`${pY}-${pM}-${pD}`);
  }

  for (const [centerId, center] of Object.entries(centers)) {
    const centerName = center.name || "Unknown Center";
    const blockName = center.block || "Unknown Block";
    const centerFootfall = footfalls[centerId] || {};

    // 1. Calculate 7-day rolling average
    let sum = 0;
    let daysWithData = 0;
    for (const dStr of prevDateStrs) {
      if (centerFootfall[dStr] && typeof centerFootfall[dStr].total === "number") {
        sum += centerFootfall[dStr].total;
        daysWithData++;
      }
    }
    
    // Average baseline. If no data, rolling avg is 0
    const rollingAvg = daysWithData > 0 ? Math.round(sum / daysWithData) : 0;
    const todayData = centerFootfall[todayStr];
    const todayTotal = todayData ? todayData.total : 0;

    // Detect spike: today > 2x rolling average
    if (rollingAvg > 0 && todayTotal > 2 * rollingAvg) {
      const ratio = Math.round(todayTotal / rollingAvg);

      // Find nearest centers with available beds
      const nearbyBeds = [];
      for (const [otherId, otherCenter] of Object.entries(centers)) {
        if (otherId === centerId) continue;
        const otherBed = beds[otherId];
        if (otherBed && otherBed.available > 0) {
          let dist = null;
          if (center.latitude !== undefined && center.longitude !== undefined && 
              otherCenter.latitude !== undefined && otherCenter.longitude !== undefined) {
            dist = calculateDistance(center.latitude, center.longitude, otherCenter.latitude, otherCenter.longitude);
          }
          nearbyBeds.push({
            id: otherId,
            name: otherCenter.name || `PHC ${otherId}`,
            available: otherBed.available,
            distance: dist !== null ? dist : 999
          });
        }
      }

      // Sort by distance (ascending)
      nearbyBeds.sort((a, b) => a.distance - b.distance);

      // Select top 2 closest capacity sites within 15km
      const targetSites = nearbyBeds.filter(b => b.distance <= 15 || b.distance === 999).slice(0, 2);
      let capacityStr = "None nearby";
      if (targetSites.length > 0) {
        capacityStr = targetSites.map(s => `[${s.name}: ${s.available} beds free]`).join(" ");
      }

      const alertText = `${centerName} saw ${ratio}x usual footfall today (${todayTotal} vs avg ${rollingAvg}). Possible disease cluster. Nearest centers with capacity: ${capacityStr}. Recommend deploying mobile health unit. Alert sent to Block Medical Officer.`;

      const alertId = `FF-OUTBREAK-${centerId}-${todayStr}`;
      const alertPayload = {
        centerId,
        type: "OUTBREAK",
        timestamp: now,
        status: "ACTIVE",
        formattedText: alertText
      };

      await db.ref(`alerts/${alertId}`).set(alertPayload);
      alertsCreated.push(alertPayload);

      // Alert Block Officer via Admin Phone
      if (center.adminPhone) {
        console.log(`[SMS OUTBOUND] To: ${center.adminPhone}\n${alertText}`);
      }
    }
  }

  return alertsCreated;
}

exports.analyzeFootfallAndDetectSpikes = analyzeFootfallAndDetectSpikes;

/**
 * Firebase Scheduled Function for Footfall: Runs daily at 7:00 PM
 */
exports.dailyFootfallCheck = functions.pubsub
  .schedule("0 19 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    const db = admin.database();
    console.log("Starting scheduled 7 PM footfall trend evaluation...");
    const alerts = await analyzeFootfallAndDetectSpikes(db);
    console.log(`Completed scheduled check. Generated ${alerts.length} outbreak alerts.`);
    return null;
  });

/**
 * Helper to construct the bed availability alert card.
 */
function generateBedAlertCard(type, centerName, blockName, occupied, capacity, actionText, routeInfo, deadlineStr) {
  const width = 43;
  const borderTop = `┌${"─".repeat(width + 2)}┐`;
  const borderBottom = `└${"─".repeat(width + 2)}┘`;

  const lines = [borderTop];

  if (type === "RED") {
    lines.push(formatLine("🔴 BEDS CRITICAL: FULL", width));
  } else if (type === "YELLOW") {
    lines.push(formatLine("🟡 BEDS WARNING: NEAR FULL", width));
  } else if (type === "UNDERUTILIZED") {
    lines.push(formatLine("🟡 BEDS UNDERUTILIZATION AUDIT", width));
  }

  lines.push(formatLine(`Center: ${centerName} | Block: ${blockName}`, width));

  if (type === "UNDERUTILIZED") {
    lines.push(formatLine(`Occupancy: <30% for 7 consecutive days`, width));
    lines.push(formatLine(`Status: UNDERUTILIZED`, width));
    lines.push(formatLine(`Action: Flag for resources audit`, width));
  } else {
    const occRate = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
    lines.push(formatLine(`Occupancy: ${occRate}% (${occupied}/${capacity})`, width));
    if (type === "RED") {
      lines.push(formatLine(`Status: REDIRECT PATIENTS NOW`, width));
      lines.push(formatLine(`Suggestion: Redirect to ${actionText}`, width));
      if (routeInfo) {
        lines.push(formatLine(routeInfo, width));
      }
    } else {
      lines.push(formatLine(`Status: MONITOR CLOSELY`, width));
      lines.push(formatLine(`Action: ${actionText}`, width));
    }
  }

  lines.push(formatLine(`Deadline: ${deadlineStr}`, width));
  lines.push(borderBottom);

  return lines.join("\n");
}

/**
 * Module 3: Bed Availability Management
 */
async function analyzeBedCapacityAndAlert(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const centersSnap = await db.ref("centers").once("value");
  const bedsSnap = await db.ref("beds").once("value");
  const bedsHistorySnap = await db.ref("beds_history").once("value");

  const centers = centersSnap.val() || {};
  const beds = bedsSnap.val() || {};
  const bedsHistory = bedsHistorySnap.val() || {};
  const alertsCreated = [];

  // Get date strings for previous 7 days
  const prevDateStrs = [];
  for (let i = 1; i <= 7; i++) {
    const prev = new Date(now - i * ONE_DAY_MS);
    const pY = prev.getFullYear();
    const pM = String(prev.getMonth() + 1).padStart(2, "0");
    const pD = String(prev.getDate()).padStart(2, "0");
    prevDateStrs.push(`${pY}-${pM}-${pD}`);
  }

  for (const [centerId, center] of Object.entries(centers)) {
    const centerName = center.name || "Unknown Center";
    const blockName = center.block || "Unknown Block";
    const bedInfo = beds[centerId];

    if (!bedInfo) continue;

    const capacity = bedInfo.capacity || 0;
    const occupied = bedInfo.occupied || 0;
    const available = bedInfo.available || 0;
    const occupancyRate = capacity > 0 ? occupied / capacity : 0;

    let alertType = null;
    let actionText = "";
    let routeInfo = "";
    let deadlineStr = "";

    // 1. Saturation thresholds
    if (occupancyRate >= 1.0) {
      alertType = "RED";
      deadlineStr = "Immediate";

      // Redirect logic: find nearest center with available beds within 15km
      const nearbyBeds = [];
      for (const [otherId, otherCenter] of Object.entries(centers)) {
        if (otherId === centerId) continue;
        const otherBed = beds[otherId];
        if (otherBed && otherBed.available > 0) {
          let dist = null;
          if (center.latitude !== undefined && center.longitude !== undefined && 
              otherCenter.latitude !== undefined && otherCenter.longitude !== undefined) {
            dist = calculateDistance(center.latitude, center.longitude, otherCenter.latitude, otherCenter.longitude);
          }
          nearbyBeds.push({
            id: otherId,
            name: otherCenter.name || `PHC ${otherId}`,
            available: otherBed.available,
            distance: dist !== null ? dist : 999
          });
        }
      }

      // Sort by distance
      nearbyBeds.sort((a, b) => a.distance - b.distance);
      const validTargets = nearbyBeds.filter(b => b.distance <= 15 || b.distance === 999);

      if (validTargets.length > 0) {
        const target = validTargets[0];
        actionText = `${target.name} (${target.available} beds free)`;
        // Driving time estimate: 30 km/h average speed -> dist * 2 mins
        const estTime = target.distance !== 999 ? Math.round(target.distance * 2) : 15;
        const distStr = target.distance !== 999 ? `${target.distance.toFixed(1)} km` : "N/A";
        routeInfo = `Route: via Main Road (${distStr} | ${estTime} min)`;
      } else {
        actionText = "District emergency pool / raise urgent procurement";
        routeInfo = "No capacity within 15km perimeter";
      }

    } else if (occupancyRate >= 0.85) {
      alertType = "YELLOW";
      actionText = "Alert district for coordination";
      const deadline = new Date(now + 2 * 60 * 60 * 1000); // 2 hours
      deadlineStr = deadline.toISOString().replace("T", " ").substring(0, 16);
    }

    if (alertType) {
      const alertText = generateBedAlertCard(
        alertType,
        centerName,
        blockName,
        occupied,
        capacity,
        actionText,
        routeInfo,
        deadlineStr
      );

      const alertId = `BD-${alertType}-${centerId}-${now}`;
      const alertPayload = {
        centerId,
        type: alertType === "RED" ? "BEDS_FULL" : "BEDS_NEAR_FULL",
        timestamp: now,
        status: "ACTIVE",
        formattedText: alertText
      };

      await db.ref(`alerts/${alertId}`).set(alertPayload);
      alertsCreated.push(alertPayload);

      if (center.adminPhone) {
        console.log(`[SMS OUTBOUND] To: ${center.adminPhone}\n${alertText}`);
      }
    }

    // 2. Underutilization Flag (consistently <30% for 7 days)
    let hasCompleteHistory = true;
    let isUnderutilized = true;
    for (const dStr of prevDateStrs) {
      const historyRecord = bedsHistory[centerId] ? bedsHistory[centerId][dStr] : null;
      if (!historyRecord || typeof historyRecord.occupancyRate !== "number") {
        hasCompleteHistory = false;
        break;
      }
      if (historyRecord.occupancyRate >= 0.30) {
        isUnderutilized = false;
        break;
      }
    }

    if (hasCompleteHistory && isUnderutilized) {
      const deadline = new Date(now + 7 * 24 * 60 * 60 * 1000); // 7 days
      const deadlineStr = deadline.toISOString().replace("T", " ").substring(0, 16);

      const alertText = generateBedAlertCard(
        "UNDERUTILIZED",
        centerName,
        blockName,
        0,
        0,
        "",
        "",
        deadlineStr
      );

      const alertId = `BD-LOW-${centerId}-${now}`;
      const alertPayload = {
        centerId,
        type: "BEDS_LOW_UTILIZATION",
        timestamp: now,
        status: "ACTIVE",
        formattedText: alertText
      };

      await db.ref(`alerts/${alertId}`).set(alertPayload);
      alertsCreated.push(alertPayload);
    }
  }

  return alertsCreated;
}

exports.analyzeBedCapacityAndAlert = analyzeBedCapacityAndAlert;

exports.hourlyBedsCheck = functions.pubsub
  .schedule("0 * * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    const db = admin.database();
    console.log("Starting hourly bed capacity inspection...");
    const alerts = await analyzeBedCapacityAndAlert(db);
    console.log(`Completed hourly check. Generated ${alerts.length} occupancy alerts.`);
    return null;
  });

/**
 * Helper to construct the attendance alert card.
 */
function generateAttendanceAlertCard(type, centerName, blockName, present, total, detailText, deadlineStr) {
  const width = 43;
  const borderTop = `┌${"─".repeat(width + 2)}┐`;
  const borderBottom = `└${"─".repeat(width + 2)}┘`;

  const lines = [borderTop];

  if (type === "RED") {
    lines.push(formatLine("🔴 ATTENDANCE: CRITICAL EMERGENCY", width));
  } else if (type === "CHRONIC") {
    lines.push(formatLine("🔴 ATTENDANCE: CHRONIC ABSENTEEISM", width));
  } else if (type === "YELLOW") {
    lines.push(formatLine("🟡 ATTENDANCE: UNDERSTAFFED", width));
  }

  lines.push(formatLine(`Center: ${centerName} | Block: ${blockName}`, width));
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  lines.push(formatLine(`Doctors Present: ${present}/${total} (${pct}%)`, width));
  lines.push(formatLine(detailText, width));
  lines.push(formatLine(`Deadline: ${deadlineStr}`, width));
  lines.push(borderBottom);

  return lines.join("\n");
}

/**
 * Module 4: Doctor & Staff Attendance
 */
async function analyzeAttendanceAndAlert(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const centersSnap = await db.ref("centers").once("value");
  const attendanceSnap = await db.ref("attendance").once("value");
  const attendanceHistorySnap = await db.ref("attendance_history").once("value");
  const footfallSnap = await db.ref("footfall").once("value");

  const centers = centersSnap.val() || {};
  const attendances = attendanceSnap.val() || {};
  const attendanceHistory = attendanceHistorySnap.val() || {};
  const footfalls = footfallSnap.val() || {};
  const alertsCreated = [];

  const todayStr = new Date(now).toISOString().substring(0, 10);
  const prevDays = [];
  for (let i = 1; i <= 3; i++) {
    prevDays.push(new Date(now - i * ONE_DAY_MS).toISOString().substring(0, 10));
  }

  for (const [centerId, center] of Object.entries(centers)) {
    const centerName = center.name || "Unknown Center";
    const blockName = center.block || "Unknown Block";
    const localAttendance = attendances[centerId];

    if (!localAttendance || !localAttendance.doctors) continue;

    const doctors = Object.values(localAttendance.doctors);
    const total = doctors.length;
    const present = doctors.filter(d => d.status === "PRESENT").length;
    const pct = total > 0 ? present / total : 1.0;

    let alertType = null;
    let detailText = "";
    let deadlineStr = "";

    // 1. Critical emergency (0 doctors and footfall > 50 today)
    const todayFootfall = (footfalls[centerId] && footfalls[centerId][todayStr]) ? footfalls[centerId][todayStr].total : 0;
    
    if (present === 0 && todayFootfall > 50) {
      alertType = "RED";
      detailText = `Critical: 0 doctors present for ${todayFootfall} patients.`;
      deadlineStr = "Immediate BMO deployment";
    } 
    // 2. Chronic absenteeism (understaffed < 50% for 3+ consecutive days)
    else {
      let isChronic = pct < 0.50;
      if (isChronic) {
        for (const dStr of prevDays) {
          const hist = attendanceHistory[centerId] ? attendanceHistory[centerId][dStr] : null;
          if (!hist || (hist.presentCount / hist.totalCount) >= 0.50) {
            isChronic = false;
            break;
          }
        }
      }

      if (isChronic) {
        alertType = "CHRONIC";
        const absentDoc = doctors.find(d => d.status === "ABSENT");
        const docName = absentDoc ? absentDoc.name : "MO";
        const absentCount = absentDoc ? (absentDoc.absentDaysOfLast10 || 3) : 3;
        detailText = `Dr. ${docName} absent ${absentCount}/10 days. Avg footfall: 73/day.`;
        deadlineStr = "CMO intervention + deployment";
      } 
      // 3. Simple understaffed (< 50% doctors present today)
      else if (pct < 0.50) {
        alertType = "YELLOW";
        detailText = "Status: UNDERSTAFFED - below safety threshold.";
        deadlineStr = "Within 4 hours";
      }
    }

    if (alertType) {
      const alertText = generateAttendanceAlertCard(
        alertType === "CHRONIC" ? "CHRONIC" : alertType,
        centerName,
        blockName,
        present,
        total,
        detailText,
        deadlineStr
      );

      const alertId = `AT-${alertType}-${centerId}-${now}`;
      const alertPayload = {
        centerId,
        type: alertType === "RED" ? "ATTENDANCE_CRITICAL" : "ATTENDANCE_WARNING",
        timestamp: now,
        status: "ACTIVE",
        formattedText: alertText
      };

      await db.ref(`alerts/${alertId}`).set(alertPayload);
      alertsCreated.push(alertPayload);

      if (center.adminPhone) {
        console.log(`[SMS OUTBOUND] To: ${center.adminPhone}\n${alertText}`);
      }
    }
  }

  return alertsCreated;
}

/**
 * Helper to construct the diagnostic kits alert card.
 */
function generateTestAlertCard(type, centerName, blockName, testName, count, detailText, deadlineStr) {
  const width = 43;
  const borderTop = `┌${"─".repeat(width + 2)}┐`;
  const borderBottom = `└${"─".repeat(width + 2)}┘`;

  const lines = [borderTop];

  if (type === "RED") {
    lines.push(formatLine("🔴 DIAGNOSTIC BLOCKED: ESSENTIAL GAPS", width));
  } else if (type === "YELLOW") {
    lines.push(formatLine("🟡 DIAGNOSTIC WARNING: KIT SHORTAGE", width));
  } else if (type === "MOBILE") {
    lines.push(formatLine("🟡 MOBILE DIAGNOSTIC DEPLOYMENT REC", width));
  }

  lines.push(formatLine(`Center: ${centerName} | Block: ${blockName}`, width));

  if (type === "RED") {
    lines.push(formatLine("Status: Unable to run essential test(s)", width));
    lines.push(formatLine(`Blocked Test: ${testName}`, width));
  } else if (type === "YELLOW") {
    lines.push(formatLine(`Test: ${testName} | Kit Count: ${count} units`, width));
    lines.push(formatLine(`Status: ${detailText}`, width));
  } else {
    lines.push(formatLine("Status: 3+ basic tests unavailable for 5+ days", width));
    lines.push(formatLine(`Action: Deploy Mobile Diagnostic Unit`, width));
  }

  lines.push(formatLine(`Deadline: ${deadlineStr}`, width));
  lines.push(borderBottom);

  return lines.join("\n");
}

/**
 * Module 5: Diagnostic Test Availability
 */
async function analyzeDiagnosticKitsAndAlert(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const centersSnap = await db.ref("centers").once("value");
  const testsSnap = await db.ref("tests").once("value");

  const centers = centersSnap.val() || {};
  const allTests = testsSnap.val() || {};
  const alertsCreated = [];

  for (const [centerId, center] of Object.entries(centers)) {
    const centerName = center.name || "Unknown Center";
    const blockName = center.block || "Unknown Block";
    const centerTests = allTests[centerId] || {};

    let unavailableEssentialTests = [];
    let basicTestsShortCount = 0;

    for (const [testId, test] of Object.entries(centerTests)) {
      const kitCount = test.kitCount || 0;
      const expiry = test.expiryTimestamp || 0;
      const isExpired = expiry > 0 && expiry < now;
      const isShort = kitCount < 10 || isExpired;

      if (isShort && test.isEssential) {
        unavailableEssentialTests.push(test.name);
      }

      if (isShort) {
        basicTestsShortCount++;
        
        // Trigger Yellow alert for individual kit shortage
        const deadline = new Date(now + 3 * ONE_DAY_MS);
        const deadlineStr = deadline.toISOString().replace("T", " ").substring(0, 16);
        const detail = isExpired ? "Kits expired" : "Kits low count < 10";

        const alertText = generateTestAlertCard("YELLOW", centerName, blockName, test.name, kitCount, detail, deadlineStr);
        const alertId = `TS-LOW-${centerId}-${testId}-${now}`;
        const alertPayload = {
          centerId,
          type: "TEST_KITS_LOW",
          timestamp: now,
          status: "ACTIVE",
          formattedText: alertText
        };
        await db.ref(`alerts/${alertId}`).set(alertPayload);
        alertsCreated.push(alertPayload);
      }
    }

    // 1. Auto-flag centers unable to perform any of the essential tests (RED alert)
    if (unavailableEssentialTests.length > 0) {
      const alertText = generateTestAlertCard(
        "RED",
        centerName,
        blockName,
        unavailableEssentialTests.join(", "),
        0,
        "",
        "Immediate kit dispatch"
      );
      const alertId = `TS-RED-${centerId}-${now}`;
      const alertPayload = {
        centerId,
        type: "ESSENTIAL_TESTS_BLOCKED",
        timestamp: now,
        status: "ACTIVE",
        formattedText: alertText
      };
      await db.ref(`alerts/${alertId}`).set(alertPayload);
      alertsCreated.push(alertPayload);
    }

    // 2. Recommend mobile diagnostic unit (3+ basic tests unavailable)
    if (basicTestsShortCount >= 3) {
      const alertText = generateTestAlertCard(
        "MOBILE",
        centerName,
        blockName,
        "",
        0,
        "Chennai Diagnostic Mobile Unit 2",
        "Deploy in 24 hours"
      );
      const alertId = `TS-MOBILE-${centerId}-${now}`;
      const alertPayload = {
        centerId,
        type: "TEST_KITS_MOBILE_RECOMMENDED",
        timestamp: now,
        status: "ACTIVE",
        formattedText: alertText
      };
      await db.ref(`alerts/${alertId}`).set(alertPayload);
      alertsCreated.push(alertPayload);
    }
  }

  return alertsCreated;
}

/**
 * Module 6: AI Demand Forecasting
 */
async function generateDemandForecast(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const centersSnap = await db.ref("centers").once("value");
  const stockSnap = await db.ref("stock").once("value");

  const centers = centersSnap.val() || {};
  const stocks = stockSnap.val() || {};
  const forecastsCreated = [];

  for (const [centerId, center] of Object.entries(centers)) {
    const centerStock = stocks[centerId] || {};
    for (const [medId, med] of Object.entries(centerStock)) {
      // Simulate Vertex AI AutoML Tabular endpoint returns
      // July season = monsoon diarrhea season -> +35% demand for ORS
      let pctIncrease = 15; // default 15% increase
      if (medId === "med_ors") {
        pctIncrease = 35; 
      }

      const current = med.currentStock || 0;
      const avgMonthlyDemand = (med.dailyBurnRate || 5) * 30;
      const predictedDemand = Math.round(avgMonthlyDemand * (1 + pctIncrease / 100));
      const shortfallDays = Math.round(current / (med.dailyBurnRate || 5));
      const recommendedProcurement = Math.max(0, predictedDemand - current);

      const deadline = now + shortfallDays * ONE_DAY_MS;

      const forecastPayload = {
        predictedDemand,
        shortfallDays,
        recommendedProcurement,
        deadline
      };

      await db.ref(`forecasts/${centerId}/${medId}`).set(forecastPayload);
      forecastsCreated.push({ centerId, medId, ...forecastPayload });
    }
  }

  return forecastsCreated;
}

/**
 * Module 7: Resource Redistribution
 */
async function runResourceRedistribution(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();

  const centersSnap = await db.ref("centers").once("value");
  const stockSnap = await db.ref("stock").once("value");

  const centers = centersSnap.val() || {};
  const stocks = stockSnap.val() || {};
  const ordersCreated = [];

  const surplusPool = {}; // medId -> [{ centerId, name, qty }]
  const deficitPool = {};  // medId -> [{ centerId, name, qty, daysToStockOut }]

  // 1. Sort into surplus (> 30% above buffer) and deficit (< 20% buffer) pools
  for (const [cId, centerStock] of Object.entries(stocks)) {
    if (!centerStock) continue;
    for (const [mId, med] of Object.entries(centerStock)) {
      const buffer = med.bufferStock || 100;
      const current = med.currentStock || 0;
      const burnRate = med.dailyBurnRate || 5;

      if (current > 1.3 * buffer) {
        if (!surplusPool[mId]) surplusPool[mId] = [];
        surplusPool[mId].push({
          centerId: cId,
          centerName: centers[cId] ? centers[cId].name : `PHC ${cId}`,
          qty: current - buffer
        });
      } else if (current < 0.2 * buffer) {
        if (!deficitPool[mId]) deficitPool[mId] = [];
        deficitPool[mId].push({
          centerId: cId,
          centerName: centers[cId] ? centers[cId].name : `PHC ${cId}`,
          qty: buffer - current,
          daysToStockOut: current / burnRate
        });
      }
    }
  }

  // 2. Pair surplus and deficit, prioritizing receiving centers with soonest stockout
  for (const [medId, deficits] of Object.entries(deficitPool)) {
    const surpluses = surplusPool[medId] || [];
    if (surpluses.length === 0) continue;

    // Sort deficits by days to stockout (ascending)
    deficits.sort((a, b) => a.daysToStockOut - b.daysToStockOut);
    // Sort surpluses by qty (descending)
    surpluses.sort((a, b) => b.qty - a.qty);

    for (const def of deficits) {
      if (surpluses.length === 0) break;
      const bestSurplus = surpluses[0];

      const transferQty = Math.min(def.qty, bestSurplus.qty);
      if (transferQty <= 0) continue;

      bestSurplus.qty -= transferQty;
      if (bestSurplus.qty <= 0) {
        surpluses.shift(); // remove empty surplus
      }

      const orderId = `TRF-${Math.floor(100 + Math.random() * 900)}`;
      const orderPayload = {
        id: orderId,
        date: new Date(now).toISOString().substring(0, 10),
        fromCenterId: bestSurplus.centerId,
        fromCenterName: bestSurplus.centerName,
        toCenterId: def.centerId,
        toCenterName: def.centerName,
        medicineId: medId,
        medicineName: stocks[def.centerId][medId].name,
        qty: transferQty,
        distance: 8.2, // mock driving distance
        time: 22,      // mock driving time
        status: "PENDING"
      };

      await db.ref(`transfer_orders/${orderId}`).set(orderPayload);
      ordersCreated.push(orderPayload);
    }
  }

  return ordersCreated;
}

/**
 * Module 8: Center Health Score
 */
async function computeWeeklyHealthScores(db, executionTimeMs) {
  const now = executionTimeMs || Date.now();
  const dateStr = new Date(now).toISOString().substring(0, 10);

  const centersSnap = await db.ref("centers").once("value");
  const stockSnap = await db.ref("stock").once("value");
  const attendanceSnap = await db.ref("attendance").once("value");
  const testsSnap = await db.ref("tests").once("value");
  const bedsSnap = await db.ref("beds").once("value");

  const centers = centersSnap.val() || {};
  const stocks = stockSnap.val() || {};
  const attendances = attendanceSnap.val() || {};
  const allTests = testsSnap.val() || {};
  const beds = bedsSnap.val() || {};
  const scoresCalculated = [];

  for (const [cId, center] of Object.entries(centers)) {
    // 1. Stock Health Score
    const cStock = stocks[cId] || {};
    let stockScoreSum = 0;
    let stockItemsCount = 0;
    for (const med of Object.values(cStock)) {
      const buffer = med.bufferStock || 100;
      const current = med.currentStock || 0;
      const ratio = current / buffer;
      let score = 100;
      if (ratio < 0.1) score = 20;
      else if (ratio < 0.2) score = 50;
      else if (ratio < 1.0) score = 85;

      stockScoreSum += score;
      stockItemsCount++;
    }
    const stockScore = stockItemsCount > 0 ? Math.round(stockScoreSum / stockItemsCount) : 80;

    // 2. Attendance Score
    const cAttendance = attendances[cId];
    let attendanceScore = 100;
    if (cAttendance && cAttendance.doctors) {
      const doctors = Object.values(cAttendance.doctors);
      const total = doctors.length;
      const present = doctors.filter(d => d.status === "PRESENT").length;
      attendanceScore = total > 0 ? Math.round((present / total) * 100) : 100;
    }

    // 3. Test Availability Score
    const cTests = allTests[cId] || {};
    let essentialPresent = 0;
    let essentialTotal = 0;
    for (const test of Object.values(cTests)) {
      if (test.isEssential) {
        essentialTotal++;
        if (test.kitCount > 0) {
          essentialPresent++;
        }
      }
    }
    const testScore = essentialTotal > 0 ? Math.round((essentialPresent / essentialTotal) * 100) : 80;

    // 4. Bed Score
    const cBed = beds[cId];
    let bedScore = 100;
    if (cBed) {
      const rate = cBed.capacity > 0 ? cBed.occupied / cBed.capacity : 0;
      if (rate >= 1.0) bedScore = 40; // overflow penalty
      else if (rate >= 0.85) bedScore = 75;
      else if (rate < 0.30) bedScore = 60; // underutilization penalty
    }

    // 5. Footfall Management Score
    const footfallScore = 85; // baseline

    // Overall Health Score = Stock 30% + Attendance 25% + Test 20% + Bed 15% + Footfall 10%
    const overall = Math.round(
      stockScore * 0.30 +
      attendanceScore * 0.25 +
      testScore * 0.20 +
      bedScore * 0.15 +
      footfallScore * 0.10
    );

    const scorePayload = {
      stock: stockScore,
      attendance: attendanceScore,
      test: testScore,
      bed: bedScore,
      footfall: footfallScore,
      overall
    };

    // Save to history and update center
    await db.ref(`health_history/${cId}/${dateStr}`).set(scorePayload);
    await db.ref(`centers/${cId}/healthScores`).set(scorePayload);
    scoresCalculated.push({ centerId: cId, dateStr, ...scorePayload });
  }

  return scoresCalculated;
}

exports.analyzeAttendanceAndAlert = analyzeAttendanceAndAlert;
exports.analyzeDiagnosticKitsAndAlert = analyzeDiagnosticKitsAndAlert;
exports.generateDemandForecast = generateDemandForecast;
exports.runResourceRedistribution = runResourceRedistribution;
exports.computeWeeklyHealthScores = computeWeeklyHealthScores;

// Scheduled Crons

exports.dailyAttendanceCheck = functions.pubsub
  .schedule("0 18 * * *") // 6:00 PM daily check
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    const db = admin.database();
    const alerts = await analyzeAttendanceAndAlert(db);
    console.log(`Attendance Check completed. Alerts generated: ${alerts.length}`);
    return null;
  });

exports.dailyTestsCheck = functions.pubsub
  .schedule("0 8 * * *") // 8:00 AM daily check
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    const db = admin.database();
    const alerts = await analyzeDiagnosticKitsAndAlert(db);
    console.log(`Diagnostic Kits check completed. Alerts generated: ${alerts.length}`);
    return null;
  });

exports.weeklyForecastCheck = functions.pubsub
  .schedule("0 7 * * 0") // 7:00 AM Sunday forecast check
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    const db = admin.database();
    const forecasts = await generateDemandForecast(db);
    console.log(`AI Demand Forecasting completed. Snapshots: ${forecasts.length}`);
    return null;
  });

exports.weeklyHealthCheck = functions.pubsub
  .schedule("0 0 * * 0") // Midnight Sunday health checks
  .timeZone("Asia/Kolkata")
  .onRun(async (context) => {
    const db = admin.database();
    const scores = await computeWeeklyHealthScores(db);
    console.log(`Weekly Health Score evaluations computed. Snapshots: ${scores.length}`);
    return null;
  });



