# SmartHealth AI

SmartHealth AI is a modern, role-aware operations platform for managing Community Health Centers (CHCs) and Primary Health Centers (PHCs). It helps district officers, center administrators, and field workers monitor stock health, patient load, staffing, diagnostics, and redistribution needs in near real time.

The platform combines a polished React-based dashboard, simulation-driven operational logic, and a lightweight backend API to make healthcare supply-chain decisions more visible, proactive, and actionable.

## 🚀 Live Demo

- Deployed application: https://smarthealth-750882492814.us-central1.run.app

## 🌐 Project Overview

SmartHealth AI is designed for public health operations teams that need to:

- track center-level service performance and resource availability,
- detect stock shortages and staffing issues quickly,
- simulate incidents such as outbreaks, stock drain, or staff emergencies,
- approve or reject medicine redistribution between centers,
- forecast demand using simple, explainable logic.

It is built as a full-stack web application with:

- a React + Vite frontend,
- an Express-based backend service,
- Firebase Realtime Database integration,
- Docker and Cloud Run deployment support.

---

## 🏗️ System Architecture & Data Flow

The application follows a simple reactive architecture:

1. User actions and role-based views are handled in the React frontend.
2. Global state is managed through the health context layer.
3. Simulation logic updates center metrics such as stock, occupancy, staffing, diagnostics, and footfall.
4. Alert evaluation and demand forecasting are computed from the current state.
5. Transfer orders and redistribution rules can be approved or triggered by district-level workflows.
6. Backend endpoints expose health checks, seeding, and analytical jobs for operational automation.

### High-Level Flow

- Frontend UI → Health Context → Simulation Engine → Alert/Forecast Evaluation
- Backend API → Firebase Database → Seed/Job Execution → Operational Insights

### Technical Architecture Diagram

![alt text](<React Frontend Role-based-2026-06-27-102412.png>)

---

## 🩺 Chosen Vertical: Primary Health Center Operations & Supply Chain

This platform focuses on the operational challenges of rural and semi-urban healthcare networks, especially where centers must manage:

1. Medicine stock availability and buffer thresholds
2. Bed occupancy and patient throughput
3. Doctor attendance and staffing continuity
4. Diagnostic kit availability and expiry risk
5. Inter-center resource redistribution and transfer approvals

By combining these signals in a single decision surface, the system helps teams act before a small issue becomes a service disruption.

---

## ✨ Core Features

### 📊 Role-Based Dashboards

- District Officer view for regional monitoring, rankings, alerts, and transfer approvals
- Center Admin view for local operations, stock levels, beds, doctors, and diagnostics
- Field Worker view for direct operational updates and simple center-side actions

### 🔄 Live Simulation Engine

- Real-time simulation of center behavior over time
- Incident triggers such as outbreak surges, stock drain, staff emergencies, and lab kit expiry
- Dynamic updates to stock, attendance, bed occupancy, and demand forecasts

### 🚨 Intelligent Alerting

- Red, yellow, and data-gap alerts based on stock, attendance, bed pressure, and testing availability
- Rule-based evaluation for operational risk detection

### 📦 Transfer & Redistribution Workflows

- Create, approve, reject, and track transfer orders between centers
- Support automated redistribution suggestions for critical stock gaps

### 📈 Forecasting & Analytics

- Demand forecasts based on current center trends and simulation history
- Simple explainable logic for operational planning

### 🧪 Backend Automation Jobs

- Stock check jobs
- Attendance check jobs
- Diagnostic kit check jobs
- Bed capacity checks
- Demand forecasting jobs

---

## 🧠 Approach & Operational Methodology

The platform uses a lightweight, explainable set of operational rules rather than a black-box model.

### A. Stock Health

Center stock is evaluated against a buffer target and burn rate. Low stock ratios trigger alerts and can drive transfer recommendations.

### B. Attendance & Staffing

Doctor availability is updated through simulation and manual changes, then reflected in center health scores.

### C. Bed & Patient Load

Bed occupancy is dynamically adjusted and used as a key indicator of service pressure.

### D. Diagnostics & Labs

Essential test kits are monitored for count and expiry risk, helping identify potential testing disruptions.

### E. Forecasting

Demand forecasts are generated from current operational states to inform planning and redistribution.

---

## 📝 Key Assumptions

1. The system uses seeded sample center data for demonstration and prototyping.
2. Simulation behavior is intentionally lightweight and deterministic enough for operational visualization.
3. Alert thresholds and forecasting rules are designed for explainability and fast iteration.
4. The platform assumes a connected backend or local Firebase-compatible environment for persistent data flows.

---

## 🛠️ Tech Stack

- React 18
- Vite
- Express.js
- Firebase Admin SDK
- Docker
- Cloud Run compatibility

---

## 🚀 How to Run Locally

### Prerequisites

- Node.js 20+
- npm

### Install dependencies

```bash
npm install
```

### Start the development frontend

```bash
npm run dev
```

### Start the backend/server

```bash
npm start
```

The backend serves the built application and exposes API routes on the configured port, typically:

- http://localhost:8080

### Build for production

```bash
npm run build
```

---

## 🧪 Run Verification / Validation

You can verify the frontend build with:

```bash
npm run build
```

The project also includes backend endpoints for:

- health checks,
- database seeding,
- stock analysis jobs,
- attendance analysis jobs,
- diagnostic kit analysis jobs,
- bed capacity checks,
- demand forecasting jobs.

---

## 🐳 Docker Deployment

A Dockerfile is included for containerized deployment. Build and run the container with:

```bash
docker build -t smarthealth-ai .
docker run -p 8080:8080 smarthealth-ai
```

This makes the project suitable for platforms such as Google Cloud Run.

---

## 📁 Project Structure

```text
src/
  components/
  context/
  data/
  utils/
  views/
functions/
  index.js
server.js
Dockerfile
vite.config.js
```

---

## 📌 Summary

SmartHealth AI brings together healthcare operations, supply-chain visibility, simulation, and planning in one polished interface. It is a strong foundation for decision support in CHC/PHC networks, especially where teams need fast, transparent insight into operational risk.
