import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateCatalog } from '../client/release-catalog.mjs';
import { updateSigningBytes, verifySignedCatalog } from '../client/update-policy.mjs';
import release from './release-profile.mjs';

async function privateKeyMaterial({ keyFile = process.env.TEAM_DEVSPACE_UPDATE_SIGNING_KEY,
  keyPem = process.env.TEAM_DEVSPACE_UPDATE_SIGNING_KEY_PEM } = {}) {
  if (keyFile && keyPem) throw new Error('Choose update signing key PEM OR an explicit key file, not both');
  if (keyPem) return keyPem;
  if (keyFile) return readFile(keyFile);
  throw new Error('Protected update signing credential is required; production signing must not fall back to a local default key');
}

export async function signUpdateCatalog(catalog, { keyFile, keyPem,
  publicKey = release.distribution.updatePublicKey } = {}) {
  validateCatalog(catalog);
  const key = createPrivateKey(await privateKeyMaterial({ keyFile, keyPem }));
  if (key.asymmetricKeyType !== 'ed25519' || createPublicKey(key).export({ format: 'jwk' }).x !== publicKey) {
    throw new Error('The release signing key does not match the client-embedded public key');
  }
  const payload = Buffer.from(JSON.stringify(catalog)).toString('base64url');
  const envelope = { schema: 1, payload, signature: sign(null, updateSigningBytes(payload), key).toString('base64url') };
  await verifySignedCatalog(envelope, publicKey, catalog.version);
  return envelope;
}
