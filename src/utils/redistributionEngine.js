/**
 * @file redistributionEngine.js
 * @description Pure function that analyses surplus/deficit medicine pools across
 * all centres and generates PENDING transfer orders to rebalance supply.
 * Stateless — safe to call on every simulation tick.
 */

// ─── Thresholds ────────────────────────────────────────────────────────────────
const SURPLUS_RATIO   = 1.3; // currentStock > 130% of buffer → surplus centre
const DEFICIT_RATIO   = 0.2; // currentStock < 20% of buffer  → deficit centre
const MIN_TRANSFER_QTY = 10; // transfers of ≤10 units are ignored as noise

/**
 * Generates new PENDING transfer orders to rebalance medicine stock.
 * Existing PENDING orders for the same route+medicine are not duplicated.
 *
 * @param {Record<string, object>} currentCenters - Current centres state
 * @param {object[]}               currentOrders  - Existing transfer orders array
 * @returns {object[]} Updated transfer orders array (original + any new orders)
 */
export function runAutoRedistribution(currentCenters, currentOrders) {
  let updatedOrders = [...currentOrders];

  // ── Build surplus and deficit pools per medicine ─────────────────────────
  const surplusPool = {}; // medId → [{ centerId, centerName, qty }]
  const deficitPool = {}; // medId → [{ centerId, centerName, qty, daysToStockOut }]

  Object.values(currentCenters).forEach(c => {
    Object.entries(c.stocks).forEach(([medId, med]) => {
      const { bufferStock: buffer, currentStock: current, dailyBurnRate: burnRate = 5 } = med;

      if (current > SURPLUS_RATIO * buffer) {
        (surplusPool[medId] ??= []).push({
          centerId:   c.id,
          centerName: c.name,
          qty:        current - buffer,
        });
      } else if (current < DEFICIT_RATIO * buffer) {
        (deficitPool[medId] ??= []).push({
          centerId:      c.id,
          centerName:    c.name,
          qty:           buffer - current,
          daysToStockOut: current / burnRate,
        });
      }
    });
  });

  // ── Pair deficits with the largest available surplus ────────────────────
  Object.keys(deficitPool).forEach(medId => {
    const deficits  = deficitPool[medId];
    const surpluses = surplusPool[medId] || [];
    if (surpluses.length === 0) return;

    // Prioritise most urgent deficits first
    deficits.sort((a, b) => a.daysToStockOut - b.daysToStockOut);
    // Use the centre with the most surplus first
    surpluses.sort((a, b) => b.qty - a.qty);

    deficits.forEach(def => {
      if (surpluses.length === 0) return;
      const bestSurplus = surpluses[0];

      const transferQty = Math.min(def.qty, bestSurplus.qty);
      if (transferQty <= MIN_TRANSFER_QTY) return;

      // Avoid creating a duplicate pending order for the same route + medicine
      const alreadyPending = updatedOrders.some(
        o =>
          o.status === 'PENDING' &&
          o.fromCenterId === bestSurplus.centerId &&
          o.toCenterId   === def.centerId &&
          o.medicineId   === medId
      );

      if (!alreadyPending) {
        const orderId = `${Math.floor(100 + Math.random() * 900)}`;
        updatedOrders.push({
          id:             orderId,
          date:           new Date().toISOString().substring(0, 10),
          fromCenterId:   bestSurplus.centerId,
          fromCenterName: bestSurplus.centerName,
          toCenterId:     def.centerId,
          toCenterName:   def.centerName,
          medicineId:     medId,
          medicineName:   currentCenters[def.centerId].stocks[medId].name,
          qty:            Math.round(transferQty),
          distance:       parseFloat((5 + Math.random() * 8).toFixed(1)),
          time:           Math.round(10 + Math.random() * 20),
          status:         'PENDING',
          remainingTicks: 3,
        });

        bestSurplus.qty -= transferQty;
        if (bestSurplus.qty <= 0) {
          surpluses.shift();
        }
      }
    });
  });

  return updatedOrders;
}
