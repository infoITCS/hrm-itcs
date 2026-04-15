const ZKT_URL = 'http://192.168.0.74:8081';
const ZKT_TOKEN = 'da94d833ce195bd5fd82e64afe4b58b8e87b3f35';

async function testAuth(prefix, endpoint) {
    console.log(`\n--- Testing Prefix: ${prefix} on ${endpoint} ---`);

    const headers = {
        'Authorization': `${prefix} ${ZKT_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    try {
        const url = `${ZKT_URL}${endpoint}?page_size=1&start_date=2026-04-14&end_date=2026-04-14`;
        console.log(`Fetching: ${url}`);
        
        const res = await fetch(url, { headers });
        console.log(`Status: ${res.status} ${res.statusText}`);
        
        let body = '';
        try {
            body = await res.text();
        } catch (e) {
            body = '(could not read body)';
        }
        
        console.log('Response Body:', body);
        
        if (res.ok) {
            console.log(`✅ SUCCESS`);
        } else {
            console.log(`❌ FAILED`);
        }
    } catch (err) {
        console.error(`ERROR: ${err.message}`);
    }
}

async function run() {
    // Test Transaction Log (Reading Raw Punches)
    await testAuth('Token', '/iclock/api/transactions/');
    
    // Test Calculated Report (BioTime specific)
    await testAuth('Token', '/att/api/transactionReport/');
}

run();
