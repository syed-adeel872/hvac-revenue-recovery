import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookErrorCode, createError } from './errors';
import { decryptSecret } from './encryption';

export interface VerificationResult {
  valid: boolean;
  error?: Error;
}

export interface HMACVerificationOptions {
  algorithm: 'sha256' | 'sha1';
  signature: string;
  headerName: string;
  rawBody: Uint8Array;
  encryptedSecret: Uint8Array;
}

export interface BearerTokenOptions {
  token: string;
  encryptedSecret: Uint8Array;
}

export interface BasicAuthOptions {
  username: string;
  password: string;
  encryptedSecret: Uint8Array;
}

function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

async function verifyHMAC(options: HMACVerificationOptions): Promise<VerificationResult> {
  try {
    const secret = await decryptSecret(options.encryptedSecret);

    const expectedSignature = createHmac(options.algorithm, Buffer.from(secret))
      .update(Buffer.from(options.rawBody))
      .digest('hex');

    const providedSignature = options.signature.replace(/^(sha256|sha1)=/i, '').toLowerCase();

    const expectedBytes = Buffer.from(expectedSignature, 'hex');
    const providedBytes = Buffer.from(providedSignature, 'hex');

    if (!constantTimeCompare(expectedBytes, providedBytes)) {
      return {
        valid: false,
        error: createError(
          WebhookErrorCode.INVALID_SIGNATURE,
          'HMAC signature verification failed',
          'Invalid signature'
        ),
      };
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Encryption provider not configured')) {
      throw error;
    }
    return {
      valid: false,
      error: createError(
        WebhookErrorCode.INVALID_CREDENTIALS,
        'Failed to verify HMAC signature',
        'Invalid credentials'
      ),
    };
  }
}

async function verifyBearerToken(options: BearerTokenOptions): Promise<VerificationResult> {
  try {
    const secret = await decryptSecret(options.encryptedSecret);
    const expectedToken = Buffer.from(secret).toString('utf-8');

    const expectedBytes = Buffer.from(expectedToken);
    const providedBytes = Buffer.from(options.token);

    if (!constantTimeCompare(expectedBytes, providedBytes)) {
      return {
        valid: false,
        error: createError(
          WebhookErrorCode.INVALID_SIGNATURE,
          'Bearer token verification failed',
          'Invalid token'
        ),
      };
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Encryption provider not configured')) {
      throw error;
    }
    return {
      valid: false,
      error: createError(
        WebhookErrorCode.INVALID_CREDENTIALS,
        'Failed to verify bearer token',
        'Invalid credentials'
      ),
    };
  }
}

async function verifyBasicAuth(options: BasicAuthOptions): Promise<VerificationResult> {
  try {
    const secret = await decryptSecret(options.encryptedSecret);
    const expectedCredentials = Buffer.from(secret).toString('utf-8');
    const [expectedUsername, expectedPassword] = expectedCredentials.split(':', 2);

    if (!expectedUsername || !expectedPassword) {
      return {
        valid: false,
        error: createError(
          WebhookErrorCode.INVALID_CREDENTIALS,
          'Invalid basic auth credential format',
          'Invalid credentials'
        ),
      };
    }

    const usernameMatch = constantTimeCompare(
      Buffer.from(expectedUsername),
      Buffer.from(options.username)
    );
    const passwordMatch = constantTimeCompare(
      Buffer.from(expectedPassword),
      Buffer.from(options.password)
    );

    if (!usernameMatch || !passwordMatch) {
      return {
        valid: false,
        error: createError(
          WebhookErrorCode.INVALID_SIGNATURE,
          'Basic auth verification failed',
          'Invalid credentials'
        ),
      };
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Encryption provider not configured')) {
      throw error;
    }
    return {
      valid: false,
      error: createError(
        WebhookErrorCode.INVALID_CREDENTIALS,
        'Failed to verify basic auth',
        'Invalid credentials'
      ),
    };
  }
}

export interface VerifySignatureOptions {
  authType: 'hmac_sha256' | 'hmac_sha1' | 'bearer_token' | 'basic_auth';
  rawBody: Uint8Array;
  headers: Record<string, string>;
  encryptedSecret: Uint8Array;
  headerName?: string;
}

export async function verifySignature(options: VerifySignatureOptions): Promise<VerificationResult> {
  const { authType, rawBody, headers, encryptedSecret, headerName } = options;

  switch (authType) {
    case 'hmac_sha256':
    case 'hmac_sha1': {
      const sigHeader = headerName || 'x-signature';
      const signature = headers[sigHeader.toLowerCase()] || headers[sigHeader];

      if (!signature) {
        return {
          valid: false,
          error: createError(
            WebhookErrorCode.MISSING_AUTHENTICATION,
            `Missing signature header: ${sigHeader}`,
            'Missing signature'
          ),
        };
      }

      return verifyHMAC({
        algorithm: authType === 'hmac_sha256' ? 'sha256' : 'sha1',
        signature,
        headerName: sigHeader,
        rawBody,
        encryptedSecret,
      });
    }

    case 'bearer_token': {
      const authHeader = headers['authorization'] || headers['Authorization'];
      if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        return {
          valid: false,
          error: createError(
            WebhookErrorCode.MISSING_AUTHENTICATION,
            'Missing or invalid Authorization header',
            'Missing authentication'
          ),
        };
      }

      const token = authHeader.slice(7).trim();
      return verifyBearerToken({ token, encryptedSecret });
    }

    case 'basic_auth': {
      const authHeader = headers['authorization'] || headers['Authorization'];
      if (!authHeader || !authHeader.toLowerCase().startsWith('basic ')) {
        return {
          valid: false,
          error: createError(
            WebhookErrorCode.MISSING_AUTHENTICATION,
            'Missing or invalid Authorization header',
            'Missing authentication'
          ),
        };
      }

      const encoded = authHeader.slice(6).trim();
      let decoded: string;
      try {
        decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      } catch {
        return {
          valid: false,
          error: createError(
            WebhookErrorCode.INVALID_CREDENTIALS,
            'Invalid basic auth encoding',
            'Invalid credentials'
          ),
        };
      }

      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1) {
        return {
          valid: false,
          error: createError(
            WebhookErrorCode.INVALID_CREDENTIALS,
            'Invalid basic auth format',
            'Invalid credentials'
          ),
        };
      }

      const username = decoded.slice(0, colonIndex);
      const password = decoded.slice(colonIndex + 1);

      return verifyBasicAuth({ username, password, encryptedSecret });
    }

    default:
      return {
        valid: false,
        error: createError(
          WebhookErrorCode.UNSUPPORTED_AUTH_METHOD,
          `Unsupported auth type: ${authType}`,
          'Unsupported authentication method'
        ),
      };
  }
}