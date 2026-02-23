const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = envConfig;

if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    console.error('Missing DB config in .env');
    process.exit(1);
}

const dbUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT || 5432}/${DB_NAME}`;

if (!envConfig.DATABASE_URL) {
    fs.appendFileSync(envPath, `\nDATABASE_URL="${dbUrl}"\n`);
    console.log('Added DATABASE_URL to .env');
} else {
    console.log('DATABASE_URL already exists');
}
