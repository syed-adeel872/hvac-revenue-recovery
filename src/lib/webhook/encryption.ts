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

export async function decryptSecret(encryptedSecret: Uint8Array): Promise<Uint8Array> {
  const provider = getEncryptionProvider();
  if (!provider) {
    throw new Error(
      'Encryption provider not configured. Set a production-safe encryption provider using setEncryptionProvider() before decrypting secrets.'
    );
  }
  return provider.decrypt(encryptedSecret);
}

export async function encryptSecret(plaintext: Uint8Array): Promise<Uint8Array> {
  const provider = getEncryptionProvider();
  if (!provider) {
    throw new Error(
      'Encryption provider not configured. Set a production-safe encryption provider using setEncryptionProvider() before encrypting secrets.'
    );
  }
  return provider.encrypt(plaintext);
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