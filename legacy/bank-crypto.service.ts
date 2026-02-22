/**
 * Bank Cryptographic Authority Service
 * 
 * Manages:
 * - ECDSA P-256 key generation
 * - Secure key storage
 * - Transaction signing
 * - Signature verification
 */

import { createPrivateKey, createPublicKey } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import elliptic from 'elliptic';
const EC = elliptic.ec;

export interface BankKeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
  generatedAt: Date;
}

export interface SignedData {
  data: any;
  signature: string;
  signedBy: string;
  signedAt: Date;
}

export class BankCryptoService {
  private privateKey: string | null = null;
  private publicKey: string | null = null;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  /**
   * Generate a new ECDSA P-256 key pair
   * Used for initial bank setup only
   */
  static generateKeyPair(): BankKeyPair {
    const privateKeyPath = path.join(process.cwd(), 'secrets', 'bank-private-key.pem');
    const publicKeyPath = path.join(process.cwd(), 'secrets', 'bank-public-key.pem');

    // CRITICAL: Use libssl to generate P-256 keys
    const { execSync } = require('child_process');

    try {
      // Ensure secrets directory exists
      const secretsDir = path.dirname(privateKeyPath);
      if (!fs.existsSync(secretsDir)) {
        fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
      }

      // Generate private key (P-256)
      execSync(`openssl ecparam -name prime256v1 -genkey -noout -out ${privateKeyPath}`, {
        stdio: 'pipe',
      });

      // Derive public key
      execSync(`openssl ec -in ${privateKeyPath} -pubout -out ${publicKeyPath}`, {
        stdio: 'pipe',
      });

      // Set proper permissions
      fs.chmodSync(privateKeyPath, 0o600);
      fs.chmodSync(publicKeyPath, 0o644);

      const privateKeyContent = fs.readFileSync(privateKeyPath, 'utf-8');
      const publicKeyContent = fs.readFileSync(publicKeyPath, 'utf-8');

      console.log('✅ Bank key pair generated');
      console.log(`   Private key: ${privateKeyPath} (mode 600)`);
      console.log(`   Public key: ${publicKeyPath} (mode 644)`);

      return {
        publicKey: publicKeyContent,
        privateKey: privateKeyContent,
        algorithm: 'ECDSA_P256',
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('❌ Failed to generate bank keys:', error);
      throw error;
    }
  }

  /**
   * Load bank keys from file system or HSM
   */
  async loadKeys(): Promise<void> {
    const useHSM = process.env.BANK_PRIVATE_KEY_HSM === 'true';

    if (useHSM) {
      this.logger.info('Loading bank keys from HSM...');
      // Implementation would use HSM library (e.g., AWS CloudHSM, Azure Key Vault)
      throw new Error('HSM key loading not implemented - use local keys for development');
    }

    const privateKeyPath = process.env.BANK_PRIVATE_KEY_PATH || './secrets/bank-private-key.pem';
    const publicKeyPath = process.env.BANK_PUBLIC_KEY_PATH || './secrets/bank-public-key.pem';

    try {
      if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Private key not found at ${privateKeyPath}`);
      }
      if (!fs.existsSync(publicKeyPath)) {
        throw new Error(`Public key not found at ${publicKeyPath}`);
      }

      this.privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
      this.publicKey = fs.readFileSync(publicKeyPath, 'utf-8');

      this.logger.info('✅ Bank keys loaded successfully');
    } catch (error) {
      this.logger.error('❌ Failed to load bank keys:', error);
      throw error;
    }
  }

  /**
   * Get public key for wallet verification
   */
  getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error('Public key not loaded');
    }
    return this.publicKey;
  }

  /**
   * Get public key as uncompressed hex (04 + X + Y)
   */
  getPublicKeyHex(): string {
    const jwk = this.exportJwk();
    const x = this.base64UrlToHex(jwk.x || '');
    const y = this.base64UrlToHex(jwk.y || '');
    return `04${x}${y}`;
  }

  /**
   * Sign data with bank private key
   */
  sign(data: any): string {
    if (!this.privateKey) {
      throw new Error('Private key not loaded');
    }

    try {
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      const hash = createHash('sha256').update(dataString).digest();

      const ec = new EC('p256');
      const jwk = this.exportJwk();
      const key = ec.keyFromPrivate(this.base64UrlToHex(jwk.d || ''), 'hex');
      const sig = key.sign(hash);

      const r = sig.r.toString('hex').padStart(64, '0');
      const s = sig.s.toString('hex').padStart(64, '0');

      return `${r}${s}`;
    } catch (error) {
      this.logger.error('Sign error:', error);
      throw error;
    }
  }

  /**
   * Verify signature with public key (bank's own key)
   */
  verifyBankSignature(data: any, signature: string): boolean {
    try {
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      const hash = createHash('sha256').update(dataString).digest();

      if (signature.length !== 128) {
        return false;
      }

      const r = signature.substring(0, 64);
      const s = signature.substring(64);

      const ec = new EC('p256');
      const pubKeyHex = this.getPublicKeyHex();
      const key = ec.keyFromPublic(pubKeyHex, 'hex');
      return key.verify(hash, { r, s });
    } catch (error) {
      this.logger.debug('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Verify wallet signature with wallet's public key
   */
  verifyWalletSignature(walletPublicKeyHex: string, data: any, signature: string): boolean {
    try {
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      const hash = createHash('sha256').update(dataString).digest();

      const curve = new EC('p256');
      const key = curve.keyFromPublic(walletPublicKeyHex, 'hex');

      if (signature.length !== 128) {
        return false;
      }

      const r = signature.substring(0, 64);
      const s = signature.substring(64);

      return key.verify(hash, { r, s });
    } catch (error) {
      this.logger.debug('Wallet signature verification failed:', error);
      return false;
    }
  }

  private exportJwk(): any {
    const privateKeyObj = createPrivateKey({
      key: this.privateKey as string,
      format: 'pem',
      type: 'pkcs8',
    });

    return privateKeyObj.export({ format: 'jwk' }) as any;
  }

  private base64UrlToHex(value: string): string {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('hex');
  }

  /**
   * Hash data using SHA-256 (for ledger chain)
   */
  hash256(data: any): string {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Create hash chain entry
   */
  createHashChain(currentData: any, previousHash: string): { hash: string; data: any } {
    const hash = this.hash256({
      timestamp: Date.now(),
      data: currentData,
      previousHash,
    });

    return {
      hash,
      data: {
        ...currentData,
        hash,
        previousHash,
        timestamp: Date.now(),
      },
    };
  }
}
