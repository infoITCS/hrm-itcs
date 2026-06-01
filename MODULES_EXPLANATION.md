# HRM System - Module Explanations

## 1. LEAVE MODULE - Complete Working & Logic

### Overview
The Leave Module manages employee leave requests with balance tracking, approval workflows, and integration with attendance records.

### Leave Types
- **Annual Leave**: 20 days/year (default)
- **Sick Leave**: 10 days/year (default)
- **Casual Leave**: 10 days/year (default)
- **Unpaid Leave**: Unlimited

### Leave Request Statuses
1. **Pending** → Initial state when employee submits request
2. **Approved** → Manager/Admin approves the request
3. **Rejected** → Manager/Admin rejects the request

---

### Conditions & Logic

#### 1. **Submission Conditions** (When Employee Applies for Leave)
```
✓ Start Date must be BEFORE End Date
✓ At least 1 working day (Monday-Friday, excluding weekends)
✓ Sufficient leave balance available
✓ Leave type must be valid (Annual, Sick, Casual)
```

#### 2. **Leave Balance Calculation**
```
Available Balance = Total - (Used + Pending)

Where:
- Total: Allocated days for the year (20 for Annual, 10 for Sick/Casual)
- Used: Already approved and taken leave
- Pending: Submitted but not yet approved
```

Example:
```
Annual Leave Balance for 2026:
- Total: 20 days
- Used: 5 days (already taken)
- Pending: 3 days (waiting approval)
- Available: 20 - (5 + 3) = 12 days can request
```

#### 3. **Leave Days Counting**
- **Weekdays Only**: Count Monday-Friday (exclude Saturday-Sunday)
- **Multi-Year Support**: If leave spans 2 calendar years, days are split by year and checked separately
- **Working Days**: Only non-weekend days are counted

Example:
```
Request: 2024-12-27 to 2025-01-03
Friday   → Count ✓
Saturday → Skip ✗
Sunday   → Skip ✗
Monday   → Count ✓
Tuesday  → Count ✓
Wednesday→ Count ✓
Thursday → Count ✓
Friday   → Count ✓

2024 Balance: -2 days
2025 Balance: -4 days
```

#### 4. **Atomic Transaction Processing**
When employee submits leave request:

```
1. START TRANSACTION
2. FOR EACH YEAR in the leave period:
   - Fetch LeaveBalance record for that year (create if doesn't exist)
   - Calculate: available = total - (used + pending)
   - Validate: available >= days_requested
   - RESERVE: pending += days_requested
3. Create LeaveRequest with status "Pending"
4. COMMIT TRANSACTION
   OR
   ROLLBACK on ANY error (sufficient balance check fails)
```

This ensures **no race conditions** - pending days are reserved immediately.

#### 5. **Approval Process**
When Manager/Admin approves/rejects:

```
Status: Pending → Approved
  ├─ Mark leave.status = "Approved"
  └─ Update balance: pending -= days, used += days

Status: Pending → Rejected
  ├─ Mark leave.status = "Rejected"
  └─ Update balance: pending -= days (funds released back)
```

#### 6. **Post-Approval: Attendance Integration**
After leave is approved:
- Attendance records for those dates are updated to status: "On Leave"
- `leaveType` field stores the type of leave (Casual, Sick, etc.)
- These dates won't count as Absent even without punches

---

### API Endpoints

| Endpoint | Method | Role | Action |
|----------|--------|------|--------|
| `/api/leaves/mine` | GET | Employee | View their leave history |
| `/api/leaves/balance` | GET | Employee | Check current year balance |
| `/api/leaves/all` | GET | Admin/Manager | View all team member leaves |
| `/api/leaves` | POST | Employee | Submit new leave request |
| `/api/leaves/:id/status` | PUT | Admin/Manager | Approve/Reject leave |

---

## 2. EXPENSE CLAIM MODULE - Complete Working & Logic

### Overview
Multi-stage approval workflow for employee expense reimbursement requests with policy limit validation and category-based routing.

### Expense Categories & Policy Limits
```
Medical                 → PKR 60,000 limit per calendar year (requires receipt)
Training & Certification→ Unlimited (requires comment or receipt)
Travel                  → PKR 9,999,999 (unlimited)
Sales/Customer Gifts    → Unlimited (requires comment or receipt)
Other                   → Unlimited (requires comment or receipt)
```

### Claim Statuses
```
Draft                 → Saved but not submitted
Submitted             → Submitted (ready for approval)
Pending Team Lead     → Waiting team lead review
Pending Line Manager  → Waiting manager review
Pending HR            → Waiting HR review
Pending Finance       → Waiting finance review
Approved              → Final approval received
Declined              → Rejected at any stage
```

---

### Conditions & Validation

#### 1. **Submission Validation**
```
✓ Category must be valid
✓ Amount must be > 0
✓ Employee must have employee record linked
✓ For Dependent claims: dependent must be registered in employee profile
✓ Medical: receipt is strictly required
✓ Training, Sales, Other: at least one comment (notes >= 5 chars) or one receipt is required
```

#### 2. **Eligibility Flags** (Automatic Detection)
```
OutOfPolicy             → Requested amount exceeds remaining category limit (yearly limit for Medical)
MissingReceipt          → Medical category without receipt
MissingCommentOrReceipt → Training, Sales, or Other category without 5+ char comment AND without receipt
```

Example:
```
Category: Medical
Requested: PKR 25,000
Current Claimed (Current Year): PKR 45,000 (Remaining Limit: PKR 15,000)

Flags: ["OutOfPolicy"]
amountAllowed: PKR 15,000 (capped to remaining limit)
amountRequested: PKR 25,000 (original requested)
requiresAuthorization: true (HR must authorize override)
```

#### 3. **Category-Based Workflow Routing**
The approval chain depends on expense category:

```
MEDICAL:
  Employee → HR → Finance → Approved
  (Skip manager levels)

TRAINING & CERTIFICATION:
  Employee → Team Lead → HR → Finance → Approved

TRAVEL:
  Employee → Line Manager → HR → Finance → Approved

SALES/CUSTOMER GIFTS:
  Employee → Line Manager → HR → Finance → Approved

OTHER:
  Employee → Line Manager → HR → Finance → Approved
```

#### 4. **Reporting Manager Resolution**
- Team Lead/Line Manager stages automatically assigned to:
  - Employee's `jobInfo.reportingManager` field from PIM
  - If not found, stage remains unassigned

---

### Approval Decision Logic

#### Stage 1-2: Team Lead / Line Manager
```
Decision: Approve
├─ Mark stage as "Approved"
├─ Can propose partial approval (approvedAmount ≤ amountAllowed)
└─ Move to next stage

Decision: Decline
├─ Mark claim status = "Declined"
└─ Process ends (terminal decision)
```

#### Stage 3: HR Review
```
Decision: Approve
├─ If "OutOfPolicy" flag AND no authorizationBy → REJECT
│  (Must provide "authorizationBy" like "Senior Management")
├─ Can propose partial approval
└─ If Admin: AUTO-APPROVE all remaining stages
└─ Move to Finance or Approve (if admin)

Decision: Decline
├─ Mark claim status = "Declined"
└─ Process ends
```

#### Stage 4: Finance (Final)
```
Decision: Approve
├─ Calculate final approvedTotal from all stage approvals
├─ Mark claim status = "Approved"
└─ Employee eligible for reimbursement

Decision: Decline
├─ Mark claim status = "Declined"
└─ Process ends
```

#### Admin Override
```
If role = "Admin" or "Super-Admin":
├─ Can approve from ANY stage
├─ Automatically approves all remaining pending stages
├─ Jumps directly to "Approved" status
└─ Updates approvedTotal based on proposed amount
```

---

### Approval Amount Calculation

```
Final Approved Total = MINIMUM of:
1. Last stage's approvedAmount (if proposed)
2. amountAllowed (policy limit)
3. amountRequested (what employee asked)

Default Flow (if no partial amounts proposed):
approvedTotal = amountAllowed (respects policy limits)
```

Example Scenario:
```
Request:
├─ Category: Medical
├─ Requested: PKR 25,000
├─ Policy Limit: PKR 20,000
├─ amountAllowed: PKR 20,000 (auto-capped)
└─ Flags: ["OutOfPolicy"]

Workflow: HR → Finance

HR Review (with authorization):
├─ Decision: Approve
├─ approvedAmount: PKR 20,000
├─ authorizationBy: "Senior Management"
└─ Status: Pending Finance

Finance Review:
├─ Decision: Approve
├─ approvedAmount: PKR 15,000 (negotiated down)
└─ Final approvedTotal: PKR 15,000
```

---

### Receipt Management
```
Maximum Receipts: 5 per claim
Maximum Size: 5 MB each
Formats: Any (stored as Buffer with contentType)

Receipt Storage:
├─ fileName: Original file name
├─ contentType: MIME type (image/png, application/pdf, etc.)
├─ fileData: Binary Buffer (sent as base64 in API)
└─ uploadedAt: Timestamp
```

---

### API Endpoints

| Endpoint | Method | Role | Action |
|----------|--------|------|--------|
| `/api/claims` | POST | Employee | Submit new expense claim |
| `/api/claims/mine` | GET | Employee | View their claims |
| `/api/claims/approvals/pending` | GET | Manager/Admin | View pending approvals |
| `/api/claims/:id/decision` | PATCH | Manager/Admin | Make approval decision |
| `/api/claims/:id/admin-correct` | PATCH | Admin | Correct status/amount |
| `/api/claims/:id/receipts/:receiptId` | GET | Owner/Admin | Download receipt |

---

## 3. ATTENDANCE MODULE - Complete Working & Logic

### Overview
Real-time punch processing, status calculation, and integration with leaves and shifts.

### Attendance Statuses
```
Present       → Full shift worked, on time
Late          → Arrived after grace period
Early Leave   → Left before scheduled end (>10 min early)
Half-Day      → <4 hours worked
On Leave      → Approved leave on this date
Holiday       → Organization holiday
Weekend       → Saturday or Sunday
Absent        → No punches, no leave, no holiday
Incomplete    → Checked in but no valid check-out yet
```

---

### Conditions & Logic

#### 1. **Shift Configuration Hierarchy**
```
Priority:
1. Employee's assigned shift (from jobInfo.shift)
2. Device Location configuration
3. Hardcoded defaults (09:00-18:00, 30 min grace)

Default Values:
├─ Shift Start: 09:00
├─ Shift End: 18:00
├─ Grace Minutes: 30
├─ Half-Day Threshold: 4 hours
└─ Location: ISB-Office
```

Example:
```
Employee has no custom shift assigned
├─ Device registered at ISB-Office has: 08:00-17:00, 15 min grace
└─ Used: 08:00-17:00 with 15 min grace
```

#### 2. **Punch Validation Rules**

**Valid Check-In:**
- Any punch during work day

**Valid Check-Out:**
- Must be AFTER 1:00 PM (13:00 / 5 hours after start)
- At least 60 minutes after check-in

```
Example Invalid Check-Outs:
├─ 11:30 AM → Too early in day (before 1 PM)
├─ 09:30 AM → Only 30 min after check-in (need 60 min minimum)
└─ 14:00 with check-in at 11:00 → Only 3 hours worked, needs other validation
```

#### 3. **Lunch Deduction Logic**
```
IF workDuration > 5 hours:
  ├─ Deduct 1 hour for lunch
  └─ workDurationMinutes = (checkOut - checkIn) - 60

ELSE:
  └─ workDurationMinutes = checkOut - checkIn (no deduction)
```

Example:
```
Check-in:  09:00
Check-out: 15:00
Raw Duration: 6 hours

> 5 hours? YES
└─ Deduct 60 min lunch
└─ Recorded Duration: 5 hours
```

#### 4. **Late Calculation**
```
lateMinutes = (checkIn - shiftStart) - gracePeriod

IF lateMinutes ≤ 0:
  └─ lateMinutes = 0 (not late, within grace)

Example:
├─ Shift Start: 09:00
├─ Grace: 30 minutes
├─ Check-in: 09:35
└─ lateMinutes = (09:35 - 09:00) - 30 = 5 minutes late
```

#### 5. **Overtime Calculation**
```
overtimeMinutes = checkOut - shiftEnd

IF overtimeMinutes ≤ 0:
  └─ overtimeMinutes = 0 (no overtime)

Example:
├─ Shift End: 18:00
├─ Check-out: 19:15
└─ overtimeMinutes = 19:15 - 18:00 = 75 minutes
```

#### 6. **Early Leave Detection**
```
CHECK_OUT_GRACE = 10 minutes

IF (shiftEnd - checkOut) > 10 minutes:
  └─ isEarlyLeave = true
  └─ Status = "Early Leave"

Example:
├─ Shift End: 18:00
├─ Check-out: 17:40
├─ Difference: 20 minutes
└─ isEarlyLeave = true (> 10 min grace)
```

#### 7. **Status Determination Algorithm**

```
IF no punches:
  ├─ Check if Holiday → Status = "Holiday"
  ├─ Check if On Approved Leave → Status = "On Leave"
  ├─ Check if Weekend → Status = "Weekend"
  └─ Default → Status = "Absent"

ELSE (has punches):
  ├─ IF no valid checkOut:
  │  └─ Status = "Incomplete"
  │
  ├─ ELSE IF workDuration < halfDayThreshold (4 hours):
  │  ├─ IF on approved leave → "On Leave"
  │  └─ ELSE → "Half-Day"
  │
  ├─ ELSE IF isEarlyLeave:
  │  └─ Status = "Early Leave"
  │
  ├─ ELSE IF lateMinutes > 0:
  │  └─ Status = "Late"
  │
  └─ ELSE:
     └─ Status = "Present"
```

#### 8. **Holiday Checking**
```
Check by:
1. Exact date match (YYYY-MM-DD format)
2. Location-specific OR system-wide holiday

Priority:
├─ Location-specific holiday (for ISB-Office, etc.)
└─ System-wide holiday (location = null)
```

#### 9. **Leave Integration**
```
For each processing date:
  ├─ Query LeaveRequest where:
  │  ├─ employeeId matches
  │  ├─ startDate ≤ date ≤ endDate
  │  └─ status = "Approved"
  └─ If found:
     ├─ leaveType field stores type (Casual, Sick, etc.)
     ├─ Included in status determination
     └─ Won't count as Absent
```

---

### Data Processing Flow

```
1. PUNCH RECEIVED (from ZKTeco device)
   └─ Create AttendancePunch record

2. TRIGGER PROCESSING (hourly/on-demand)
   └─ Fetch all unprocesed punches for employee + date

3. VALIDATE PUNCHES
   ├─ Group by date
   ├─ Sort by timestamp
   └─ Identify check-in and check-out

4. CALCULATE METRICS
   ├─ workDurationMinutes (with lunch deduction)
   ├─ lateMinutes
   ├─ overtimeMinutes
   └─ isEarlyLeave

5. DETERMINE STATUS
   └─ Apply algorithm with leave/holiday checks

6. UPSERT ATTENDANCE RECORD
   └─ One record per employee per date

7. MARK PUNCHES PROCESSED
   └─ Set processed = true (avoid reprocessing)
```

---

### Data Model Structure

**AttendanceRecord (one per employee per date):**
```
{
  employeeId: "EMP-001",
  date: "2025-05-20",
  location: "ISB-Office",
  shiftStart: "09:00",
  shiftEnd: "18:00",
  checkIn: Date,
  checkOut: Date,
  workDurationMinutes: 480,
  status: "Present",
  lateMinutes: 0,
  overtimeMinutes: 45,
  leaveType: null,
  isHalfDay: false,
  allPunches: [Date, Date, ...],
  manuallyAdjusted: false,
  note: null
}
```

---

### Dashboard Summary Calculation

**Query:**
```
GET /api/attendance/dashboard?date=YYYY-MM-DD&location=ISB-Office

Aggregates:
├─ totalPresent
├─ totalLate
├─ totalHalfDay
├─ totalEarlyLeave
├─ totalAbsent
├─ totalOnLeave
├─ totalIncomplete
└─ totalActive (all non-terminated employees)
```

**Filters by Role:**
```
Admin: See entire organization or location
Manager: See only direct reports (via reportingManager field)
Employee: See only their own record
```

---

### API Endpoints

| Endpoint | Method | Role | Action |
|----------|--------|------|--------|
| `/api/attendance/mine` | GET | Employee | View their attendance |
| `/api/attendance/dashboard` | GET | Admin/Manager | View summary stats |
| `/api/attendance/records` | GET | Admin | View all records |
| `/api/attendance/:id/manual-adjust` | PATCH | Admin/Manager | Correct record |

---

## 4. Integration Between Modules

### Leave ↔ Attendance Integration
```
When Leave is Approved:
├─ AttendanceProcessor automatically detects approved leave
├─ Sets attendance status = "On Leave" for those dates
└─ Employee won't appear in "Absent" report

When Employee is on Approved Leave:
├─ No punch required
├─ Dashboard excludes from absent count
└─ Attendance record created with "On Leave" status
```

### Leave Balance ↔ Leave Request
```
Submission:
├─ Check available balance
└─ Reserve as "pending"

Approval:
├─ Move pending → used (deduct from balance)
└─ Update can request amount

Rejection:
├─ Release pending → back to available
└─ Employee can request again
```

### Expense Claim ↔ Approvals
```
Each expense category has predefined approval stages
├─ Workflow determined at submission
├─ Can't be changed mid-approval
└─ Stage completion triggers next notification

Admin can override all stages
├─ Skip to final approval
└─ Set final amount directly
```

---

## 5. Summary of Key Logic

| Module | Key Point |
|--------|-----------|
| **Leave** | Atomic transactions prevent race conditions; balance split by year |
| **Leave** | Weekdays only counted; pending reserved immediately on submission |
| **Leave** | Post-approval updates attendance to "On Leave" |
| **Expense** | Categories have different approval workflows |
| **Expense** | Policy limits auto-checked; flags mark out-of-policy |
| **Expense** | Managers assigned via reportingManager PIM field |
| **Expense** | Admin can auto-approve remaining stages |
| **Attendance** | Shift config prioritized: Employee → Location → Defaults |
| **Attendance** | Lunch deducted if > 5 hours worked |
| **Attendance** | Check-out must be after 1 PM and 60+ min after check-in |
| **Attendance** | Status determined via multi-step algorithm considering leaves/holidays |
| **Attendance** | One record per employee per date (upserted) |
