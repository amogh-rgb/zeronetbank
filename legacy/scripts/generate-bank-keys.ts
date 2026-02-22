/**
 * Generate Bank ECDSA P-256 Key Pair
 * 
 * Usage: npm run generate-bank-keys
 * 
 * This script:
 * 1. Generates secure ECDSA P-256 key pair
 * 2. Stores private key securely (mode 600)
 * 3. Stores public key
 * 4. Outputs fingerprints for verification
 */

import { BankCryptoService } from '../services/bank-crypto.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function getFingerprint(publicKey: string): string {
  return crypto
    .createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .substring(0, 16)
    .toUpperCase();
}

async function main() {
  try {
    console.log(`
╔════════════════════════════════════════════════════╗
║   ZeroNetBank - Generate Bank Keys                ║
║   ECDSA P-256 (256-bit Elliptic Curve)           ║
╚════════════════════════════════════════════════════╝
    `);

    console.log('⏳ Generating key pair...');
    const keyPair = BankCryptoService.generateKeyPair();

    const fingerprint = getFingerprint(keyPair.publicKey);

    console.log(`
✅ Bank Key Pair Generated Successfully!

📋 Key Details:
   Algorithm: ${keyPair.algorithm}
   Generated: ${keyPair.generatedAt.toISOString()}
   Public Key Fingerprint: ${fingerprint}

🔐 Key Locations:
   Private Key: ./secrets/bank-private-key.pem (mode 600)
   Public Key:  ./secrets/bank-public-key.pem (mode 644)

⚠️  CRITICAL:
   ✓ Private key is readable ONLY by the process owner
   ✓ Backup the private key securely (HSM or encrypted vault)
   ✓ Rotate keys annually
   ✓ Never commit keys to git

📝 Next Steps:
   1. Set BANK_PRIVATE_KEY_PATH in .env
   2. Set BANK_PUBLIC_KEY_PATH in .env
   3. Run: npm run migrate
   4. Run: npm run dev
    `);

    // Also output the public key for verification
    console.log('Public Key (for wallet verification):');
    console.log(keyPair.publicKey);

  } catch (error) {
    console.error('❌ Failed to generate keys:', error);
    process.exit(1);
  }
}

main();
