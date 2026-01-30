# Job Hub Pro

**Enterprise Utility Construction Job Management Platform**

[![SonarCloud](https://sonarcloud.io/api/project_badges/measure?project=Nexa-Inc25_job-hub-app&metric=alert_status)](https://sonarcloud.io/dashboard?id=Nexa-Inc25_job-hub-app)
[![Security](https://img.shields.io/badge/security-enterprise--grade-green)](./docs/security.md)
[![License](https://img.shields.io/badge/license-Proprietary-blue)](./LICENSE)

Job Hub Pro is a comprehensive job management platform designed for utility construction companies working with major utilities like PG&E. It streamlines the entire job lifecycle from pre-fielding to billing, with AI-powered document processing, offline-first mobile support, and enterprise security features.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Security](#security)
- [Testing](#testing)
- [Contributing](#contributing)

---

## Features

### Core Functionality
- **Job Lifecycle Management** - Track jobs from intake through billing
- **Document Management** - Organize, annotate, and share job documents
- **AI-Powered Extraction** - Automatically extract data from job packages
- **Offline-First Mobile** - Full PWA support with offline photo capture
- **Multi-Tenant** - Support for multiple utility companies and contractors

### Role-Based Workflows
- **General Foreman (GF)** - Pre-fielding, scheduling, document completion
- **Project Manager (PM)** - Review, approval, billing oversight
- **QA Team** - Quality assurance review workflows
- **Admin** - User management, system configuration

### Enterprise Features
- **Two-Factor Authentication (MFA)** - TOTP-based 2FA
- **Full Audit Logging** - Compliance-ready activity tracking
- **Security Hardening** - Rate limiting, input sanitization, bot protection
- **Real-Time Updates** - WebSocket-based live notifications

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  React SPA (PWA)  │  Service Worker  │  IndexedDB (Offline)    │
└────────────┬───────────────────────────────────────┬────────────┘
             │                                       │
             ▼                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  Express.js  │  Socket.IO  │  Rate Limiting  │  Auth/MFA       │
└────────────┬─────────────────────────────────────────┬──────────┘
             │                                         │
             ▼                                         ▼
┌─────────────────────────┐   ┌────────────────────────────────────┐
│      Data Layer         │   │         External Services          │
├─────────────────────────┤   ├────────────────────────────────────┤
│  MongoDB Atlas (M10)    │   │  Cloudflare R2 (Storage)           │
│  - Users                │   │  OpenAI GPT-4 (AI Extraction)      │
│  - Jobs                 │   │  Vercel (Frontend Hosting)         │
│  - Documents            │   │  Railway (Backend Hosting)         │
│  - Audit Logs           │   │                                    │
└─────────────────────────┘   └────────────────────────────────────┘
```

### Directory Structure

```
job-hub-app/
├── backend/
│   ├── controllers/       # Request handlers
│   ├── routes/            # API route definitions
│   ├── services/          # Business logic
│   ├── middleware/        # Auth, security, logging
│   ├── models/            # Mongoose schemas
│   ├── utils/             # Helper functions
│   ├── __tests__/         # Test suites
│   └── server.js          # Application entry
│
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── utils/         # Utilities
│   │   └── App.js         # Root component
│   └── public/            # Static assets
│
├── docker-compose.yml     # Container orchestration
└── README.md              # This file
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 | UI framework |
| | Material-UI 5 | Component library |
| | react-pdf | PDF viewing/editing |
| | Workbox | Service worker/PWA |
| **Backend** | Node.js 20 | Runtime |
| | Express.js 4 | Web framework |
| | Socket.IO | Real-time updates |
| | Mongoose 8 | MongoDB ODM |
| **Database** | MongoDB Atlas | Primary database |
| **Storage** | Cloudflare R2 | File storage |
| **AI** | OpenAI GPT-4 | Document extraction |
| **Auth** | JWT + TOTP | Authentication |
| **Hosting** | Vercel + Railway | Deployment |

---

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/Nexa-Inc25/job-hub-app.git
cd job-hub-app

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Environment Setup

Create `backend/.env`:

```env
# Database
MONGO_URI=mongodb+srv://...

# Authentication
JWT_SECRET=your-secure-secret-key

# Storage (Cloudflare R2)
R2_ACCESS_KEY_ID=your-r2-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET=your-bucket
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://your-public-url

# AI (Optional)
OPENAI_API_KEY=sk-...

# Frontend
FRONTEND_URL=http://localhost:3000
```

Create `frontend/.env`:

```env
REACT_APP_API_URL=http://localhost:5000
```

### Running Locally

```bash
# Terminal 1: Backend
cd backend
npm start

# Terminal 2: Frontend
cd frontend
npm start
```

Visit `http://localhost:3000`

---

## Deployment

### Docker

```bash
# Build and run all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Current Production Setup

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | https://job-hub-app.vercel.app |
| Backend | Railway | https://jobhubpro.com/api |
| Database | MongoDB Atlas | M10 Cluster |
| Storage | Cloudflare R2 | - |

---

## API Documentation

API documentation is available via Swagger UI at `/api/docs` when running locally.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | User authentication |
| POST | `/api/signup` | User registration |
| GET | `/api/jobs` | List jobs |
| POST | `/api/jobs` | Create job |
| GET | `/api/jobs/:id` | Get job details |
| POST | `/api/jobs/:id/files` | Upload files |
| GET | `/api/admin/users` | List users (admin) |

---

## Security

Job Hub Pro implements enterprise-grade security:

### Authentication & Authorization
- JWT-based authentication with 24-hour expiry
- TOTP-based two-factor authentication (MFA)
- Role-based access control (RBAC)
- Account lockout after failed attempts

### API Security
- Rate limiting (10/15min for auth, 200/min for API)
- MongoDB query sanitization (NoSQL injection prevention)
- Input validation and sanitization
- Security headers (Helmet.js)
- Bot/scanner detection and blocking

### Audit & Compliance
- Full audit logging of all actions
- Document access tracking
- Security event monitoring
- TTL-based log retention

See [Security Documentation](./docs/security.md) for details.

---

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Coverage
npm test -- --coverage --watchAll=false
```

### E2E Tests (Cypress)

```bash
cd frontend
npm run cypress:open
```

---

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and add tests
3. Run tests: `npm test`
4. Commit with conventional commits: `git commit -m "feat: add feature"`
5. Push and create PR

### Code Quality

- ESLint for linting
- Prettier for formatting
- SonarCloud for static analysis
- Jest for testing

---

## License

Copyright 2024-2026 Nexa Inc. All rights reserved.

This software is proprietary and confidential.

---

## Support

For support, contact: support@jobhubpro.com

