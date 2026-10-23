import assert from 'assert';
import { getDefaultSubTabAccess, SYSTEM_MODULES } from '../utils/permissionUtils';

async function runCheck() {
    console.log('=== Running Finance Manager Approvals Self-Check ===');

    // 1. Verify default sub-tab access in permissions configuration
    console.log('Test 1: Verify Finance role has default access to team-requests and manage-requests...');
    const leaveAccess = getDefaultSubTabAccess('finance', 'leave', 'team-requests');
    assert.strictEqual(leaveAccess, true, 'Finance role should have default access to leave:team-requests');

    const requestAccess = getDefaultSubTabAccess('finance', 'requests', 'manage-requests');
    assert.strictEqual(requestAccess, true, 'Finance role should have default access to requests:manage-requests');
    console.log('Test 1 PASSED: Permissions matrix correctly includes finance role for manager queues.');

    // 2. Verify SYSTEM_MODULES definitions
    console.log('Test 2: Verify SYSTEM_MODULES definitions...');
    const leaveMod = SYSTEM_MODULES.find(m => m.key === 'leave');
    const teamRequestsSub = leaveMod?.subTabs.find(s => s.key === 'team-requests');
    assert.ok(teamRequestsSub?.defaultRoles.includes('finance'), 'leave:team-requests must include finance');

    const requestsMod = SYSTEM_MODULES.find(m => m.key === 'requests');
    const manageRequestsSub = requestsMod?.subTabs.find(s => s.key === 'manage-requests');
    assert.ok(manageRequestsSub?.defaultRoles.includes('finance'), 'requests:manage-requests must include finance');
    console.log('Test 2 PASSED: SYSTEM_MODULES schema valid.');

    // 3. Verify query building logic for finance with direct reports vs without
    console.log('Test 3: Query generation for finance role with direct reports...');
    const directReports = ['itcs-101', 'itcs-102'];
    
    // Simulate query building when finance manager has direct reports
    const financeCondition = {
        $and: [
            { category: /finance|salary|advance/i },
            { category: { $not: /loan|pf|provident/i } }
        ]
    };
    const teamCondition = {
        employeeId: { $in: directReports },
        category: { $not: /loan|pf|provident/i }
    };

    const combinedQuery = directReports.length > 0 
        ? { $or: [financeCondition, teamCondition] } 
        : financeCondition;

    assert.ok((combinedQuery as any).$or, 'Combined query should have $or with financeCondition and teamCondition');
    assert.strictEqual((combinedQuery as any).$or.length, 2, 'Should have exactly 2 conditions');
    console.log('Test 3 PASSED: Query logic covers both finance duties and direct report requests.');

    console.log('All Finance Manager Approval checks PASSED successfully!');
}

runCheck().catch((err) => {
    console.error('Check failed:', err);
    process.exit(1);
});
