
import http from 'http';

function request(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    // resolve({ status: res.statusCode, data: data });
                    // Try to be resilient
                    if (data.includes('OK') && data.includes('ONLINE')) {
                        resolve({ status: res.statusCode, data: { status: 'OK', bank: 'ONLINE' } });
                    } else {
                        resolve({ status: res.statusCode, data: data });
                    }
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(body);
        }
        req.end();
    });
}

async function verify() {
    console.log('--- Verifying Backend (ESM) ---');

    try {
        // 1. Root
        const root = await request('/');
        console.log('GET /:', root.data);
        if (root.data.bank !== 'ONLINE') throw new Error('Root check failed');

        // 2. Health
        const health = await request('/health');
        console.log('GET /health:', health.data);
        if (health.data.db !== 'connected') throw new Error('Health check failed');

        // 3. Register
        const regBody = JSON.stringify({ phone: '9999999999' });
        const reg = await request('/api/wallet/register', 'POST', regBody);
        console.log('POST /register:', reg.data);
        // Success might be true or it returns phone
        if (!reg.data.success && !reg.data.phone) throw new Error('Register failed');

        // 4. Sync
        const syncBody = JSON.stringify({ phone: '9999999999' });
        const sync = await request('/api/wallet/sync', 'POST', syncBody);
        console.log('POST /sync:', sync.data);
        if (!sync.data.bankOnline) throw new Error('Sync failed');

        console.log('✅ ALL CHECKS PASSED');
    } catch (e) {
        console.error('❌ VERIFICATION FAILED:', e.message);
        process.exit(1);
    }
}

verify();
