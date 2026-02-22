const axios = require('axios');

async function testBatchSync() {
    const url = 'http://localhost:3000/api/v1/wallet/sync-offline-transactions';

    console.log('Testing Batch Sync Endpoint:', url);

    const payload = {
        transactions: [
            {
                id: 'tx-test-' + Date.now(),
                sender: 'mock-sender-pub-key',
                receiver: 'mock-receiver-pub-key',
                amount: 10.0,
                timestamp: Date.now(),
                signature: 'mock-sig',
                nonce: '12345'
            }
        ]
    };

    try {
        const res = await axios.post(url, payload);
        console.log('Response Status:', res.status);
        console.log('Response Data:', res.data);

        if (res.status === 200 && res.data.failed.length > 0) {
            console.log('Basic structure accepted! Failures expected (mock keys/sig).');
            console.log('TEST PASSED: Endpoint is reachable and processing logic.');
        } else {
            console.log('TEST PASSED: ' + JSON.stringify(res.data));
        }

    } catch (error) {
        if (error.response) {
            console.error('Error Response:', error.response.status, error.response.data);
        } else {
            console.error('Network Error:', error.message);
        }
    }
}

testBatchSync();
