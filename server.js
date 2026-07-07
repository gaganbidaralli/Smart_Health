import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK using DATABASE_URL env var if available
const defaultProjectId = process.env.GOOGLE_CLOUD_PROJECT || 'elite-emitter-497815-e4';
const databaseURL = process.env.DATABASE_URL || `https://${defaultProjectId}-default-rtdb.firebaseio.com`;
console.log(`Initializing Firebase Admin SDK with Database URL: ${databaseURL}`);

if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      databaseURL: databaseURL
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK. Please make sure Google Application Default Credentials are set or DATABASE_URL is valid.', error);
  }
}

// Import functions index.js (CommonJS module imported into ES Module)
let backendJobs = {};
try {
  // CommonJS require/import interoperability
  backendJobs = await import('./functions/index.js');
  console.log('Backend analytical functions imported successfully.');
} catch (error) {
  console.error('Failed to import backend jobs from functions/index.js', error);
}

// Import initial data for seeding
import { INITIAL_CENTERS } from './src/data/initialCenters.js';
import { INITIAL_ALERTS } from './src/data/initialAlerts.js';
import { INITIAL_TRANSFER_ORDERS } from './src/data/initialTransferOrders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Serve static React files
app.use(express.static(path.join(__dirname, 'dist')));

// Serve standalone html dashboard at a custom route for utility
app.get('/standalone', (req, res) => {
  res.sendFile(path.join(__dirname, 'standalone_dashboard.html'));
});

// API: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    project: defaultProjectId,
    databaseURL: databaseURL
  });
});

// Helper: Format today's date as YYYY-MM-DD
function getTodayDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// API: Seed database with initial data
app.post('/api/seed', async (req, res) => {
  try {
    const db = admin.database();
    const todayStr = getTodayDateStr();
    console.log('Starting database seeding...');

    // 1. Seed centers, stocks, beds, tests, and attendance
    for (const [centerId, center] of Object.entries(INITIAL_CENTERS)) {
      // Core Center info
      await db.ref(`centers/${centerId}`).set({
        name: center.name,
        block: center.block,
        district: center.district,
        adminPhone: center.adminPhone,
        lastSync: Date.now()
      });

      // Beds info
      await db.ref(`beds/${centerId}`).set({
        capacity: center.beds.capacity,
        occupied: center.beds.occupied,
        available: center.beds.available,
        lastUpdated: Date.now()
      });

      // Stocks info
      for (const [medicineId, med] of Object.entries(center.stocks)) {
        await db.ref(`stock/${centerId}/${medicineId}`).set({
          name: med.name,
          currentStock: med.currentStock,
          bufferStock: med.bufferStock,
          dailyBurnRate: med.dailyBurnRate,
          lastUpdated: Date.now()
        });
      }

      // Diagnostic tests info
      for (const [testId, test] of Object.entries(center.tests)) {
        await db.ref(`tests/${centerId}/${testId}`).set({
          name: test.name,
          kitCount: test.kitCount,
          expiryTimestamp: test.expiryTimestamp || (Date.now() + 30 * 24 * 60 * 60 * 1000),
          isEssential: test.isEssential
        });
      }

      // Doctor attendance info
      for (const [doctorId, doc] of Object.entries(center.doctors)) {
        await db.ref(`attendance/${centerId}/doctors/${doctorId}`).set({
          name: doc.name,
          status: doc.status,
          absentDaysOfLast10: doc.absentDaysOfLast10 || 0
        });
      }

      // Footfall info
      await db.ref(`footfall/${centerId}/${todayStr}`).set({
        opdCount: center.footfall.opdCount,
        ipdCount: center.footfall.ipdCount,
        total: center.footfall.total
      });
    }

    // 2. Seed initial alerts
    for (const alert of INITIAL_ALERTS) {
      const alertId = alert.id || `ST-RED-seed-${Date.now()}-${Math.random()}`;
      await db.ref(`alerts/${alertId}`).set({
        centerId: alert.centerId || 'center_1',
        medicineId: alert.medicineId || 'ALL',
        type: alert.type || 'RED',
        timestamp: Date.now(),
        status: 'ACTIVE',
        formattedText: alert.desc || alert.title || 'Seed alert'
      });
    }

    // 3. Seed initial transfer orders
    for (const order of INITIAL_TRANSFER_ORDERS) {
      const orderId = order.id || `TRF-seed-${Date.now()}`;
      await db.ref(`transfer_orders/${orderId}`).set({
        id: orderId,
        date: todayStr,
        fromCenterId: order.fromCenterId,
        fromCenterName: order.fromCenterName,
        toCenterId: order.toCenterId,
        toCenterName: order.toCenterName,
        medicineId: order.medicineId,
        medicineName: order.medicineName,
        qty: order.qty,
        distance: order.distance || 5.0,
        time: order.time || 15,
        status: order.status || 'PENDING'
      });
    }

    res.json({ success: true, message: 'Database successfully seeded with initial data.' });
  } catch (error) {
    console.error('Seeding error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Stock Check
app.post('/api/jobs/stock-check', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.analyzeStockAndGenerateAlerts !== 'function') {
      throw new Error('analyzeStockAndGenerateAlerts function not available');
    }
    const alerts = await backendJobs.analyzeStockAndGenerateAlerts(db);
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Stock Check Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Attendance Check
app.post('/api/jobs/attendance-check', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.analyzeAttendanceAndAlert !== 'function') {
      throw new Error('analyzeAttendanceAndAlert function not available');
    }
    const alerts = await backendJobs.analyzeAttendanceAndAlert(db);
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Attendance Check Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Diagnostic Kits Check
app.post('/api/jobs/tests-check', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.analyzeDiagnosticKitsAndAlert !== 'function') {
      throw new Error('analyzeDiagnosticKitsAndAlert function not available');
    }
    const alerts = await backendJobs.analyzeDiagnosticKitsAndAlert(db);
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Diagnostic Kits Check Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Beds Check
app.post('/api/jobs/beds-check', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.analyzeBedCapacityAndAlert !== 'function') {
      throw new Error('analyzeBedCapacityAndAlert function not available');
    }
    const alerts = await backendJobs.analyzeBedCapacityAndAlert(db);
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Beds Check Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Demand Forecast
app.post('/api/jobs/demand-forecast', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.generateDemandForecast !== 'function') {
      throw new Error('generateDemandForecast function not available');
    }
    const forecasts = await backendJobs.generateDemandForecast(db);
    res.json({ success: true, count: forecasts.length, forecasts });
  } catch (error) {
    console.error('Demand Forecast Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Resource Redistribution
app.post('/api/jobs/resource-redistribution', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.runResourceRedistribution !== 'function') {
      throw new Error('runResourceRedistribution function not available');
    }
    const orders = await backendJobs.runResourceRedistribution(db);
    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('Resource Redistribution Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Weekly Health Score computation
app.post('/api/jobs/weekly-health', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.computeWeeklyHealthScores !== 'function') {
      throw new Error('computeWeeklyHealthScores function not available');
    }
    const scores = await backendJobs.computeWeeklyHealthScores(db);
    res.json({ success: true, count: scores.length, scores });
  } catch (error) {
    console.error('Weekly Health Score Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run Job Outbreak Spike Detection
app.post('/api/jobs/footfall-check', async (req, res) => {
  try {
    const db = admin.database();
    if (typeof backendJobs.analyzeFootfallAndDetectSpikes !== 'function') {
      throw new Error('analyzeFootfallAndDetectSpikes function not available');
    }
    const alerts = await backendJobs.analyzeFootfallAndDetectSpikes(db);
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('Outbreak Spike Detection Job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Run All Jobs
app.post('/api/jobs/run-all', async (req, res) => {
  try {
    const db = admin.database();
    const results = {};
    
    if (typeof backendJobs.analyzeStockAndGenerateAlerts === 'function') {
      results.stockAlerts = await backendJobs.analyzeStockAndGenerateAlerts(db);
    }
    if (typeof backendJobs.analyzeAttendanceAndAlert === 'function') {
      results.attendanceAlerts = await backendJobs.analyzeAttendanceAndAlert(db);
    }
    if (typeof backendJobs.analyzeDiagnosticKitsAndAlert === 'function') {
      results.testAlerts = await backendJobs.analyzeDiagnosticKitsAndAlert(db);
    }
    if (typeof backendJobs.analyzeBedCapacityAndAlert === 'function') {
      results.bedAlerts = await backendJobs.analyzeBedCapacityAndAlert(db);
    }
    if (typeof backendJobs.generateDemandForecast === 'function') {
      results.forecasts = await backendJobs.generateDemandForecast(db);
    }
    if (typeof backendJobs.runResourceRedistribution === 'function') {
      results.redistributions = await backendJobs.runResourceRedistribution(db);
    }
    if (typeof backendJobs.computeWeeklyHealthScores === 'function') {
      results.healthScores = await backendJobs.computeWeeklyHealthScores(db);
    }
    if (typeof backendJobs.analyzeFootfallAndDetectSpikes === 'function') {
      results.outbreakAlerts = await backendJobs.analyzeFootfallAndDetectSpikes(db);
    }
    
    res.json({ success: true, message: 'All analytical jobs executed.', results });
  } catch (error) {
    console.error('Run All Jobs failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Handle React SPA wildcard routes (serve index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmartHealth App Server is running on port ${PORT}`);
});
