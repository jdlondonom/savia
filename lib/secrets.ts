import 'server-only';
import { env } from 'cloudflare:workers';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encryptSecret(value: string): Promise<string> {
  const secret = value.trim();
  if (!secret) throw new Error('La credencial no puede estar vacía.');

  const keyId = activeMasterKeyId();
  const key = await getMasterKey(['encrypt'], keyId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(secret),
  );

  return keyId
    ? `v2.${keyId}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`
    : `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(envelope: string | null): Promise<string | null> {
  if (!envelope) return null;
  const parts = envelope.split('.');
  const version = parts[0];
  const keyId = version === 'v2' ? parts[1] : null;
  const encodedIv = version === 'v2' ? parts[2] : parts[1];
  const encodedCiphertext = version === 'v2' ? parts[3] : parts[2];
  if (!['v1', 'v2'].includes(version) || (version === 'v2' && !keyId) || !encodedIv || !encodedCiphertext) {
    throw new Error('La credencial almacenada tiene un formato inválido.');
  }

  try {
    const key = await getMasterKey(['decrypt'], keyId);
    const iv = fromBase64Url(encodedIv);
    const ciphertext = fromBase64Url(encodedCiphertext);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv) },
      key,
      asArrayBuffer(ciphertext),
    );
    return decoder.decode(decrypted);
  } catch {
    throw new Error('No fue posible descifrar la credencial. Verifica la bóveda de llaves maestras.');
  }
}

export function secretHint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Sin llave';
  return `•••• ${trimmed.slice(-4)}`;
}

export function activeMasterKeyId(): string | null {
  const keyId = env.SAVIA_ACTIVE_MASTER_KEY_ID?.trim() || null;
  if (keyId && !/^[A-Za-z0-9_-]{1,40}$/.test(keyId)) {
    throw new Error('SAVIA_ACTIVE_MASTER_KEY_ID contiene caracteres inválidos.');
  }
  return keyId;
}

export function secretNeedsRotation(envelope: string | null): boolean {
  if (!envelope) return false;
  const active = activeMasterKeyId();
  return active ? !envelope.startsWith(`v2.${active}.`) : !envelope.startsWith('v1.');
}

async function getMasterKey(usages: KeyUsage[], keyId: string | null): Promise<CryptoKey> {
  const configured = keyId ? keyFromRing(keyId) : env.SAVIA_MASTER_KEY?.trim();
  if (!configured) throw new Error(keyId ? `La llave ${keyId} no está configurada.` : 'SAVIA_MASTER_KEY no está configurada.');

  let raw: Uint8Array;
  try {
    raw = fromBase64(configured);
  } catch {
    throw new Error('SAVIA_MASTER_KEY debe estar codificada en Base64.');
  }
  if (raw.byteLength !== 32) {
    throw new Error('SAVIA_MASTER_KEY debe representar exactamente 32 bytes.');
  }

  return crypto.subtle.importKey('raw', asArrayBuffer(raw), 'AES-GCM', false, usages);
}

function keyFromRing(keyId: string): string | null {
  const raw = env.SAVIA_MASTER_KEYS_JSON?.trim();
  if (!raw) throw new Error('SAVIA_MASTER_KEYS_JSON no está configurada para la bóveda versionada.');
  try {
    const ring = JSON.parse(raw) as Record<string, unknown>;
    const key = ring[keyId];
    if (typeof key !== 'string' || !key.trim()) throw new Error('missing');
    return key.trim();
  } catch {
    throw new Error(`La llave maestra ${keyId} no existe en SAVIA_MASTER_KEYS_JSON.`);
  }
}

function toBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  return fromBase64(value.replace(/-/g, '+').replace(/_/g, '/'));
}

function fromBase64(value: string): Uint8Array {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}
