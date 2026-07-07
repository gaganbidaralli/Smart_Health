/**
 * @file initialTransferOrders.js
 * @description Seed transfer orders present at application boot.
 * Order shape: { id, date, fromCenterId, fromCenterName, toCenterId,
 *                toCenterName, medicineId, medicineName, qty, distance,
 *                time, status, remainingTicks? }
 * Statuses: 'PENDING' | 'SHIPPED' | 'DELIVERED' | 'REJECTED'
 */

/** @type {import('../context/HealthContext').TransferOrder[]} */
export const INITIAL_TRANSFER_ORDERS = [
  {
    id: '101',
    date: '2026-06-25',
    fromCenterId: 'center_2',
    fromCenterName: 'CHC Bandra (Mumbai)',
    toCenterId: 'center_3',
    toCenterName: 'PHC Indiranagar (Bengaluru)',
    medicineId: 'med_paracetamol',
    medicineName: 'Paracetamol 500mg',
    qty: 120,
    distance: 980.5,
    time: 1400,
    status: 'PENDING',
  },
  {
    id: '102',
    date: '2026-06-25',
    fromCenterId: 'center_1',
    fromCenterName: 'PHC Dwarka (Delhi)',
    toCenterId: 'center_5',
    toCenterName: 'PHC Hazratganj (Lucknow)',
    medicineId: 'med_ors',
    medicineName: 'ORS Packets',
    qty: 300,
    distance: 530.2,
    time: 720,
    status: 'PENDING',
  },
  {
    id: '103',
    date: '2026-06-25',
    fromCenterId: 'center_4',
    fromCenterName: 'CHC Salt Lake (Kolkata)',
    toCenterId: 'center_3',
    toCenterName: 'PHC Indiranagar (Bengaluru)',
    medicineId: 'med_amoxicillin',
    medicineName: 'Amoxicillin 250mg',
    qty: 150,
    distance: 1870.0,
    time: 2100,
    status: 'SHIPPED',
    remainingTicks: 2,
  },
  {
    id: '104',
    date: '2026-06-26',
    fromCenterId: 'center_2',
    fromCenterName: 'CHC Bandra (Mumbai)',
    toCenterId: 'center_5',
    toCenterName: 'PHC Hazratganj (Lucknow)',
    medicineId: 'med_zinc',
    medicineName: 'Zinc Tablets 20mg',
    qty: 200,
    distance: 1350.0,
    time: 1600,
    status: 'DELIVERED',
    remainingTicks: 0,
  },
];
