import assert from 'assert';
import {
    calculateTenure,
    filterEmployeeDataset,
    buildExportRows,
    generateExcelBuffer,
    ALL_EXPORT_FIELDS
} from '../services/employeeExportService';

console.log('🧪 Starting Employee Export Service Self-Check Tests...');

// ── Test 1: Field Registry Completeness ──
{
    assert.ok(ALL_EXPORT_FIELDS.length >= 60, 'Should have at least 60 comprehensive employee fields');
    const fieldKeys = new Set(ALL_EXPORT_FIELDS.map((f) => f.key));
    assert.ok(fieldKeys.has('cnic'), 'CNIC field must be present');
    assert.ok(fieldKeys.has('maritalStatus'), 'Marital Status field must be present');
    assert.ok(fieldKeys.has('joiningDate'), 'Joining Date field must be present');
    assert.ok(fieldKeys.has('tenureYears'), 'Tenure Years field must be present');
    assert.ok(fieldKeys.has('dependents'), 'Dependents field must be present');
    assert.ok(fieldKeys.has('confirmedSalary'), 'Confirmed Salary field must be present');
    assert.ok(fieldKeys.has('shiftName'), 'Shift field must be present');
    assert.ok(fieldKeys.has('age'), 'Age field must be present');
    assert.ok(fieldKeys.has('permanentStreet'), 'Permanent Street field must be present');

    console.log(`✅ Test 1 Passed: Field registry contains ${ALL_EXPORT_FIELDS.length} fields across all data categories`);
}

// ── Test 2: Tenure Calculation ──
{
    const now = new Date();
    // 4 years ago
    const fourYearsAgo = new Date(now.getFullYear() - 4, now.getMonth(), now.getDate());
    const tenure4 = calculateTenure(fourYearsAgo);
    assert.ok(tenure4.years >= 3.9 && tenure4.years <= 4.1, '4 years ago should calculate ~4.0 years');
    assert.ok(tenure4.formatted.includes('4 Years'), 'Formatted tenure should mention 4 Years');

    // 6 months ago
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const tenureHalf = calculateTenure(sixMonthsAgo);
    assert.ok(tenureHalf.years >= 0.4 && tenureHalf.years <= 0.6, '6 months ago should calculate ~0.5 years');

    console.log('✅ Test 2 Passed: Dynamic tenure calculation accurate');
}

// ── Test 3: Filter Dataset (Marital Status, Tenure, Dependents) ──
{
    const now = new Date();
    const fourYearsAgo = new Date(now.getFullYear() - 4, now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const mockEmployees = [
        {
            employeeId: 'ITCS-0001',
            firstName: 'Ali',
            lastName: 'Khan',
            maritalStatus: 'Single',
            cnic: '37405-1234567-1',
            jobInfo: { department: 'Engineering', joiningDate: fourYearsAgo },
            employmentStatus: { status: 'Permanent' },
            dependents: []
        },
        {
            employeeId: 'ITCS-0002',
            firstName: 'Sara',
            lastName: 'Ahmed',
            maritalStatus: 'Married',
            cnic: '37405-7654321-2',
            jobInfo: { department: 'HR', joiningDate: fourYearsAgo },
            employmentStatus: { status: 'Permanent' },
            dependents: [{ name: 'Zaid', relation: 'Son', dateOfBirth: new Date('2019-01-01') }]
        },
        {
            employeeId: 'ITCS-0003',
            firstName: 'Usman',
            lastName: 'Tariq',
            maritalStatus: 'Single',
            cnic: '37405-9999999-3',
            jobInfo: { department: 'Engineering', joiningDate: sixMonthsAgo },
            employmentStatus: { status: 'Probation' },
            dependents: []
        }
    ];

    // Filter by Marital Status: Married
    const married = filterEmployeeDataset(mockEmployees, { maritalStatus: 'Married' });
    assert.strictEqual(married.length, 1, 'Should find 1 married employee');
    assert.strictEqual(married[0].employeeId, 'ITCS-0002');

    // Filter by Tenure: > 3 Years (gt3)
    const senior = filterEmployeeDataset(mockEmployees, { tenureCategory: 'gt3' });
    assert.strictEqual(senior.length, 2, 'Should find 2 employees with > 3 years tenure');

    // Filter by Tenure: < 1 Year (lt1)
    const newJoiners = filterEmployeeDataset(mockEmployees, { tenureCategory: 'lt1' });
    assert.strictEqual(newJoiners.length, 1, 'Should find 1 employee with < 1 year tenure');
    assert.strictEqual(newJoiners[0].employeeId, 'ITCS-0003');

    // Filter by Dependents: Has Dependents
    const withDeps = filterEmployeeDataset(mockEmployees, { hasDependents: 'yes' });
    assert.strictEqual(withDeps.length, 1, 'Should find 1 employee with dependents');
    assert.strictEqual(withDeps[0].employeeId, 'ITCS-0002');

    console.log('✅ Test 3 Passed: Filtering on marital status, tenure categories, and dependents accurate');
}

// ── Test 4: Row Extraction & Sensitive Field Redaction ──
{
    const mockEmp = {
        employeeId: 'ITCS-0002',
        firstName: 'Sara',
        lastName: 'Ahmed',
        maritalStatus: 'Married',
        cnic: '37405-7654321-2',
        jobInfo: { department: 'HR', designation: 'HR Manager' },
        financeInfo: { confirmedSalary: 150000 },
        dependents: [{ name: 'Zaid', relation: 'Son', dateOfBirth: new Date('2019-01-01') }]
    };

    const selectedKeys = ['employeeId', 'fullName', 'cnic', 'maritalStatus', 'dependents', 'confirmedSalary'];

    // Privileged viewer (HR / Admin) -> receives salary
    const privileged = buildExportRows([mockEmp], selectedKeys, true);
    assert.strictEqual(privileged.headers.includes('Confirmed Monthly Salary (PKR)'), true);
    assert.strictEqual(privileged.rows[0]['Confirmed Monthly Salary (PKR)'], 150000);
    assert.ok(privileged.rows[0]['Dependents (Details: Name, Relation, DOB)'].includes('Zaid (Son'));

    // Non-privileged viewer -> sensitive fields redacted
    const unprivileged = buildExportRows([mockEmp], selectedKeys, false);
    assert.strictEqual(unprivileged.headers.includes('Confirmed Monthly Salary (PKR)'), false);

    console.log('✅ Test 4 Passed: Row extraction, dependents formatting, and role-based confidentiality verified');
}

// ── Test 5: Excel Generation (.xlsx) ──
{
    const headers = ['Employee ID', 'Full Name', 'CNIC', 'Marital Status', 'Dependents'];
    const rows = [
        {
            'Employee ID': 'ITCS-0001',
            'Full Name': 'Sara Ahmed',
            'CNIC': '37405-7654321-2',
            'Marital Status': 'Married',
            'Dependents': 'Zaid (Son)'
        }
    ];

    const buffer = generateExcelBuffer(headers, rows);
    assert.ok(Buffer.isBuffer(buffer), 'Output must be a Buffer');
    assert.ok(buffer.length > 500, 'Excel buffer must have content');
    // Check ZIP magic header for .xlsx (PK\x03\x04)
    assert.strictEqual(buffer[0], 0x50, 'ZIP byte 0');
    assert.strictEqual(buffer[1], 0x4b, 'ZIP byte 1');
    assert.strictEqual(buffer[2], 0x03, 'ZIP byte 2');
    assert.strictEqual(buffer[3], 0x04, 'ZIP byte 3');

    console.log('✅ Test 5 Passed: Excel (.xlsx) workbook successfully generated with valid magic bytes');
}

console.log('\n🎉 ALL EMPLOYEE EXPORT SERVICE TESTS PASSED!');
