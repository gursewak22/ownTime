import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, generateKeyPairSync, type JsonWebKey } from 'node:crypto';

/**
 * RS256 signing material for the auth service (ADR 0005).
 *
 * The auth service is deployed on its own; other services verify its access
 * tokens without holding the signing key. That rules out a shared HS256 secret
 * (any holder could mint tokens) — so we sign with an RSA private key and
 * publish the public half at GET /auth/.well-known/jwks.json. Separately
 * deployed verifiers fetch and cache that JWKS exactly like ADR 0004 cached
 * Google's certs: no per-request network dependency after warm-up.
 */
export type JwtKeys = {
  privatePem: string;
  publicPem: string;
  kid: string;
  /** public key in JWKS form, with kid/use/alg already attached */
  jwk: JsonWebKey & { kid: string; use: 'sig'; alg: 'RS256' };
};

export const JWT_KEYS = Symbol('JWT_KEYS');

export function loadJwtKeys(config: ConfigService): JwtKeys {
  const b64 = config.get<string>('AUTH_JWT_PRIVATE_KEY');

  let privatePem: string;
  if (b64) {
    // Stored base64-encoded so a PKCS#8 PEM survives a single-line .env value.
    privatePem = Buffer.from(b64, 'base64').toString('utf8');
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_JWT_PRIVATE_KEY is required in production (RS256 signing key; generate with the snippet in .env.example).',
    );
  } else {
    // Dev convenience only: a throwaway keypair so local runs need no setup.
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] AUTH_JWT_PRIVATE_KEY not set — generated an ephemeral RS256 keypair for dev. ' +
        'Tokens invalidate on restart and differ per instance; set a real key for anything shared.',
    );
  }

  const publicKeyObj = createPublicKey(privatePem);
  const publicPem = publicKeyObj.export({ type: 'spki', format: 'pem' }) as string;
  const base = publicKeyObj.export({ format: 'jwk' }) as JsonWebKey;

  // Stable key id derived from the public modulus, so rotating the key changes
  // the kid and JWKS consumers can hold both keys during a rollover.
  const kid = createHash('sha256')
    .update(`${base.n}.${base.e}`)
    .digest('base64url')
    .slice(0, 16);

  return { privatePem, publicPem, kid, jwk: { ...base, kid, use: 'sig', alg: 'RS256' } };
}

/** Provides the single JwtKeys instance so the module and JWKS route share one keypair. */
@Global()
@Module({
  providers: [{ provide: JWT_KEYS, useFactory: loadJwtKeys, inject: [ConfigService] }],
  exports: [JWT_KEYS],
})
export class JwtKeysModule {}
