export interface MedicalAccrualSummary {
    monthlyAllowance: number;
    eligibleMonths: number;
    accruedBalance: number;
    annualCap: number;
    openingBalanceUtilized: number;
    ytdApproved: number;
    ytdPending: number;
    totalUtilized: number;
    remainingBalance: number;
    utilizationPct: number;
    isMaxedOut: boolean;
    isMidYearJoiner: boolean;
    joiningDate?: Date | null;
}

/**
 * Calculates the monthly accrued medical balance for an employee based on company policy:
 * - Default monthly medical allowance: PKR 5,000 / month (or custom employee allowance / annual limit / 12)
 * - Accrues on a monthly basis across the calendar year (Jan 1 to Dec 31)
 * - Pro-rated for mid-year joiners from their appointment / joining month
 * - Total Accrued = Eligible Months * Monthly Allowance
 * - Remaining Balance = max(0, Total Accrued - (Opening Balance Utilized + YTD Approved Claims))
 */
export function calculateEmployeeMedicalAccrual(
    emp: any,
    claims: any[] = [],
    asOfDate: Date = new Date(),
    defaultAnnualLimit: number = 60000
): MedicalAccrualSummary {
    const currentYear = asOfDate.getFullYear();
    const asOfMonth = asOfDate.getMonth(); // 0 = Jan, 11 = Dec

    // Determine monthly allowance
    let monthlyAllowance = 5000;
    if (emp?.medicalBenefit?.customMonthlyAllowance && emp.medicalBenefit.customMonthlyAllowance > 0) {
        monthlyAllowance = emp.medicalBenefit.customMonthlyAllowance;
    } else if (emp?.medicalBenefit?.customAnnualLimit && emp.medicalBenefit.customAnnualLimit > 0) {
        monthlyAllowance = Math.round(emp.medicalBenefit.customAnnualLimit / 12);
    } else if (defaultAnnualLimit > 0) {
        monthlyAllowance = Math.round(defaultAnnualLimit / 12);
    }

    // Determine eligible accrued months in current calendar year
    let isMidYearJoiner = false;
    let eligibleMonths = asOfMonth + 1; // Default for existing employees (Jan to asOfMonth)
    const joiningDate = emp?.jobInfo?.joiningDate ? new Date(emp.jobInfo.joiningDate) : null;

    if (joiningDate && !isNaN(joiningDate.getTime())) {
        const joiningYear = joiningDate.getFullYear();
        if (joiningYear === currentYear) {
            isMidYearJoiner = true;
            const joiningMonth = joiningDate.getMonth();
            if (joiningDate > asOfDate) {
                // Future hire, not yet active
                eligibleMonths = 0;
            } else {
                eligibleMonths = Math.max(0, Math.min(12, asOfMonth - joiningMonth + 1));
            }
        } else if (joiningYear > currentYear) {
            eligibleMonths = 0;
        } else {
            eligibleMonths = Math.min(12, asOfMonth + 1);
        }
    } else {
        eligibleMonths = Math.min(12, asOfMonth + 1);
    }

    const accruedBalance = eligibleMonths * monthlyAllowance;
    const annualCap = 12 * monthlyAllowance;

    const openingBalanceUtilized = Number(emp?.medicalBenefit?.openingBalanceUtilized) || 0;

    // Filter medical claims within current calendar year
    const startOfYear = new Date(currentYear, 0, 1).getTime();
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999).getTime();

    const empClaims = (claims || []).filter((c: any) => {
        if (c.category !== 'Medical') return false;
        const d = c.createdAt ? new Date(c.createdAt).getTime() : (c.expenseDate ? new Date(c.expenseDate).getTime() : 0);
        return d >= startOfYear && d <= endOfYear;
    });

    const approvedClaims = empClaims.filter((c: any) => c.status === 'Approved');
    const pendingClaims = empClaims.filter((c: any) =>
        c.status !== 'Approved' && c.status !== 'Declined' && c.status !== 'Draft' && c.status !== 'Cancelled'
    );

    const ytdApproved = approvedClaims.reduce((sum: number, c: any) => {
        const amt = typeof c.approvedTotal === 'number' ? c.approvedTotal : (c.amountAllowed || 0);
        return sum + amt;
    }, 0);

    const ytdPending = pendingClaims.reduce((sum: number, c: any) => sum + (c.amountRequested || 0), 0);

    const totalUtilized = openingBalanceUtilized + ytdApproved;
    const remainingBalance = Math.max(0, accruedBalance - totalUtilized);
    const utilizationPct = accruedBalance > 0 ? Math.min(100, Math.round((totalUtilized / accruedBalance) * 100)) : 0;

    return {
        monthlyAllowance,
        eligibleMonths,
        accruedBalance,
        annualCap,
        openingBalanceUtilized,
        ytdApproved,
        ytdPending,
        totalUtilized,
        remainingBalance,
        utilizationPct,
        isMaxedOut: remainingBalance <= 0,
        isMidYearJoiner,
        joiningDate,
    };
}
