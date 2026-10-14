import * as XLSX from 'xlsx';
import { decryptEmployeeFields } from '../utils/encryption';

export interface ExportFieldDef {
    key: string;
    label: string;
    category:
        | 'Basic Information'
        | 'Contact & Address'
        | 'Job & Organization'
        | 'Tenure & Status'
        | 'Dependents & Family'
        | 'Compensation & Finance'
        | 'Benefits & Loans'
        | 'Education & Experience'
        | 'Documents & Records';
    isSensitive?: boolean;
    extract: (emp: any) => string | number;
}

function formatDate(dateVal?: Date | string | null): string {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function calculateAge(dob?: Date | string | null): number | '' {
    if (!dob) return '';
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age >= 0 ? age : '';
}

export function calculateTenure(joiningDate?: Date | string | null): { years: number; formatted: string } {
    if (!joiningDate) return { years: 0, formatted: 'N/A' };
    const start = new Date(joiningDate);
    if (isNaN(start.getTime())) return { years: 0, formatted: 'N/A' };
    const now = new Date();

    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (now.getDate() < start.getDate()) {
        months--;
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    const totalDecimalYears = Math.max(0, parseFloat((years + months / 12).toFixed(1)));
    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'Year' : 'Years'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'Month' : 'Months'}`);
    if (parts.length === 0) parts.push('Less than a month');

    return {
        years: totalDecimalYears,
        formatted: parts.join(', ')
    };
}

function formatAddress(addr?: any): string {
    if (!addr || typeof addr !== 'object') return '';
    return [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean).join(', ');
}

export const ALL_EXPORT_FIELDS: ExportFieldDef[] = [
    // ── 1. Basic Information ──────────────────────────────────────────
    {
        key: 'employeeId',
        label: 'Employee ID',
        category: 'Basic Information',
        extract: (e) => e.employeeId || ''
    },
    {
        key: 'userId',
        label: 'User Account ID',
        category: 'Basic Information',
        extract: (e) => e.userId || ''
    },
    {
        key: 'fullName',
        label: 'Full Name',
        category: 'Basic Information',
        extract: (e) => [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ') || ''
    },
    {
        key: 'firstName',
        label: 'First Name',
        category: 'Basic Information',
        extract: (e) => e.firstName || ''
    },
    {
        key: 'middleName',
        label: 'Middle Name',
        category: 'Basic Information',
        extract: (e) => e.middleName || ''
    },
    {
        key: 'lastName',
        label: 'Last Name',
        category: 'Basic Information',
        extract: (e) => e.lastName || ''
    },
    {
        key: 'cnic',
        label: 'CNIC / National ID',
        category: 'Basic Information',
        extract: (e) => e.cnic || ''
    },
    {
        key: 'fatherName',
        label: "Father's Name",
        category: 'Basic Information',
        extract: (e) => e.fatherName || ''
    },
    {
        key: 'dateOfBirth',
        label: 'Date of Birth',
        category: 'Basic Information',
        extract: (e) => formatDate(e.dateOfBirth)
    },
    {
        key: 'age',
        label: 'Age',
        category: 'Basic Information',
        extract: (e) => calculateAge(e.dateOfBirth)
    },
    {
        key: 'gender',
        label: 'Gender',
        category: 'Basic Information',
        extract: (e) => e.gender || ''
    },
    {
        key: 'maritalStatus',
        label: 'Marital Status',
        category: 'Basic Information',
        extract: (e) => e.maritalStatus || 'Single'
    },
    {
        key: 'bloodGroup',
        label: 'Blood Group',
        category: 'Basic Information',
        extract: (e) => e.bloodGroup || ''
    },
    {
        key: 'nationality',
        label: 'Nationality',
        category: 'Basic Information',
        extract: (e) => e.nationality || 'Pakistani'
    },
    {
        key: 'religion',
        label: 'Religion',
        category: 'Basic Information',
        extract: (e) => e.religion || ''
    },
    {
        key: 'domicile',
        label: 'Domicile District',
        category: 'Basic Information',
        extract: (e) => e.domicile || ''
    },
    {
        key: 'licenseNumber',
        label: 'Driving License No',
        category: 'Basic Information',
        extract: (e) => e.licenseNumber || ''
    },

    // ── 2. Contact & Address ──────────────────────────────────────────
    {
        key: 'phone',
        label: 'Primary Phone',
        category: 'Contact & Address',
        extract: (e) => e.phone || ''
    },
    {
        key: 'simNumber',
        label: 'Official SIM / Work Phone',
        category: 'Contact & Address',
        extract: (e) => e.simNumber || ''
    },
    {
        key: 'workEmail',
        label: 'Work Email',
        category: 'Contact & Address',
        extract: (e) => e.workEmail || ''
    },
    {
        key: 'personalEmail',
        label: 'Personal Email',
        category: 'Contact & Address',
        extract: (e) => e.email || ''
    },
    {
        key: 'otherEmail',
        label: 'Other / Alternate Email',
        category: 'Contact & Address',
        extract: (e) => e.otherEmail || ''
    },
    {
        key: 'permanentAddress',
        label: 'Permanent Address (Full)',
        category: 'Contact & Address',
        extract: (e) => formatAddress(e.address)
    },
    {
        key: 'permanentStreet',
        label: 'Permanent Street',
        category: 'Contact & Address',
        extract: (e) => e.address?.street || ''
    },
    {
        key: 'permanentCity',
        label: 'Permanent City',
        category: 'Contact & Address',
        extract: (e) => e.address?.city || ''
    },
    {
        key: 'permanentState',
        label: 'Permanent State / Province',
        category: 'Contact & Address',
        extract: (e) => e.address?.state || ''
    },
    {
        key: 'permanentZipCode',
        label: 'Permanent Zip / Postal Code',
        category: 'Contact & Address',
        extract: (e) => e.address?.zipCode || ''
    },
    {
        key: 'permanentCountry',
        label: 'Permanent Country',
        category: 'Contact & Address',
        extract: (e) => e.address?.country || ''
    },
    {
        key: 'temporaryAddress',
        label: 'Temporary Address (Full)',
        category: 'Contact & Address',
        extract: (e) => formatAddress(e.temporaryAddress)
    },
    {
        key: 'temporaryStreet',
        label: 'Temporary Street',
        category: 'Contact & Address',
        extract: (e) => e.temporaryAddress?.street || ''
    },
    {
        key: 'temporaryCity',
        label: 'Temporary City',
        category: 'Contact & Address',
        extract: (e) => e.temporaryAddress?.city || ''
    },
    {
        key: 'temporaryState',
        label: 'Temporary State / Province',
        category: 'Contact & Address',
        extract: (e) => e.temporaryAddress?.state || ''
    },
    {
        key: 'temporaryZipCode',
        label: 'Temporary Zip / Postal Code',
        category: 'Contact & Address',
        extract: (e) => e.temporaryAddress?.zipCode || ''
    },
    {
        key: 'temporaryCountry',
        label: 'Temporary Country',
        category: 'Contact & Address',
        extract: (e) => e.temporaryAddress?.country || ''
    },

    // ── 3. Job & Organization ─────────────────────────────────────────
    {
        key: 'department',
        label: 'Department',
        category: 'Job & Organization',
        extract: (e) => e.jobInfo?.department || 'Unassigned'
    },
    {
        key: 'designation',
        label: 'Designation / Post',
        category: 'Job & Organization',
        extract: (e) => e.jobInfo?.designation || 'Staff'
    },
    {
        key: 'workLocation',
        label: 'Work Location',
        category: 'Job & Organization',
        extract: (e) => e.jobInfo?.workLocation || 'ISB-Office'
    },
    {
        key: 'reportingManager',
        label: 'Reporting Manager',
        category: 'Job & Organization',
        extract: (e) => e.jobInfo?.reportingManagerName || e.jobInfo?.reportingManager || ''
    },
    {
        key: 'shiftName',
        label: 'Assigned Shift',
        category: 'Job & Organization',
        extract: (e) => {
            if (!e.jobInfo?.shift) return 'Default Shift';
            if (typeof e.jobInfo.shift === 'object') {
                return `${e.jobInfo.shift.name || 'Shift'} (${e.jobInfo.shift.startTime || '09:00'} - ${e.jobInfo.shift.endTime || '18:00'})`;
            }
            return String(e.jobInfo.shift);
        }
    },
    {
        key: 'biometricPin',
        label: 'Biometric Machine PIN',
        category: 'Job & Organization',
        extract: (e) => e.biometricPin || ''
    },
    {
        key: 'profileReminderCount',
        label: 'Profile Reminders Sent',
        category: 'Job & Organization',
        extract: (e) => e.profileReminderCount ?? 0
    },
    {
        key: 'lastProfileReminderAt',
        label: 'Last Profile Reminder Date',
        category: 'Job & Organization',
        extract: (e) => formatDate(e.lastProfileReminderAt)
    },

    // ── 4. Tenure & Status ────────────────────────────────────────────
    {
        key: 'joiningDate',
        label: 'Joining Date',
        category: 'Tenure & Status',
        extract: (e) => formatDate(e.jobInfo?.joiningDate)
    },
    {
        key: 'tenureYears',
        label: 'Tenure (Years)',
        category: 'Tenure & Status',
        extract: (e) => calculateTenure(e.jobInfo?.joiningDate).years
    },
    {
        key: 'tenureFormatted',
        label: 'Tenure (Formatted)',
        category: 'Tenure & Status',
        extract: (e) => calculateTenure(e.jobInfo?.joiningDate).formatted
    },
    {
        key: 'employmentStatus',
        label: 'Employment Status',
        category: 'Tenure & Status',
        extract: (e) => e.employmentStatus?.status || 'Active'
    },
    {
        key: 'probationEndDate',
        label: 'Probation End Date',
        category: 'Tenure & Status',
        extract: (e) => formatDate(e.employmentStatus?.probationEndDate)
    },
    {
        key: 'offboardingDate',
        label: 'Offboarding Date',
        category: 'Tenure & Status',
        extract: (e) => formatDate(e.employmentStatus?.offboardingDate)
    },
    {
        key: 'probationMonths',
        label: 'Probation Duration (Months)',
        category: 'Tenure & Status',
        extract: (e) => e.financeInfo?.probationMonths ?? ''
    },
    {
        key: 'probationDays',
        label: 'Probation Duration (Days)',
        category: 'Tenure & Status',
        extract: (e) => e.financeInfo?.probationDays ?? ''
    },
    {
        key: 'autoUpdatedProbation',
        label: 'Probation Auto-Updated',
        category: 'Tenure & Status',
        extract: (e) => (e.employmentStatus?.autoUpdated ? 'Yes' : 'No')
    },

    // ── 5. Dependents & Family ────────────────────────────────────────
    {
        key: 'dependents',
        label: 'Dependents (Details: Name, Relation, DOB)',
        category: 'Dependents & Family',
        extract: (e) => {
            if (!Array.isArray(e.dependents) || e.dependents.length === 0) return 'None';
            return e.dependents
                .map((d: any) => `${d.name || ''} (${d.relation || 'Dependent'}${d.dateOfBirth ? ', DOB: ' + formatDate(d.dateOfBirth) : ''})`.trim())
                .join('; ');
        }
    },
    {
        key: 'dependentsNames',
        label: 'Dependents (Names Only)',
        category: 'Dependents & Family',
        extract: (e) => {
            if (!Array.isArray(e.dependents) || e.dependents.length === 0) return 'None';
            return e.dependents.map((d: any) => d.name).filter(Boolean).join(', ');
        }
    },
    {
        key: 'dependentsCount',
        label: 'Dependents Count',
        category: 'Dependents & Family',
        extract: (e) => (Array.isArray(e.dependents) ? e.dependents.length : 0)
    },
    {
        key: 'maternityBaselineChildCount',
        label: 'Initial Children Count',
        category: 'Dependents & Family',
        extract: (e) => e.maternityBaselineChildCount ?? 0
    },
    {
        key: 'emergencyContacts',
        label: 'Emergency Contacts (Full Details)',
        category: 'Dependents & Family',
        extract: (e) => {
            if (!Array.isArray(e.emergencyContacts) || e.emergencyContacts.length === 0) return 'None';
            return e.emergencyContacts
                .map((c: any) => `${c.name || ''} (${c.relation || 'Contact'} - ${c.phone || ''})`.trim())
                .join('; ');
        }
    },
    {
        key: 'emergencyContactNames',
        label: 'Emergency Contact Names',
        category: 'Dependents & Family',
        extract: (e) => {
            if (!Array.isArray(e.emergencyContacts) || e.emergencyContacts.length === 0) return 'None';
            return e.emergencyContacts.map((c: any) => c.name).filter(Boolean).join(', ');
        }
    },
    {
        key: 'emergencyContactPhones',
        label: 'Emergency Contact Phones',
        category: 'Dependents & Family',
        extract: (e) => {
            if (!Array.isArray(e.emergencyContacts) || e.emergencyContacts.length === 0) return 'None';
            return e.emergencyContacts.map((c: any) => c.phone).filter(Boolean).join(', ');
        }
    },

    // ── 6. Compensation & Finance ─────────────────────────────────────
    {
        key: 'confirmedSalary',
        label: 'Confirmed Monthly Salary (PKR)',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.financeInfo?.confirmedSalary != null ? Number(e.financeInfo.confirmedSalary) : '')
    },
    {
        key: 'probationSalary',
        label: 'Probation Salary (PKR)',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.financeInfo?.probationSalary != null ? Number(e.financeInfo.probationSalary) : '')
    },
    {
        key: 'salaryComponents',
        label: 'Salary Components Breakdown',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => {
            if (!Array.isArray(e.salaryComponents) || e.salaryComponents.length === 0) return 'Standard';
            return e.salaryComponents
                .map((c: any) => `${c.component}: PKR ${c.amount} (${c.type || 'fixed'})`)
                .join('; ');
        }
    },
    {
        key: 'bankName',
        label: 'Bank Name',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => e.bankDetails?.bankName || ''
    },
    {
        key: 'accountName',
        label: 'Bank Account Title',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => e.bankDetails?.accountName || ''
    },
    {
        key: 'accountNumber',
        label: 'Bank Account Number',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => e.bankDetails?.accountNumber || ''
    },
    {
        key: 'iban',
        label: 'IBAN',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => e.bankDetails?.iban || ''
    },
    {
        key: 'swiftCode',
        label: 'SWIFT Code',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => e.bankDetails?.swiftCode || ''
    },
    {
        key: 'providentFundBalance',
        label: 'Provident Fund Balance (PKR)',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.providentFundBalance != null ? Number(e.providentFundBalance) : 0)
    },
    {
        key: 'pfClaimed',
        label: 'PF Claimed',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.pfClaimed ? 'Yes' : 'No')
    },
    {
        key: 'pfClaimedAt',
        label: 'PF Claimed Date',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => formatDate(e.pfClaimedAt)
    },
    {
        key: 'musharakahEnrolled',
        label: 'Musharakah Enrolled',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.musharakahAgreement?.enrolled ? 'Yes' : 'No')
    },
    {
        key: 'musharakahEnrolledAt',
        label: 'Musharakah Enrollment Date',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => formatDate(e.musharakahAgreement?.enrolledAt)
    },
    {
        key: 'musharakahOptedOutAt',
        label: 'Musharakah Opt-Out Date',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => formatDate(e.musharakahAgreement?.optedOutAt)
    },
    {
        key: 'entitledForEobi',
        label: 'EOBI Entitled',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.financeInfo?.entitledForEobi ? 'Yes' : 'No')
    },
    {
        key: 'entitledForMealAllowance',
        label: 'Meal Allowance Entitled',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.financeInfo?.entitledForMealAllowance ? 'Yes' : 'No')
    },
    {
        key: 'exemptFromAttendancePenalties',
        label: 'Attendance Penalty Exempt',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => (e.financeInfo?.exemptFromAttendancePenalties ? 'Yes' : 'No')
    },
    {
        key: 'latestSalaryRevisionAmount',
        label: 'Latest Salary Revision Amount (PKR)',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => {
            if (!Array.isArray(e.salaryHistory) || e.salaryHistory.length === 0) return '';
            const latest = e.salaryHistory[e.salaryHistory.length - 1];
            return latest?.amount != null ? Number(latest.amount) : '';
        }
    },
    {
        key: 'latestSalaryRevisionDate',
        label: 'Latest Salary Revision Date',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => {
            if (!Array.isArray(e.salaryHistory) || e.salaryHistory.length === 0) return '';
            const latest = e.salaryHistory[e.salaryHistory.length - 1];
            return formatDate(latest?.effectiveDate || latest?.revisedAt);
        }
    },
    {
        key: 'latestSalaryRevisionReason',
        label: 'Latest Salary Revision Reason',
        category: 'Compensation & Finance',
        isSensitive: true,
        extract: (e) => {
            if (!Array.isArray(e.salaryHistory) || e.salaryHistory.length === 0) return '';
            const latest = e.salaryHistory[e.salaryHistory.length - 1];
            return latest?.reason || '';
        }
    },

    // ── 7. Benefits & Loans ───────────────────────────────────────────
    {
        key: 'benefitsList',
        label: 'Active Benefits List',
        category: 'Benefits & Loans',
        extract: (e) => {
            if (!Array.isArray(e.benefits) || e.benefits.length === 0) return 'None';
            return e.benefits.map((b: any) => `${b.name || 'Benefit'} (${b.status || 'Active'})`).join('; ');
        }
    },
    {
        key: 'medicalAnnualLimit',
        label: 'Medical Annual Limit (PKR)',
        category: 'Benefits & Loans',
        extract: (e) => (e.medicalBenefit?.customAnnualLimit != null ? Number(e.medicalBenefit.customAnnualLimit) : '')
    },
    {
        key: 'medicalMonthlyAllowance',
        label: 'Medical Monthly Allowance (PKR)',
        category: 'Benefits & Loans',
        extract: (e) => (e.medicalBenefit?.customMonthlyAllowance != null ? Number(e.medicalBenefit.customMonthlyAllowance) : '')
    },
    {
        key: 'medicalBalanceUtilized',
        label: 'Medical Opening Balance Utilized',
        category: 'Benefits & Loans',
        extract: (e) => (e.medicalBenefit?.openingBalanceUtilized != null ? Number(e.medicalBenefit.openingBalanceUtilized) : '')
    },
    {
        key: 'medicalNotes',
        label: 'Medical Benefit Notes',
        category: 'Benefits & Loans',
        extract: (e) => e.medicalBenefit?.notes || ''
    },
    {
        key: 'loansCount',
        label: 'Active Loans Count',
        category: 'Benefits & Loans',
        extract: (e) => {
            if (!Array.isArray(e.loans) || e.loans.length === 0) return 0;
            return e.loans.filter((l: any) => l.status === 'Active').length;
        }
    },
    {
        key: 'loansTotalAmount',
        label: 'Total Loan Amount (PKR)',
        category: 'Benefits & Loans',
        extract: (e) => {
            if (!Array.isArray(e.loans) || e.loans.length === 0) return 0;
            return e.loans
                .filter((l: any) => l.status === 'Active')
                .reduce((sum: number, l: any) => sum + (Number(l.totalAmount) || 0), 0);
        }
    },
    {
        key: 'loansRemainingAmount',
        label: 'Remaining Loan Balance (PKR)',
        category: 'Benefits & Loans',
        extract: (e) => {
            if (!Array.isArray(e.loans) || e.loans.length === 0) return 0;
            return e.loans
                .filter((l: any) => l.status === 'Active')
                .reduce((sum: number, l: any) => sum + (Number(l.remainingAmount) || 0), 0);
        }
    },
    {
        key: 'loansMonthlyInstallment',
        label: 'Monthly Loan Installment (PKR)',
        category: 'Benefits & Loans',
        extract: (e) => {
            if (!Array.isArray(e.loans) || e.loans.length === 0) return 0;
            return e.loans
                .filter((l: any) => l.status === 'Active')
                .reduce((sum: number, l: any) => sum + (Number(l.monthlyInstallment) || 0), 0);
        }
    },
    {
        key: 'loansSummary',
        label: 'Loans Detailed Summary',
        category: 'Benefits & Loans',
        extract: (e) => {
            if (!Array.isArray(e.loans) || e.loans.length === 0) return 'No Loans';
            return e.loans
                .map((l: any) => `${l.loanId || 'Loan'}: Total PKR ${l.totalAmount || 0}, Balance PKR ${l.remainingAmount || 0} (${l.status || 'Active'})`)
                .join('; ');
        }
    },

    // ── 8. Education & Experience ─────────────────────────────────────
    {
        key: 'education',
        label: 'Education Qualifications',
        category: 'Education & Experience',
        extract: (e) => {
            if (!Array.isArray(e.education) || e.education.length === 0) return 'None';
            return e.education
                .map((edu: any) => `${edu.level || 'Degree'} - ${edu.institute || ''} (${edu.year || ''}${edu.score ? ', ' + edu.score : ''})`.trim())
                .join('; ');
        }
    },
    {
        key: 'highestEducation',
        label: 'Highest Qualification Level',
        category: 'Education & Experience',
        extract: (e) => {
            if (!Array.isArray(e.education) || e.education.length === 0) return 'Not Specified';
            return e.education[e.education.length - 1]?.level || e.education[0]?.level || 'Not Specified';
        }
    },
    {
        key: 'employmentHistory',
        label: 'Previous Experience History',
        category: 'Education & Experience',
        extract: (e) => {
            if (!Array.isArray(e.employmentHistory) || e.employmentHistory.length === 0) return 'None';
            return e.employmentHistory
                .map((h: any) => `${h.companyName || ''} (${h.jobTitle || 'Role'}${h.startDate ? ': ' + formatDate(h.startDate) : ''}${h.endDate ? ' to ' + formatDate(h.endDate) : ''})`.trim())
                .join('; ');
        }
    },
    {
        key: 'priorExperienceCount',
        label: 'Previous Employers Count',
        category: 'Education & Experience',
        extract: (e) => (Array.isArray(e.employmentHistory) ? e.employmentHistory.length : 0)
    },
    {
        key: 'skills',
        label: 'Skills',
        category: 'Education & Experience',
        extract: (e) => (Array.isArray(e.skills) ? e.skills.join(', ') : '')
    },
    {
        key: 'certifications',
        label: 'Certifications',
        category: 'Education & Experience',
        extract: (e) => (Array.isArray(e.certifications) ? e.certifications.map((c: any) => c.title).filter(Boolean).join(', ') : '')
    },
    {
        key: 'socialProfiles',
        label: 'Social Profiles',
        category: 'Education & Experience',
        extract: (e) => {
            if (!Array.isArray(e.socialProfiles) || e.socialProfiles.length === 0) return '';
            return e.socialProfiles.map((s: any) => `${s.platform || 'Profile'}: ${s.link || ''}`).join('; ');
        }
    },

    // ── 9. Documents & Records ────────────────────────────────────────
    {
        key: 'immigrationDocuments',
        label: 'Immigration / Visa Documents',
        category: 'Documents & Records',
        extract: (e) => {
            if (!Array.isArray(e.immigrationHistory) || e.immigrationHistory.length === 0) return 'None';
            return e.immigrationHistory
                .map((i: any) => `${i.documentType || 'Doc'}: ${i.documentNumber || ''} (${i.issuingCountry || ''}${i.expiryDate ? ', Exp: ' + formatDate(i.expiryDate) : ''})`)
                .join('; ');
        }
    },
    {
        key: 'attachmentsSummary',
        label: 'Uploaded Documents Summary',
        category: 'Documents & Records',
        extract: (e) => {
            if (!Array.isArray(e.attachments) || e.attachments.length === 0) return 'No Documents';
            return e.attachments.map((a: any) => `${a.fileType || 'File'}: ${a.fileName || ''} (${a.status || 'uploaded'})`).join('; ');
        }
    },
    {
        key: 'attachmentsCount',
        label: 'Uploaded Documents Count',
        category: 'Documents & Records',
        extract: (e) => (Array.isArray(e.attachments) ? e.attachments.length : 0)
    }
];

export const FIELD_MAP = new Map<string, ExportFieldDef>(
    ALL_EXPORT_FIELDS.map((f) => [f.key, f])
);

export interface ExportFilterParams {
    maritalStatus?: string;
    tenureCategory?: 'all' | 'gt3' | '1to3' | 'lt1' | 'custom';
    minTenure?: number;
    maxTenure?: number;
    status?: string; // 'all', 'active', 'past', or specific status like 'Probation'
    department?: string;
    workLocation?: string;
    gender?: string;
    hasDependents?: 'all' | 'yes' | 'no';
    search?: string;
}

/**
 * Filter an in-memory list of employees based on user-selected criteria.
 */
export function filterEmployeeDataset(employees: any[], filters: ExportFilterParams = {}): any[] {
    return employees.filter((emp) => {
        // 1. Employment Status Filter
        const rawStatus = emp.employmentStatus?.status || emp.jobInfo?.employmentType || 'Permanent';
        const isPast = ['Terminated', 'Resigned'].includes(rawStatus);

        if (filters.status === 'active' && isPast) return false;
        if (filters.status === 'past' && !isPast) return false;
        if (filters.status && filters.status !== 'all' && filters.status !== 'active' && filters.status !== 'past') {
            if (rawStatus.toLowerCase() !== filters.status.toLowerCase()) return false;
        }

        // 2. Marital Status Filter
        if (filters.maritalStatus && filters.maritalStatus !== 'all') {
            const empMarital = (emp.maritalStatus || 'Single').toLowerCase().trim();
            if (empMarital !== filters.maritalStatus.toLowerCase().trim()) return false;
        }

        // 3. Tenure Filter
        const tenureInfo = calculateTenure(emp.jobInfo?.joiningDate);
        if (filters.tenureCategory && filters.tenureCategory !== 'all') {
            if (filters.tenureCategory === 'gt3') {
                if (tenureInfo.years < 3.0) return false;
            } else if (filters.tenureCategory === '1to3') {
                if (tenureInfo.years < 1.0 || tenureInfo.years >= 3.0) return false;
            } else if (filters.tenureCategory === 'lt1') {
                if (tenureInfo.years >= 1.0) return false;
            } else if (filters.tenureCategory === 'custom') {
                const min = filters.minTenure != null ? Number(filters.minTenure) : 0;
                const max = filters.maxTenure != null ? Number(filters.maxTenure) : Infinity;
                if (tenureInfo.years < min || tenureInfo.years > max) return false;
            }
        }

        // 4. Department Filter
        if (filters.department && filters.department !== 'all') {
            const dept = (emp.jobInfo?.department || '').toLowerCase().trim();
            if (dept !== filters.department.toLowerCase().trim()) return false;
        }

        // 5. Work Location Filter
        if (filters.workLocation && filters.workLocation !== 'all') {
            const loc = (emp.jobInfo?.workLocation || '').toLowerCase().trim();
            if (loc !== filters.workLocation.toLowerCase().trim()) return false;
        }

        // 6. Gender Filter
        if (filters.gender && filters.gender !== 'all') {
            const g = (emp.gender || '').toLowerCase().trim();
            if (g !== filters.gender.toLowerCase().trim()) return false;
        }

        // 7. Dependents Filter
        if (filters.hasDependents && filters.hasDependents !== 'all') {
            const depCount = Array.isArray(emp.dependents) ? emp.dependents.length : 0;
            if (filters.hasDependents === 'yes' && depCount === 0) return false;
            if (filters.hasDependents === 'no' && depCount > 0) return false;
        }

        // 8. General Search Filter (Name, CNIC, ID, Post, Dept, Email)
        if (filters.search && filters.search.trim()) {
            const q = filters.search.toLowerCase().trim();
            const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ').toLowerCase();
            const empId = (emp.employeeId || '').toLowerCase();
            const cnic = (emp.cnic || '').toLowerCase();
            const post = (emp.jobInfo?.designation || '').toLowerCase();
            const dept = (emp.jobInfo?.department || '').toLowerCase();
            const email = (emp.workEmail || emp.email || '').toLowerCase();

            const matches =
                fullName.includes(q) ||
                empId.includes(q) ||
                cnic.includes(q) ||
                post.includes(q) ||
                dept.includes(q) ||
                email.includes(q);

            if (!matches) return false;
        }

        return true;
    });
}

/**
 * Builds rows of extracted fields for preview or Excel.
 * Accessible for all data and available fields.
 */
export function buildExportRows(
    employees: any[],
    selectedFieldKeys: string[],
    isPrivilegedViewer = true
): { headers: string[]; rows: Record<string, any>[] } {
    const validFields: ExportFieldDef[] = selectedFieldKeys
        .map((k) => FIELD_MAP.get(k))
        .filter((f): f is ExportFieldDef => {
            if (!f) return false;
            if (f.isSensitive && !isPrivilegedViewer) return false;
            return true;
        });

    const headers = validFields.map((f) => f.label);

    const rows = employees.map((emp) => {
        // Ensure decrypted values are available
        const decryptedEmp = decryptEmployeeFields({ ...emp });
        const rowObj: Record<string, any> = {};
        for (const field of validFields) {
            rowObj[field.label] = field.extract(decryptedEmp);
        }
        return rowObj;
    });

    return { headers, rows };
}

/**
 * Generates an Excel workbook Buffer using XLSX.
 */
export function generateExcelBuffer(headers: string[], rows: Record<string, any>[]): Buffer {
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

    // Calculate auto column widths
    const colWidths = headers.map((header) => {
        let maxLen = header.length;
        for (const r of rows) {
            const val = r[header];
            if (val !== undefined && val !== null) {
                const len = String(val).length;
                if (len > maxLen) maxLen = len;
            }
        }
        return { wch: Math.min(Math.max(maxLen + 3, 14), 60) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Directory');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
