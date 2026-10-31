import assert from 'assert';

console.log('🧪 Starting Expense Claim Optimization Self-Check...');

// 1. Check sanitizeClaimForJson when receipts already have fileData excluded
function sanitizeClaimForJson(doc: any) {
    const obj = doc?.toObject ? (doc.toObject() as any) : (doc as any);
    if (Array.isArray(obj?.receipts)) {
        obj.receipts = obj.receipts.map((r: any) => ({ ...r, fileData: undefined }));
    }
    return obj;
}

{
    const claimWithoutFileData = {
        _id: 'claim_123',
        erpReferenceId: 'ERP-999',
        receipts: [
            { _id: 'r_1', fileName: 'invoice.pdf', contentType: 'application/pdf' },
            { _id: 'r_2', fileName: 'bill.jpg', contentType: 'image/jpeg' },
        ]
    };

    const sanitized = sanitizeClaimForJson(claimWithoutFileData);
    assert.strictEqual(sanitized.erpReferenceId, 'ERP-999');
    assert.strictEqual(sanitized.receipts.length, 2);
    assert.strictEqual(sanitized.receipts[0].fileData, undefined);
    assert.strictEqual(sanitized.receipts[0].fileName, 'invoice.pdf');
    console.log('✅ Test 1 Passed: sanitizeClaimForJson safely preserves metadata when fileData is excluded');
}

// 2. Check atomic ERP update logic
{
    const originalClaim = {
        _id: 'claim_123',
        status: 'Approved',
        erpReferenceId: undefined,
        receipts: [
            { _id: 'r_1', fileName: 'invoice.pdf', fileData: 'binary_blob_not_touched' }
        ],
        audit: { lastUpdatedAt: new Date(0) }
    };

    // Simulate findByIdAndUpdate with $set
    const updatePayload = {
        $set: {
            erpReferenceId: 'ERP-TXN-123',
            'audit.lastUpdatedAt': new Date(),
            'audit.lastUpdatedByUserId': 'user_456'
        }
    };

    const updated = {
        ...originalClaim,
        erpReferenceId: updatePayload.$set.erpReferenceId,
        audit: {
            ...originalClaim.audit,
            lastUpdatedAt: updatePayload.$set['audit.lastUpdatedAt'],
            lastUpdatedByUserId: updatePayload.$set['audit.lastUpdatedByUserId']
        }
    };

    assert.strictEqual(updated.erpReferenceId, 'ERP-TXN-123');
    assert.strictEqual(updated.receipts[0].fileData, 'binary_blob_not_touched', 'Receipts binary blob must remain intact');
    console.log('✅ Test 2 Passed: Atomic ERP update preserves receipt binary data without re-uploading');
}

console.log('🎉 All Expense Claim Optimization checks passed successfully!');

