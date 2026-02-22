import { ec as EC } from 'elliptic';

const ec = new EC('p256');

const key = ec.genKeyPair();

console.log('BANK_PRIVATE_KEY_HEX="' + key.getPrivate('hex') + '"');
console.log('BANK_PUBLIC_KEY_HEX="' + key.getPublic('hex') + '"');
