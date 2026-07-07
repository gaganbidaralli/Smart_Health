/**
 * @file initialAlerts.js
 * @description Seed alert records displayed when the application first loads.
 * Alert shape: { id, centerId, type, title, desc, action, urgency }
 * Types: 'RED' | 'YELLOW' | 'DATA_GAP' | 'UNDERUTILIZED'
 * Urgency: 4 = critical, 3 = high, 2 = medium, 1 = low
 */

/** @type {import('../context/HealthContext').Alert[]} */
export const INITIAL_ALERTS = [
  {
    id: 'DG-center_2',
    centerId: 'center_2',
    type: 'DATA_GAP',
    title: '⚠️ DATA GAP WARNING',
    desc: 'No stock entry received in 24h. Last Sync: 26 hours ago.',
    action: 'Contact CHC Bandra Admin to update stock',
    urgency: 3,
  },
  {
    id: 'ST-RED-center_1-med_paracetamol',
    centerId: 'center_1',
    type: 'RED',
    title: '🔴 STOCK CRITICAL',
    desc: 'Medicine: Paracetamol 500mg | Current: 8 units | Buffer: 150 units (0.5 days left)',
    action: 'Transfer 120 units from CHC Bandra',
    urgency: 4,
  },
  {
    id: 'BD-RED-center_6',
    centerId: 'center_6',
    type: 'RED',
    title: '🔴 BEDS CRITICAL: FULL',
    desc: 'Occupancy: 80% (8/10). Status: REDIRECT PATIENTS.',
    action: 'Redirect to PHC Guindy (6 beds free)',
    urgency: 4,
  },
];
