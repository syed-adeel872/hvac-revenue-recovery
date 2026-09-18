export interface EncryptionProvider {
  decrypt(encryptedData: Uint8Array): Promise<Uint8Array>;
  encrypt(plaintext: Uint8Array): Promise<Uint8Array>;
}

export interface EncryptionConfig {
  key: Uint8Array;
  algorithm?: string;
}

let encryptionProvider: EncryptionProvider | null = null;

export function setEncryptionProvider(provider: EncryptionProvider | null): void {
  encryptionProvider = provider;
}

export function getEncryptionProvider(): EncryptionProvider | null {
  return encryptionProvider;
}

function ensureEncryptionProvider(): EncryptionProvider {
  if (encryptionProvider) return encryptionProvider;

  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const keyBytes = hexToBytes(keyHex);
  if (keyBytes.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters). Got ${keyBytes.length} bytes.`
    );
  }

  encryptionProvider = createAES256GCMProvider({ key: keyBytes });
  return encryptionProvider;
}

export async function decryptSecret(encryptedSecret: Uint8Array): Promise<Uint8Array> {
  const provider = ensureEncryptionProvider();
  return provider.decrypt(encryptedSecret);
}

export async function encryptSecret(plaintext: Uint8Array): Promise<Uint8Array> {
  const provider = ensureEncryptionProvider();
  return provider.encrypt(plaintext);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error('ENCRYPTION_KEY must have an even number of hex characters');
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('ENCRYPTION_KEY contains invalid hex characters');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

export function createAES256GCMProvider(config: EncryptionConfig): EncryptionProvider {
  if (config.key.length !== 32) {
    throw new Error('AES-256-GCM requires a 32-byte key');
  }

  const keyBuffer = config.key.buffer.slice(
    config.key.byteOffset,
    config.key.byteOffset + config.key.byteLength
  ) as ArrayBuffer;

  return {
    async decrypt(encryptedData: Uint8Array): Promise<Uint8Array> {
      const iv = encryptedData.slice(0, 12);
      const authTag = encryptedData.slice(12, 28);
      const ciphertext = encryptedData.slice(28);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const combined = new Uint8Array(ciphertext.length + authTag.length);
      combined.set(ciphertext);
      combined.set(authTag, ciphertext.length);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        combined
      );

      return new Uint8Array(decrypted);
    },

    async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      const plaintextBuffer = plaintext.buffer.slice(
        plaintext.byteOffset,
        plaintext.byteOffset + plaintext.byteLength
      ) as ArrayBuffer;

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        plaintextBuffer
      );

      const encryptedArray = new Uint8Array(encrypted);
      const authTag = encryptedArray.slice(encryptedArray.length - 16);
      const ciphertext = encryptedArray.slice(0, encryptedArray.length - 16);

      const result = new Uint8Array(12 + 16 + ciphertext.length);
      result.set(iv, 0);
      result.set(authTag, 12);
      result.set(ciphertext, 28);

      return result;
    },
  };
}