import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { SmartGoal, CompanyTarget } from '../models/SmartGoal';
import { performAiGoalReview } from '../services/aiGoalReviewService';

async function runSelfCheck() {
    console.log('=== Running SMART Goal Workflow Self-Check ===');

    // 1. Check AI Pre-Review logic with a realistic goal
    console.log('Test 1: Evaluating realistic 15% increase goal...');
    const realisticInput = {
        title: 'Increase Q2 enterprise software subscriptions by 15%',
        description: 'Expand outbound sales efforts to acquire 15 additional client accounts aligned with company revenue target.',
        metricType: 'PERCENTAGE',
        unit: '%',
        baselineValue: 100,
        targetValue: 115,
        companyTargetTitle: 'PKR 2 Billion Total Sales & Revenue Target',
        targetDate: new Date('2026-12-31'),
    };
    const realisticResult = await performAiGoalReview(realisticInput);
    console.log('Realistic AI Review result:', {
        status: realisticResult.status,
        complianceScore: realisticResult.complianceScore,
        isUnrealistic: realisticResult.isUnrealistic,
        feedback: realisticResult.feedback,
        suggestedAdjustments: realisticResult.suggestedAdjustments,
    });
    assert.strictEqual(realisticResult.isUnrealistic, false, 'Realistic goal should not be flagged as unrealistic');
    assert.ok(realisticResult.complianceScore >= 50, 'Compliance score should be reasonable (>= 50)');
    console.log('Test 1 PASSED.');

    // 2. Check AI Pre-Review logic with an unrealistic 50-fold jump
    console.log('Test 2: Evaluating unrealistic 50-fold jump goal...');
    const unrealisticInput = {
        title: 'Increase monthly sales 50-fold from 10 to 500 deals',
        description: 'Close 500 enterprise deals in a single quarter starting from 10 deals.',
        metricType: 'NUMBER',
        unit: 'Deals',
        baselineValue: 10,
        targetValue: 500, // 50x jump
        companyTargetTitle: 'PKR 2 Billion Total Sales & Revenue Target',
        targetDate: new Date('2026-06-30'),
    };
    const unrealisticResult = await performAiGoalReview(unrealisticInput);
    console.log('Unrealistic AI Review result:', {
        status: unrealisticResult.status,
        complianceScore: unrealisticResult.complianceScore,
        isUnrealistic: unrealisticResult.isUnrealistic,
        feedback: unrealisticResult.feedback,
    });
    assert.strictEqual(unrealisticResult.isUnrealistic, true, '50-fold jump must be flagged as unrealistic');
    console.log('Test 2 PASSED.');

    // 3. Connect to DB and verify SmartGoal pre-save SLA & progress calculations
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.warn('MONGODB_URI not set, skipping DB persistence check.');
        return;
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME || 'hrm' });

    console.log('Test 3: Testing 10-day HR SLA deadline computation and Mid-Year progress calculations...');
    const submittedAt = new Date();
    const testGoal = new SmartGoal({
        employee: new mongoose.Types.ObjectId(),
        employeeId: 'TEST-EMP-999',
        employeeName: 'Self Check Employee',
        cycleYear: 2026,
        cycleType: 'MID_YEAR',
        title: 'Complete 20 Security Audits',
        description: 'Audit internal infrastructure modules against ISO/SOC-2 benchmarks.',
        metricType: 'NUMBER',
        unit: 'Audits',
        baselineValue: 0,
        targetValue: 20,
        currentValue: 0,
        targetDate: new Date('2026-06-30'),
        aiReview: realisticResult,
        hrReview: {
            status: 'PENDING_HR',
            submittedAt,
        },
        status: 'PENDING_HR',
    });

    await testGoal.save();

    // Verify 10-day deadline
    assert.ok(testGoal.hrReview.deadline, 'Deadline must be auto-computed');
    const diffDays = Math.round((testGoal.hrReview.deadline.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24));
    assert.strictEqual(diffDays, 10, `SLA deadline must be exactly 10 days, got ${diffDays}`);
    assert.strictEqual(testGoal.progressStatus, 'NOT_STARTED');
    console.log('10-day SLA auto-computation verified.');

    // Verify Mid-Year Progress Statuses: Behind (< 75%)
    testGoal.currentValue = 10; // 50%
    await testGoal.save();
    assert.strictEqual(testGoal.progressPercentage, 50);
    assert.strictEqual(testGoal.progressStatus, 'BEHIND', '50% progress should be BEHIND');

    // Verify Mid-Year Progress Statuses: On Track (75% - 104%)
    testGoal.currentValue = 16; // 80%
    await testGoal.save();
    assert.strictEqual(testGoal.progressPercentage, 80);
    assert.strictEqual(testGoal.progressStatus, 'ON_TRACK', '80% progress should be ON_TRACK');

    // Verify Mid-Year Progress Statuses: Ahead (>= 105%)
    testGoal.currentValue = 22; // 110%
    await testGoal.save();
    assert.strictEqual(testGoal.progressPercentage, 110);
    assert.strictEqual(testGoal.progressStatus, 'AHEAD', '110% progress should be AHEAD');
    console.log('Mid-Year comparative progress calculations verified.');

    // Test 4: Verify Company Target Create, Edit, and Delete
    console.log('Test 4: Testing Company Target management...');
    const testTarget = await CompanyTarget.create({
        title: 'Original Corporate Sales Anchor',
        category: 'SALES',
        targetMetric: 'Revenue',
        targetValue: 'PKR 1 Billion',
        year: 2026,
    });
    assert.ok(testTarget._id, 'Target created');

    // Update target
    testTarget.title = 'Updated Corporate Sales Anchor (PKR 2.5B)';
    testTarget.targetValue = 'PKR 2.5 Billion';
    await testTarget.save();
    const updatedTarget = await CompanyTarget.findById(testTarget._id);
    assert.strictEqual(updatedTarget?.title, 'Updated Corporate Sales Anchor (PKR 2.5B)');
    assert.strictEqual(updatedTarget?.targetValue, 'PKR 2.5 Billion');

    // Delete target
    await CompanyTarget.findByIdAndDelete(testTarget._id);
    const deletedTarget = await CompanyTarget.findById(testTarget._id);
    assert.strictEqual(deletedTarget, null, 'Target should be deleted');
    console.log('Company Target management verified.');

    // Test 5: Verify Goal Deletion
    console.log('Test 5: Testing SMART Goal deletion...');
    await SmartGoal.findByIdAndDelete(testGoal._id);
    const deletedGoal = await SmartGoal.findById(testGoal._id);
    assert.strictEqual(deletedGoal, null, 'Goal should be deleted');
    console.log('SMART Goal deletion verified.');

    await mongoose.disconnect();

    console.log('=== All SMART Goal Workflow Self-Checks PASSED Successfully! ===');
}

runSelfCheck().catch((err) => {
    console.error('Self-check FAILED:', err);
    process.exit(1);
});
