import { ec as EC } from 'elliptic';
import crypto from 'crypto';

// USE P-256 (secp256r1) to match Flutter PointyCastle
const ec = new EC('p256');

export class CryptoService {

    /**
     * Verify an ECDSA signature (P-256)
     * @param data The data string that was signed
     * @param signatureHex The 64-byte (r+s) or DER hex signature
     * @param publicKeyHex The hex public key (04...)
     */
    static verifySignature(data: string, signatureHex: string, publicKeyHex: string): boolean {
        try {
            if (!signatureHex || !publicKeyHex) return false;

            // 1. Hash the data (SHA-256) to match Flutter's signing input
            const msgHash = crypto.createHash('sha256').update(data).digest();
            const msgHashHex = msgHash.toString('hex');

            // 2. Import key
            const key = ec.keyFromPublic(publicKeyHex, 'hex');

            // 3. Parse Signature
            // Flutter PointyCastle usually produces a raw r+s concatenation (64 bytes for P-256)
            // Elliptic expects an object {r, s} or a DER string.
            // If signature is 128 chars (64 bytes), it's likely raw r|s.

            let signature: any = signatureHex;

            if (signatureHex.length === 128) {
                const r = signatureHex.substring(0, 64);
                const s = signatureHex.substring(64, 128);
                signature = { r, s };
            }

            // 4. Verify
            return key.verify(msgHash, signature);

        } catch (e) {
            console.error('Crypto Verification Error:', e);
            return false;
        }
    }

    /**
     * Sign data with Bank's Private Key
     * @param data Data to sign
     * @param privateKeyHex Bank's Private Key
     */
    static sign(data: string, privateKeyHex: string): string {
        const key = ec.keyFromPrivate(privateKeyHex, 'hex');
        const msgHash = crypto.createHash('sha256').update(data).digest();

        const signature = key.sign(msgHash);

        // Return formatted as r + s hex (64 bytes / 128 chars) to match app expectation
        const r = signature.r.toString(16).padStart(64, '0');
        const s = signature.s.toString(16).padStart(64, '0');

        return r + s;
    }

    /**
     * Generate a secure random ID
     */
    static generateId(): string {
        return crypto.randomBytes(16).toString('hex');
    }
}
