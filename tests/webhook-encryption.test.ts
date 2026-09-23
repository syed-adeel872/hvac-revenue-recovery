import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setEncryptionProvider, getEncryptionProvider, decryptSecret, encryptSecret, createAES256GCMProvider } from '@/lib/webhook/encryption';

describe('encryption', () => {
  beforeEach(() => {
    setEncryptionProvider(null);
  });

  afterEach(() => {
    setEncryptionProvider(null);
  });

  describe('setEncryptionProvider / getEncryptionProvider', () => {
    it('sets and gets provider', () => {
      const provider = {
        async decrypt(data: Uint8Array) { return data; },
        async encrypt(data: Uint8Array) { return data; },
      };

      setEncryptionProvider(provider);
      expect(getEncryptionProvider()).toBe(provider);
    });

    it('returns null when not set', () => {
      expect(getEncryptionProvider()).toBeNull();
    });
  });

  describe('decryptSecret / encryptSecret', () => {
    it('uses fallback key when ENCRYPTION_KEY env is not set (non-production)', async () => {
      const original = process.env.ENCRYPTION_KEY;
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        delete process.env.ENCRYPTION_KEY;
        process.env.NODE_ENV = 'test';
        setEncryptionProvider(null);
        const plaintext = new TextEncoder().encode('hello world');
        const encrypted = await encryptSecret(plaintext);
        expect(encrypted).toBeInstanceOf(Uint8Array);
        expect(encrypted.length).toBeGreaterThan(0);
        const decrypted = await decryptSecret(encrypted);
        expect(decrypted).toEqual(plaintext);
      } finally {
        setEncryptionProvider(null);
        if (original !== undefined) process.env.ENCRYPTION_KEY = original;
        if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });

    it('throws when ENCRYPTION_KEY is missing in production', async () => {
      const original = process.env.ENCRYPTION_KEY;
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        delete process.env.ENCRYPTION_KEY;
        process.env.NODE_ENV = 'production';
        setEncryptionProvider(null);
        await expect(encryptSecret(new TextEncoder().encode('x'))).rejects.toThrow('ENCRYPTION_KEY must be set in production');
      } finally {
        setEncryptionProvider(null);
        if (original !== undefined) process.env.ENCRYPTION_KEY = original;
        if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });

    it('delegates to provider when configured', async () => {
      const mockProvider = {
        async decrypt(data: Uint8Array) { return new Uint8Array([1, 2, 3]); },
        async encrypt(data: Uint8Array) { return new Uint8Array([4, 5, 6]); },
      };
      setEncryptionProvider(mockProvider);

      const decrypted = await decryptSecret(new Uint8Array([1, 2]));
      const encrypted = await encryptSecret(new Uint8Array([1, 2]));

      expect(decrypted).toEqual(new Uint8Array([1, 2, 3]));
      expect(encrypted).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('createAES256GCMProvider', () => {
    it('creates provider with 32-byte key', () => {
      const key = new Uint8Array(32);
      for (let i = 0; i < 32; i++) key[i] = i;

      const provider = createAES256GCMProvider({ key });
      expect(provider).toBeDefined();
      expect(typeof provider.decrypt).toBe('function');
      expect(typeof provider.encrypt).toBe('function');
    });

    it('throws for non-32-byte key', () => {
      const key = new Uint8Array(16);

      expect(() => createAES256GCMProvider({ key })).toThrow('AES-256-GCM requires a 32-byte key');
    });

    it('encrypts and decrypts round-trip', async () => {
      const key = new Uint8Array(32);
      for (let i = 0; i < 32; i++) key[i] = i;

      const provider = createAES256GCMProvider({ key });
      const plaintext = new TextEncoder().encode('test secret data');

      const encrypted = await provider.encrypt(plaintext);
      const decrypted = await provider.decrypt(encrypted);

      expect(decrypted).toEqual(plaintext);
    });

    it('produces different ciphertext for same plaintext (random IV)', async () => {
      const key = new Uint8Array(32);
      for (let i = 0; i < 32; i++) key[i] = i;

      const provider = createAES256GCMProvider({ key });
      const plaintext = new TextEncoder().encode('test secret data');

      const encrypted1 = await provider.encrypt(plaintext);
      const encrypted2 = await provider.encrypt(plaintext);

      expect(encrypted1).not.toEqual(encrypted2);

      const decrypted1 = await provider.decrypt(encrypted1);
      const decrypted2 = await provider.decrypt(encrypted2);

      expect(decrypted1).toEqual(plaintext);
      expect(decrypted2).toEqual(plaintext);
    });

    it('fails to decrypt with wrong key', async () => {
      const key1 = new Uint8Array(32);
      const key2 = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        key1[i] = i;
        key2[i] = 31 - i;
      }

      const provider1 = createAES256GCMProvider({ key: key1 });
      const provider2 = createAES256GCMProvider({ key: key2 });
      const plaintext = new TextEncoder().encode('test secret data');

      const encrypted = await provider1.encrypt(plaintext);

      await expect(provider2.decrypt(encrypted)).rejects.toThrow();
    });

    it('fails to decrypt tampered ciphertext', async () => {
      const key = new Uint8Array(32);
      for (let i = 0; i < 32; i++) key[i] = i;

      const provider = createAES256GCMProvider({ key });
      const plaintext = new TextEncoder().encode('test secret data');

      const encrypted = await provider.encrypt(plaintext);
      encrypted[20] ^= 0xFF;

      await expect(provider.decrypt(encrypted)).rejects.toThrow();
    });
  });
});