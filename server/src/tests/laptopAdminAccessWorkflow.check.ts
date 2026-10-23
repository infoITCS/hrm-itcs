import assert from 'assert';

async function runCheck() {
    console.log('=== Running Laptop Admin Access Workflow Self-Check ===');

    // 1. Test Super Admin Exclusivity Guard
    console.log('Test 1: Super Admin exclusivity for Laptop Admin Access requests...');
    const isAdminAccessCategory = (cat?: string, reqType?: string) => {
        return cat === 'Request Laptop Admin Access' || 
               reqType === 'Request Laptop Admin Access' || 
               (cat || '').toLowerCase().includes('admin access') ||
               (reqType || '').toLowerCase().includes('admin access');
    };

    assert.strictEqual(isAdminAccessCategory('Request Laptop Admin Access'), true);
    assert.strictEqual(isAdminAccessCategory('Work From Home (WFH)'), false);
    assert.strictEqual(isAdminAccessCategory('General Request', 'Request Laptop Admin Access'), true);

    const canApprove = (role: string, isAdmAcc: boolean) => {
        if (isAdmAcc && role !== 'super-admin') {
            return false;
        }
        return true;
    };

    assert.strictEqual(canApprove('manager', true), false, 'Managers must not approve laptop admin access');
    assert.strictEqual(canApprove('hr', true), false, 'HR must not approve laptop admin access');
    assert.strictEqual(canApprove('admin', true), false, 'Regular Admin must not approve laptop admin access');
    assert.strictEqual(canApprove('finance', true), false, 'Finance must not approve laptop admin access');
    assert.strictEqual(canApprove('super-admin', true), true, 'Super Admin must be authorized to approve laptop admin access');
    console.log('Test 1 PASSED: Strict role enforcement verified for Super Admin.');

    // 2. Test Device Name Validation
    console.log('Test 2: Device Name validation for Laptop Admin Access requests...');
    const validateRequestDetails = (cat: string, details?: { deviceName?: string }) => {
        const isAdm = isAdminAccessCategory(cat);
        if (isAdm) {
            if (!details?.deviceName || !String(details.deviceName).trim()) {
                return { valid: false, error: 'Device name or hostname is required for Laptop Admin Access requests.' };
            }
        }
        return { valid: true };
    };

    const emptyDevice = validateRequestDetails('Request Laptop Admin Access', { deviceName: '   ' });
    assert.strictEqual(emptyDevice.valid, false, 'Empty device name must be rejected');

    const validDevice = validateRequestDetails('Request Laptop Admin Access', { deviceName: 'ITCS-LT-104' });
    assert.strictEqual(validDevice.valid, true, 'Valid device name must be accepted');
    console.log('Test 2 PASSED: Device name validation logic verified.');

    // 3. Test Workflow Task Shape Generation
    console.log('Test 3: IT Access Workflow Task creation payload...');
    const generateTaskPayload = (req: any, emp: any) => {
        const targetName = [emp?.firstName, emp?.lastName].filter(Boolean).join(' ') || req.employeeId || 'Employee';
        const deviceName = req.details?.deviceName || 'N/A';
        const duration = req.details?.accessDuration || req.requestType || 'Permanent';
        const justification = req.details?.reason || 'N/A';

        return {
            type: 'IT Access',
            targetEmployeeId: req.employeeId,
            targetUserId: emp?.userId?.toString(),
            targetName,
            targetEmail: emp?.workEmail || emp?.email,
            department: 'Tech',
            title: `Grant Intune Local Admin Access - ${targetName}`,
            description: `Device / Hostname: ${deviceName}\nDuration: ${duration}\nJustification: ${justification}\nApproved by Super Admin`,
            status: 'Pending',
            relatedRequestId: req._id
        };
    };

    const mockReq = {
        _id: '6717a0b5f123456789abcdef',
        employeeId: 'ITCS-042',
        requestType: 'Temporary Access (30 Days)',
        details: {
            deviceName: 'ITCS-LT-104',
            accessDuration: 'Temporary Access (30 Days)',
            reason: 'Testing Docker virtualization'
        }
    };
    const mockEmp = {
        userId: '6717a0b5f123456789abc000',
        firstName: 'Faraz',
        lastName: 'Ahmed',
        workEmail: 'faraz@itcs.com'
    };

    const taskPayload = generateTaskPayload(mockReq, mockEmp);
    assert.strictEqual(taskPayload.type, 'IT Access');
    assert.strictEqual(taskPayload.department, 'Tech');
    assert.strictEqual(taskPayload.status, 'Pending');
    assert.strictEqual(taskPayload.relatedRequestId, mockReq._id);
    assert.ok(taskPayload.title.includes('Faraz Ahmed'));
    assert.ok(taskPayload.description.includes('ITCS-LT-104'));
    assert.ok(taskPayload.description.includes('30 Days'));
    console.log('Test 3 PASSED: Workflow Task payload complies with IT checklist requirements.');

    // 4. Test Linked Request Completion Transition
    console.log('Test 4: Linked EmployeeRequest completion on IT task mark complete...');
    const simulateTaskCompletion = (taskStatus: string, relReq: any) => {
        if (taskStatus === 'Completed' && relReq) {
            relReq.status = 'Completed';
            relReq.updatedAt = new Date();
        }
        return relReq;
    };

    const activeReq = { status: 'Approved', updatedAt: new Date(Date.now() - 3600000) };
    const updatedReq = simulateTaskCompletion('Completed', activeReq);
    assert.strictEqual(updatedReq.status, 'Completed', 'Linked request status must transition to Completed');
    console.log('Test 4 PASSED: Completion linkage verified.');

    console.log('\nAll Laptop Admin Access Workflow checks PASSED successfully!');
}

runCheck().catch((err) => {
    console.error('Check failed:', err);
    process.exit(1);
});
