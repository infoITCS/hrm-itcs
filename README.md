# HRM System - ITCS

A modern, enterprise-grade Human Resource Management (HRM) system built with **React 19**, **TypeScript**, **Node.js**, **Express**, and **MongoDB** (Cosmos DB / Atlas). Designed for end-to-end workforce operations: employee lifecycle, real-time biometric attendance, multi-tier leave tracking, expense claims, and automated payroll processing.

---

## 🚀 Key Modules & System Features

### 1. 👥 Personal Information Management (PIM)
* **Employee Directory**: Searchable, filterable employee database with customizable pagination, column selection, and quick actions.
* **Multi-Step Onboarding Wizard**: Guided multi-step employee creation capturing:
  * Personal, Contact, and Nationality details
  * Job Information, Designation, Department, Work Location, and Reporting Manager hierarchy
  * Employment Status (Permanent, Probation, Contract, Intern) with probation period tracking
  * Compensation, Bank Details, and Salary Revision History
  * Emergency Contacts, Dependents, Education, and Work History
  * Document and Attachment uploads
* **Comprehensive Employee Profile**: Tabbed view displaying all employee data, linked user accounts, salary revision history, and audit logs.
* **Automated Probation Tracking**: Scheduled background cron upgrades eligible employees from Probation to Permanent.

### 2. 🕒 Attendance & Biometric Integration (V2)
* **ZKTeco Hardware Integration**: Real-time push protocol (`/iclock/cdata` ADMS) connecting biometric devices directly to the server.
* **Multi-Shift Engine**: Priority-based shift configuration (Employee-assigned shift ➔ Location configuration ➔ System defaults) supporting grace minutes, flexible start/end hours, and automated lunch deductions (>5 hrs).
* **Attendance Statuses**:
  * `Present` / `Present (WFH)` (WFH excludes meal allowance)
  * `Late` (arrival after grace period)
  * `Half-Day` (Half-Day Absent: 0.5 salary cut penalty)
  * `Half-Day Leave` (0.5 leave balance deduction, paid)
  * `Early Leave` (>10 min checkout prior to shift end)
  * `On Leave` (synced automatically from approved leaves)
  * `Holiday` (location-specific or organization-wide paid holidays)
  * `Weekend` (off-day tracking)
  * `Absent` (unauthorized absence: full day penalty)
  * `Incomplete` (checked in without valid checkout)
* **Smart Daily Roster & Live Feed**: Live dashboard showing real-time punches, location-aware PIN resolution, and first-in/last-out timestamps.
* **Monthly Insights & Corrections**: Monthly calendar attendance grid, manual attendance adjustment modal with audit history, and daily/monthly CSV/Excel report exports.
* **Auto-Close Job**: Automatic shift-end clock-out for forgotten punches with customizable threshold alerts.

### 3. 🏖️ Leave Management
* **Dynamic Leave Types**: Configurable categories (Annual, Sick, Casual, Unpaid, etc.) with customizable annual allowances, paid/unpaid status, and sandwich rule toggles.
* **Atomic Multi-Year Balances**: Safe leave application engine spanning calendar years with atomic pending balance reservations to prevent concurrency race conditions.
* **Configurable Sandwich Rule**: Automatically detects and counts weekends sandwiched between requested weekday leaves when enabled for a leave type.
* **Multi-Tier Approval Workflow**: Line manager / Admin review workflow with status progression (`Pending` ➔ `Approved` / `Rejected`), email notifications, and administrative override capabilities.
* **Attendance Synchronization**: Approved leaves automatically convert corresponding daily attendance records to `"On Leave"` or `"Half-Day Leave"`.
* **Company Balance Ledger**: Centralized dashboard to view yearly leave balances, month-by-month usage, and manual balance adjustment tools.

### 4. 💳 Expense Claims
* **Category-Based Workflows**: Custom approval routing depending on expense category:
  * *Medical*: Skips manager ➔ HR ➔ Finance (strictly requires receipt, annual limit checked)
  * *Training & Certification*: Employee ➔ Team Lead ➔ HR ➔ Finance
  * *Travel, Sales, Other*: Employee ➔ Line Manager ➔ HR ➔ Finance
* **Policy Limits & Detection**: Automatic detection of out-of-policy requests, annual category caps (e.g. Medical limit), and missing receipts.
* **Document & Receipt Attachments**: Secure file upload, storage, and preview for invoices and receipts.
* **Payroll Integration**: Approved claims are automatically marked and pulled into the employee's next monthly payroll run as non-taxable variable earnings.

### 5. 💰 Payroll Management
* **Automated Monthly Payroll Runs**: Single-click generation of draft payslips across all active employees for any pay period.
* **Earnings Resolution**:
  * Fixed basic and categorized allowances (Medical, Conveyance, House Rent, etc.)
  * Daily Meal Allowance (auto-computed from present days in office, excluding WFH/Leaves)
  * Work Anniversary bonus detection
  * Retroactive Salary Arrears (automated back-pay calculation for backdated salary revisions)
  * Reimbursable Expense Claims and approved Provident Fund payouts
* **Deductions & Penalties**:
  * Attendance penalties: Half-Day and Absence deductions computed against daily basic salary rates
  * First Penalty Exemption: First late/half-day event in the payroll cycle is automatically exempted per HR policy
  * Employee Loan repayments with support for approved HR loan pauses
  * Provident Fund (PF): 15% employer/employee contributions including arrears adjustments
* **Banking & Exports**:
  * Automated sequential payslip numbering (`PS-YYYY-MM-XXXX`)
  * Meezan Bank format and standard bank batch payment file generation
  * Payslip detail view and downloadable PDF payslips

### 6. 🔐 Security, Authentication & RBAC
* **Authentication**: JWT authentication with refresh flows and Passport.js integration (Google OAuth / Microsoft SSO / Local credentials).
* **Role-Based Access Control (RBAC)**: Fine-grained permissions across roles:
  * `super-admin`, `admin`, `manager`, `hr`, `finance`, `employee`
* **Module Permissions**: Dynamic database-driven module access controls (`RolePermission`) to grant or restrict access to entire modules.
* **Audit Trails**: Detailed audit logging tracking user actions, target IDs, IP addresses, and state changes.

---

## 🛠️ Tech Stack

### Frontend
| Technology | Description |
| :--- | :--- |
| **React 19** | Modern UI rendering library |
| **TypeScript** | Type-safe application codebase |
| **Vite** | Fast frontend build tool and dev server |
| **Tailwind CSS v4** | Modern utility-first styling engine |
| **React Router DOM v7**| Client-side declarative routing |
| **Lucide React** | Feather-inspired clean icons |
| **Framer Motion** | Fluid animations and transition states |
| **Axios** | HTTP client for external integrations |

### Backend
| Technology | Description |
| :--- | :--- |
| **Node.js & Express** | Modular REST API runtime & framework |
| **TypeScript** | Strict type definitions across models and controllers |
| **MongoDB & Mongoose 8**| Document database (Azure Cosmos DB vCore / MongoDB Atlas) |
| **Passport.js** | Multi-strategy authentication (Local, Google, Microsoft) |
| **JWT & Express Session**| Secure stateless tokens & MongoStore sessions |
| **Nodemailer** | System email delivery service for requests & alerts |
| **Multer** | Multipart form-data file uploads |
| **PDFKit** | Dynamic server-side payslip PDF generation |
| **Node-Cron** | Task scheduling for probations, auto-closing, and sync jobs |
| **Winston** | Production logging with daily log rotation |

---

## 📁 Project Structure

```
hrm-itcs/
├── client/                         # Frontend React application
│   ├── src/
│   │   ├── components/             # Reusable UI, layout, and modal components
│   │   ├── contexts/               # React Contexts (Auth, Toast, etc.)
│   │   ├── hooks/                  # Custom hooks (permissions, live feed, roster)
│   │   ├── modules/
│   │   │   └── attendance/         # Attendance module (pages, components, api, types)
│   │   ├── pages/                  # Page route components
│   │   │   ├── Admin/              # Users, Roles, Locations, Shifts, Holidays
│   │   │   ├── Claim/              # Expense claim listings, requests, approvals
│   │   │   ├── Dashboard/          # Analytics & executive dashboards
│   │   │   ├── Leave/              # Leave applications, team calendars, balance ledger
│   │   │   ├── MyInfo/             # Self-service employee portal
│   │   │   ├── MyRequests/         # Custom requests (PF, Loans, Letters)
│   │   │   ├── Payroll/            # Payroll runs, payslip viewer, bank exports
│   │   │   └── PIM/                # Employee directory, profile tabs, add wizard
│   │   ├── services/               # API clients and data mappers
│   │   ├── types/                  # Shared TypeScript type definitions
│   │   ├── utils/                  # Date helpers, formatters, permissions
│   │   └── index.css               # Global Tailwind CSS definitions
│   ├── public/                     # Static client assets
│   ├── vite.config.ts              # Vite bundling configuration
│   └── package.json
│
├── server/                         # Backend Express application
│   ├── src/
│   │   ├── config/                 # Passport strategies and database configurations
│   │   ├── middleware/             # Auth, role authorization, module access, upload
│   │   ├── models/                 # Mongoose schemas (Employee, Attendance, Leave, Payroll, etc.)
│   │   ├── modules/
│   │   │   └── attendance/         # Attendance V2 (controller, service, repository, routes, ADMS)
│   │   ├── routes/                 # Express API routes
│   │   │   ├── adminRoutes.ts      # Roles, users, permissions
│   │   │   ├── authRoutes.ts       # Login, logout, refresh, SSO callbacks
│   │   │   ├── claimRoutes.ts      # Expense claims lifecycle
│   │   │   ├── employeeRoutes.ts   # PIM employee management
│   │   │   ├── leaveRoutes.ts      # Leave requests, balance tracking, approvals
│   │   │   ├── orgConfigRoutes.ts  # Company info, shifts, meal rates, holidays
│   │   │   └── payrollRoutes.ts    # Payroll runs, calculations, payslips, bank files
│   │   ├── services/               # Core domain engines
│   │   │   ├── attendanceProcessor.ts  # Punch processor & machine synchronization
│   │   │   ├── payrollCalculation.ts   # Payslip computation engine
│   │   │   ├── loanManagementService.ts# Employee loans and deduction tracking
│   │   │   └── scheduler.ts            # Cron jobs and automated tasks
│   │   ├── utils/                  # Holiday checkers, penalty policy, email templates
│   │   └── index.ts                # Server entry point, route mounts & database bootstrap
│   ├── uploads/                    # Local storage for avatars, attachments, receipts
│   └── package.json
│
├── MODULES_EXPLANATION.md          # Architectural logic and business rule specs
├── DEPLOYMENT.md                   # Cloud deployment instructions
└── README.md                       # Main project documentation
```

---

## 🔌 API Endpoints Overview

| Prefix | Module | Description |
| :--- | :--- | :--- |
| `/api/auth` | **Auth** | Sign in, sign out, password reset, OAuth callback routes |
| `/api/employees` | **PIM** | Employee CRUD, multi-step profile data, salary revisions |
| `/api/v2/attendance` | **Attendance** | Real-time punches, smart roster, record updates, CSV exports |
| `/api/attendance/adms`| **Biometrics** | ZKTeco ADMS machine communication (`/iclock/cdata`) |
| `/api/leaves` | **Leaves** | Leave submissions, approvals, balances ledger, leave types |
| `/api/claims` | **Expenses** | Expense claim submission, multi-tier approvals, policy check |
| `/api/payroll` | **Payroll** | Payroll generation, payslips, penalty calculations, bank files |
| `/api/admin` | **Admin** | User accounts, role permissions, audit log viewer |
| `/api/config` | **Org Config** | Shifts, locations, holidays, meal rates, request categories |
| `/api/my-requests` | **Requests** | Custom employee requests (PF withdrawal, loan pauses, letters) |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **MongoDB**: Local MongoDB instance or MongoDB Atlas / Azure Cosmos DB cluster
* **Package Manager**: npm or yarn

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/infoITCS/hrm-itcs.git
   cd hrm-itcs
   ```

2. **Install Server Dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install Client Dependencies**
   ```bash
   cd ../client
   npm install
   ```

### Environment Configuration

#### Server Configuration (`server/.env`)
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/hrm
JWT_SECRET=your_jwt_secret_key_here
SESSION_SECRET=your_session_secret_key_here
FRONTEND_URL=http://localhost:5173
CLIENT_URL=http://localhost:5173

# Optional: Email SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_app_password
```

#### Client Configuration (`client/.env`)
```env
VITE_API_URL=http://localhost:5000
```

### Running Locally

1. **Start the Backend API Server:**
   ```bash
   cd server
   npm run dev
   ```
   *Runs at `http://localhost:5000`*

2. **Start the Frontend Dev Server:**
   ```bash
   cd client
   npm run dev
   ```
   *Runs at `http://localhost:5173`*

---

## 📄 License & Proprietary Notice

This software is proprietary and confidential. Developed specifically for **ITCS**. All rights reserved.
