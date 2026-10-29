import assert from 'assert';

console.log('🧪 Starting Attendance Manual Override Self-Check...');

// Simulate repository upsertRecord logic
function simulateUpsertRecord(
    existing: { status: string; manuallyAdjusted?: boolean } | null,
    data: { status: string; manuallyAdjusted?: boolean; note?: string }
) {
    if (!data?.manuallyAdjusted && existing?.manuallyAdjusted) {
        return existing; // Protected from automated background sync
    }
    return {
        ...existing,
        ...data,
    };
}

// ── Test 1: Background sync CANNOT overwrite an already manually adjusted record ──
{
    const existing = { status: 'Present (WFH)', manuallyAdjusted: true };
    const bgSyncData = { status: 'Absent', note: 'No biometric punches' }; // manuallyAdjusted is undefined

    const result = simulateUpsertRecord(existing, bgSyncData);
    assert.strictEqual(result.status, 'Present (WFH)', 'Background sync must NOT overwrite HR manual adjustment');
    assert.strictEqual(result.manuallyAdjusted, true);
    console.log('✅ Test 1 Passed: Automated machine sync preserves HR manual adjustment');
}

// ── Test 2: HR manual edit CAN change status from Absent to Present/WFH even if previously manually adjusted ──
{
    const existing = { status: 'Absent', manuallyAdjusted: true };
    const hrManualEdit = { status: 'Present', manuallyAdjusted: true, isWfh: true, note: 'Working remotely' };

    const result = simulateUpsertRecord(existing, hrManualEdit);
    assert.strictEqual(result.status, 'Present', 'HR manual edit MUST update status from Absent to Present');
    assert.strictEqual(result.manuallyAdjusted, true);
    console.log('✅ Test 2 Passed: HR manual edit successfully overrides existing manual Absent status');
}

// ── Test 3: Background sync CAN create/update records when not manually adjusted ──
{
    const existing = { status: 'Incomplete', manuallyAdjusted: false };
    const bgSyncData = { status: 'Present', manuallyAdjusted: false };

    const result = simulateUpsertRecord(existing, bgSyncData);
    assert.strictEqual(result.status, 'Present', 'Background sync must update non-manually adjusted records');
    console.log('✅ Test 3 Passed: Background sync works normally on standard records');
}

console.log('🎉 All Attendance Manual Override Self-Checks PASSED successfully!');

