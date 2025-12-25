import crypto from 'node:crypto';

console.time('scrypt-default');
const salt = crypto.randomBytes(16).toString('base64');
const hash = crypto.scryptSync('password123', salt, 64).toString('base64');
console.timeEnd('scrypt-default');
console.log('Hash length:', hash.length);
