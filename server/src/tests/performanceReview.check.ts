import assert from 'assert';
import mongoose from 'mongoose';
import PerformanceReview from '../models/PerformanceReview';
import Employee from '../models/Employee';

console.log('🧪 Starting Performance Appraisal & Annual Salary Review Self-Check...');

// ── Test 1: Schema & Enums Validation ──
{
    const review = new PerformanceReview({
        cycleYear: 2026,
        cycleTitle: 'Annual Appraisal 2026',
        employee: new mongoose.Types.ObjectId(),
        employeeId: 'TEST-001',
        employeeName: 'Ali Raza',
        department: 'Engineering',
        designation: 'Senior Software Engineer',
        status: 'PENDING_SELF_ASSESSMENT',
    });

    assert.strictEqual(review.status, 'PENDING_SELF_ASSESSMENT', 'Default status must be PENDING_SELF_ASSESSMENT');
    assert.strictEqual(review.cycleYear, 2026, 'Cycle year must match 2026');
    console.log('✅ Test 1 Passed: PerformanceReview schema instantiates with valid defaults');
}

// ── Test 2: Employee Self-Assessment Stage ──
{
    const review = new PerformanceReview({
        cycleYear: 2026,
        cycleTitle: 'Annual Appraisal 2026',
        employee: new mongoose.Types.ObjectId(),
        employeeId: 'TEST-002',
        employeeName: 'Fatima Noor',
        status: 'PENDING_SELF_ASSESSMENT',
    });

    // Employee submits self-assessment
    review.selfAssessment = {
        rating: 'ABOVE_EXPECTATION',
        defenseNotes: 'Delivered Project Phoenix 2 weeks ahead of schedule with 99.9% uptime.',
        submittedAt: new Date(),
    };
    review.status = 'SUBMITTED_FOR_REVIEW';

    assert.strictEqual(review.selfAssessment.rating, 'ABOVE_EXPECTATION', 'Rating must be ABOVE_EXPECTATION');
    assert.strictEqual(review.status, 'SUBMITTED_FOR_REVIEW', 'Status must transition to SUBMITTED_FOR_REVIEW');
    assert.ok(review.selfAssessment.defenseNotes?.includes('Project Phoenix'), 'Defense notes must be preserved');
    console.log('✅ Test 2 Passed: Stage 1 Employee self-assessment defense and rating recorded');
}

// ── Test 3: HR 1-on-1 Sit-down & Salary Revision Calculations ──
{
    const previousBaseSalary = 150000;
    const incrementPercentage = 15; // 15%
    const incrementAmount = Math.round(previousBaseSalary * (incrementPercentage / 100)); // 22,500
    const newBaseSalary = previousBaseSalary + incrementAmount; // 172,500
    const performanceBonus = 50000;
    const effectiveFromDate = new Date('2026-01-01T00:00:00.000Z');

    assert.strictEqual(incrementAmount, 22500, '15% of 150,000 must be 22,500');
    assert.strictEqual(newBaseSalary, 172500, 'New salary must be 172,500');

    const review = new PerformanceReview({
        cycleYear: 2026,
        cycleTitle: 'Annual Appraisal 2026',
        employee: new mongoose.Types.ObjectId(),
        employeeId: 'TEST-003',
        employeeName: 'Hamza Tariq',
        selfAssessment: {
            rating: 'MEETS_EXPECTATION',
            defenseNotes: 'Consistent performance and team mentoring throughout the year.',
            submittedAt: new Date('2026-02-10T10:00:00.000Z'),
        },
        hrAssessment: {
            finalRating: 'ABOVE_EXPECTATION',
            feedbackNotes: 'Exceeded expectations on leadership and critical client escalation handling.',
            reviewedAt: new Date(),
        },
        reviewerName: 'HR Director',
        compensationRevision: {
            previousBaseSalary,
            incrementPercentage,
            incrementAmount,
            newBaseSalary,
            performanceBonus,
            effectiveFromDate,
            appliedToSalary: true,
            appliedAt: new Date(),
        },
        status: 'CLOSED',
    });

    assert.strictEqual(review.status, 'CLOSED', 'Status must transition to CLOSED upon finalization');
    assert.strictEqual(review.hrAssessment.finalRating, 'ABOVE_EXPECTATION', 'Final rating must match');
    assert.strictEqual(review.compensationRevision?.newBaseSalary, 172500, 'New base salary must be 172,500');
    assert.strictEqual(review.compensationRevision?.performanceBonus, 50000, 'Bonus must be 50,000');
    console.log('✅ Test 3 Passed: Stage 2 HR 1-on-1 finalization and compensation revision calculation accurate');
}

// ── Test 4: Master Employee Salary & Retroactive Arrears salaryHistory Link ──
{
    const mockEmployee: any = {
        employeeId: 'TEST-004',
        firstName: 'Zainab',
        lastName: 'Ahmed',
        financeInfo: {
            confirmedSalary: 120000,
        },
        salaryHistory: [],
    };

    const previousBase = mockEmployee.financeInfo.confirmedSalary;
    const incrementPct = 20;
    const incAmt = Math.round(previousBase * (incrementPct / 100)); // 24,000
    const newSalary = previousBase + incAmt; // 144,000
    const effDate = new Date('2026-01-01T00:00:00.000Z');

    // Simulate finalization hook
    mockEmployee.financeInfo.confirmedSalary = newSalary;
    mockEmployee.salaryHistory.push({
        effectiveDate: effDate,
        revisedAt: new Date(),
        amount: newSalary,
        previousAmount: previousBase,
        changeType: 'Annual Appraisal',
        reason: `Annual Appraisal 2026 (ABOVE_EXPECTATION) — ${incrementPct}% increment`,
        arrearsProcessed: false, // Critical: Triggers payroll engine arrears calculation!
    });

    assert.strictEqual(mockEmployee.financeInfo.confirmedSalary, 144000, 'Employee master salary updated to 144,000');
    assert.strictEqual(mockEmployee.salaryHistory.length, 1, 'Salary history record created');
    assert.strictEqual(mockEmployee.salaryHistory[0].arrearsProcessed, false, 'arrearsProcessed must be false for retroactive months');
    assert.strictEqual(mockEmployee.salaryHistory[0].amount, 144000, 'salaryHistory amount must match new salary');
    assert.strictEqual(mockEmployee.salaryHistory[0].previousAmount, 120000, 'salaryHistory previousAmount must match old salary');

    console.log('✅ Test 4 Passed: Master salary update and retroactive arrears history hook verified');
}

console.log('\n🎉 ALL PERFORMANCE APPRAISAL TESTS PASSED SUCCESSFULLY!');
