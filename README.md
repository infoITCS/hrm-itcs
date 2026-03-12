# HRM System - ITCS

A comprehensive Human Resource Management (HRM) system built with React, TypeScript, Node.js, Express, and MongoDB. This system provides employee management, tracking, and administrative features with a modern, responsive UI.

## 🚀 Features

### ✅ Implemented Features

#### 1. **PIM (Personal Information Management) Module**
   - **Employee List**
     - View all employees in a searchable, sortable table
     - Filter employees by various criteria
     - Bulk selection with checkboxes
     - Quick actions (View, Edit, Delete)
   
   - **Add/Edit Employee**
     - Multi-step wizard form with smooth animations
     - Progress bar with step completion indicators
     - Comprehensive employee data collection:
       - Personal Information (Name, DOB, Gender, Marital Status, Nationality)
       - Contact Information (Email, Phone, Address)
       - Job Information (Designation, Department, Reporting Manager)
       - Employment Status (Type, Status, Joining Date, Probation Period)
       - Emergency Contacts (Multiple entries)
       - Dependents (Multiple entries)
       - Education History
       - Employment History
       - Document Uploads
   
   - **Employee Profile**
     - Detailed employee view with tabbed interface
     - Tabs: Personal, Contact, Job, Employment History, Education, Documents, Audit Logs
     - View all employee information in organized sections
     - Download documents
     - Edit employee information
   
   - **Reports**
     - Employee reports and analytics (Placeholder for future implementation)

#### 2. **UI/UX Features**
   - Modern, professional design with gradient themes
   - Smooth animations and transitions
   - Responsive layout with sidebar navigation
   - Interactive progress indicators
   - Loading states and error handling
   - Custom select dropdowns
   - Modal dialogs for confirmations

#### 3. **Backend Features**
   - RESTful API endpoints for employee CRUD operations
   - File upload handling with Multer
   - MongoDB database integration
   - Audit logging system
   - Automatic probation status updates (via cron jobs)
   - CORS configuration for production
   - Environment-based configuration

#### 4. **Production Ready**
   - Netlify configuration for frontend deployment
   - Vercel configuration for backend serverless deployment
   - Environment variable management
   - Build optimizations
   - Code splitting for better performance
   - Production-ready error handling

## 🛠️ Tech Stack

### Frontend
- **React 19.2.0** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router DOM 7.13.0** - Client-side routing
- **Tailwind CSS 4.1.18** - Utility-first CSS framework
- **Lucide React** - Icon library

### Backend
- **Node.js** - Runtime environment
- **Express 4.19.2** - Web framework
- **TypeScript** - Type safety
- **MongoDB** - Database
- **Mongoose 8.4.0** - MongoDB object modeling
- **Multer 2.0.2** - File upload handling
- **node-cron 4.2.1** - Task scheduling

### Deployment
- **Netlify** - Frontend hosting
- **Vercel** - Backend serverless hosting
- **MongoDB Atlas** - Cloud database

## 📁 Project Structure

```
hrm-itcs/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   │   ├── Layout/     # Header, Sidebar, MainLayout
│   │   │   └── UI/         # CustomSelect, DeleteModal
│   │   ├── pages/          # Page components
│   │   │   └── PIM/        # PIM module pages
│   │   ├── utils/          # Utility functions (API config)
│   │   ├── types/          # TypeScript type definitions
│   │   └── index.css       # Global styles
│   ├── public/             # Static assets
│   ├── netlify.toml        # Netlify configuration
│   ├── vite.config.ts      # Vite configuration
│   └── package.json
│
├── server/                 # Backend Express application
│   ├── src/
│   │   ├── models/         # Mongoose models
│   │   │   ├── Employee.ts
│   │   │   └── AuditLog.ts
│   │   ├── routes/         # API routes
│   │   │   ├── employeeRoutes.ts
│   │   │   └── auditRoutes.ts
│   │   ├── middleware/     # Express middleware
│   │   │   ├── auth.ts
│   │   │   └── upload.ts
│   │   ├── services/       # Business logic
│   │   │   └── scheduler.ts
│   │   └── index.ts        # Server entry point
│   ├── api/                # Vercel serverless functions
│   │   ├── index.ts
│   │   └── cron/
│   │       └── probation-check.ts
│   ├── uploads/            # File upload directory
│   ├── vercel.json         # Vercel configuration
│   └── package.json
│
├── DEPLOYMENT.md           # Deployment guide
├── PRODUCTION_SETUP.md     # Quick setup guide
└── README.md               # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- MongoDB (local or Atlas)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/infoITCS/hrm-itcs.git
   cd hrm-itcs
   ```

2. **Install Frontend Dependencies**
   ```bash
   cd client
   npm install
   ```

3. **Install Backend Dependencies**
   ```bash
   cd ../server
   npm install
   ```

4. **Environment Setup**

   **Frontend** (`client/.env`):
   ```env
   VITE_API_URL=http://localhost:5000
   ```

   **Backend** (`server/.env`):
   ```env
   MONGODB_URI=mongodb://localhost:27017/hrm
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   ```

5. **Run Development Servers**

   **Frontend**:
   ```bash
   cd client
   npm run dev
   ```
   Frontend will run on `http://localhost:5173`

   **Backend**:
   ```bash
   cd server
   npm run dev
   ```
   Backend will run on `http://localhost:5000`

## 📝 API Endpoints

### Employee Routes
- `GET /api/employees` - Get all employees
- `POST /api/employees` - Create new employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee
- `POST /api/employees/:id/attachments` - Upload employee document

### Audit Log Routes
- `GET /api/audit-logs` - Get all audit logs
- `GET /api/audit-logs?targetResource=Employee&targetId=:id` - Get logs for specific employee

## 🎨 UI Design

The application features a modern, professional design with:
- **Color Scheme**: Indigo and purple gradients with slate accents
- **Typography**: Inter font family
- **Components**: Rounded corners, soft shadows, smooth transitions
- **Animations**: Fade-in, slide-up, scale-in effects
- **Responsive**: Mobile-friendly layout

## 🔄 What Has Been Done

### Phase 1: Project Setup ✅
- [x] React + TypeScript frontend setup
- [x] Express + TypeScript backend setup
- [x] MongoDB integration
- [x] Basic routing structure
- [x] Layout components (Header, Sidebar, MainLayout)

### Phase 2: PIM Module ✅
- [x] Employee List page with table view
- [x] Add Employee multi-step wizard
- [x] Employee Profile page with tabs
- [x] Edit Employee functionality
- [x] Delete Employee with confirmation modal
- [x] Search and filter functionality

### Phase 3: Data Management ✅
- [x] Employee model with comprehensive fields
- [x] Emergency contacts support
- [x] Dependents management
- [x] Education history tracking
- [x] Employment history tracking
- [x] Document upload functionality
- [x] Audit logging system

### Phase 4: UI/UX Enhancement ✅
- [x] Modern design implementation
- [x] Gradient themes and color schemes
- [x] Smooth animations and transitions
- [x] Progress indicators for multi-step forms
- [x] Loading states
- [x] Error handling UI
- [x] Responsive design

### Phase 5: Backend Features ✅
- [x] RESTful API endpoints
- [x] File upload handling
- [x] Automatic probation status updates
- [x] Audit log creation
- [x] CORS configuration
- [x] Error handling middleware

### Phase 6: Production Deployment ✅
- [x] Netlify configuration for frontend
- [x] Vercel configuration for backend
- [x] Environment variable management
- [x] API utility with environment-based URLs
- [x] Build optimizations
- [x] Code splitting
- [x] Production documentation

### Phase 7: Code Quality ✅
- [x] TypeScript strict mode
- [x] Removed unused imports
- [x] Fixed build errors
- [x] Optimized build configuration

### Phase 8: Advanced Security & Impersonation ✅
- [x] Super Admin "Login As" functionality
- [x] Redis & MongoDB hybrid Ghost Session management (auto-expiring TTL)
- [x] Short-lived JWT architecture for impersonated sessions
- [x] Strict route middleware to block sensitive actions (passwords, deletions, finance) during impersonation
- [x] Global, sticky frontend banner with live session countdown overlay
- [x] Complete Audit Log integration for tracing impersonation start, stop, and blocked actions
- [x] Custom reason/prompt modals for enhanced UX

### Phase 9: Database Stability & Concurrency Fixes ✅
- [x] Switched from `document.save()` to `findOneAndUpdate` to bypass Mongoose `VersionError` on concurrent frontend auto-saves
- [x] Prevented MongoDB Cosmos DB idle connection timeout crashes by actively cycling connections (`maxIdleTimeMS`)
- [x] Increased server connection `maxPoolSize` to robustly handle parallel multi-step wizard requests

## 🚧 Future Enhancements

### Planned Features
- [ ] Admin Module
- [ ] Leave Management
- [ ] Attendance Tracking
- [ ] Payroll Management
- [ ] Performance Reviews
- [ ] Training & Development
- [ ] Reports & Analytics Dashboard
- [ ] User Authentication & Authorization
- [ ] Role-based Access Control
- [ ] Email Notifications
- [ ] Export to PDF/Excel
- [ ] Advanced Search & Filters
- [ ] Bulk Operations

## 📚 Documentation

- [Deployment Guide](./DEPLOYMENT.md) - Detailed deployment instructions
- [Production Setup](./PRODUCTION_SETUP.md) - Quick production setup guide
- [Client README](./client/README.md) - Frontend-specific documentation
- [Server README](./server/README.md) - Backend-specific documentation

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software developed for ITCS.

## 👥 Authors

- **ITCS Development Team**

## 🙏 Acknowledgments

- React team for the amazing framework
- Tailwind CSS for the utility-first CSS framework
- MongoDB for the database solution
- Netlify and Vercel for hosting platforms

---

**Last Updated**: March 2026
**Version**: 1.1.0


