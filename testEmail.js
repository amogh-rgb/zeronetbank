const email = 'zeronetpay0@gmail.com'; // testing to self
const baseUrl = 'http://localhost:3001/email';

async function testEndpoint(name, path, body) {
    try {
        const res = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        console.log(`[${name}] Status: ${res.status}`, data);
    } catch (err) {
        console.error(`[${name}] Error:`, err.message);
    }
}

async function runTests() {
    console.log('Testing Email endpoints...');

    // 1. send-otp (register)
    await testEndpoint('OTP Register', '/send-otp', { email, purpose: 'register' });

    // 2. transaction confirmation
    await testEndpoint('Transaction Confirm', '/send-transaction-confirmation', {
        email,
        transactionId: 'test-txn-123',
        amount: 50.00,
        recipient: 'Alice',
        timestamp: Date.now(),
        type: 'sent'
    });

    // 3. login alert
    await testEndpoint('Login Alert', '/send-login-alert', {
        email,
        device: 'Testing Device',
        location: 'Localhost',
        ip: '127.0.0.1'
    });

    // 4. password reset
    await testEndpoint('Password Reset', '/send-password-reset', { email });

}

runTests();
