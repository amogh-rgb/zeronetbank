const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET',
};

let success = 0;
let blocked = 0;
const total = 120; // Limit is 100

function makeRequest(i) {
    const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
            success++;
        } else if (res.statusCode === 429) {
            blocked++;
        }

        if (success + blocked === total) {
            console.log(`\nResults:`);
            console.log(`Success: ${success}`);
            console.log(`Blocked: ${blocked}`);
            if (blocked > 0) {
                console.log('✅ Rate Limiting is active!');
            } else {
                console.log('❌ Rate Limiting FAILED. No requests were blocked.');
            }
        }
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    req.end();
}

console.log(`Sending ${total} requests...`);
for (let i = 0; i < total; i++) {
    makeRequest(i);
}
