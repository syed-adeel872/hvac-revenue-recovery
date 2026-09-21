import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Circuit Breaker SQL Functions', () => {
  let migration016: string;
  let migration017: string;
  let migration021: string;

  beforeAll(() => {
    migration016 = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '000016_production_hardening.sql'),
      'utf8'
    );
    migration017 = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '000017_consistency_fixes.sql'),
      'utf8'
    );
    migration021 = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '000021_circuit_breaker_security.sql'),
      'utf8'
    );
  });

  describe('atomic_record_circuit_breaker_failure', () => {
    it('exists in migration 000017', () => {
      expect(migration017).toMatch(/CREATE.*FUNCTION.*atomic_record_circuit_breaker_failure/i);
    });

    it('has SECURITY DEFINER in migration 000021', () => {
      const fnBlock = migration021.substring(
        migration021.indexOf('atomic_record_circuit_breaker_failure'),
        migration021.indexOf('atomic_record_circuit_breaker_success')
      );
      expect(fnBlock).toMatch(/SECURITY DEFINER/i);
    });

    it('has SET search_path = public', () => {
      const fnBlock = migration021.substring(
        migration021.indexOf('atomic_record_circuit_breaker_failure'),
        migration021.indexOf('atomic_record_circuit_breaker_success')
      );
      expect(fnBlock).toMatch(/SET search_path\s*=\s*public/i);
    });
  });

  describe('atomic_record_circuit_breaker_success', () => {
    it('exists in migration 000017', () => {
      expect(migration017).toMatch(/CREATE.*FUNCTION.*atomic_record_circuit_breaker_success/i);
    });

    it('has SECURITY DEFINER in migration 000021', () => {
      const fnBlock = migration021.substring(
        migration021.indexOf('atomic_record_circuit_breaker_success'),
        migration021.indexOf('atomic_check_circuit_breaker')
      );
      expect(fnBlock).toMatch(/SECURITY DEFINER/i);
    });

    it('has SET search_path = public', () => {
      const fnBlock = migration021.substring(
        migration021.indexOf('atomic_record_circuit_breaker_success'),
        migration021.indexOf('atomic_check_circuit_breaker')
      );
      expect(fnBlock).toMatch(/SET search_path\s*=\s*public/i);
    });
  });

  describe('atomic_check_circuit_breaker', () => {
    it('exists in migration 000017', () => {
      expect(migration017).toMatch(/CREATE.*FUNCTION.*atomic_check_circuit_breaker/i);
    });

    it('has SECURITY DEFINER in migration 000021', () => {
      const fnIdx = migration021.indexOf('atomic_check_circuit_breaker');
      const fnBlock = migration021.substring(fnIdx);
      expect(fnBlock).toMatch(/SECURITY DEFINER/i);
    });

    it('has SET search_path = public', () => {
      const fnIdx = migration021.indexOf('atomic_check_circuit_breaker');
      const fnBlock = migration021.substring(fnIdx);
      expect(fnBlock).toMatch(/SET search_path\s*=\s*public/i);
    });

    it('returns can_execute = true for HALF_OPEN state (allows probing)', () => {
      const fnIdx = migration021.indexOf('atomic_check_circuit_breaker');
      const fnBlock = migration021.substring(fnIdx);
      const halfOpenIdx = fnBlock.indexOf("'HALF_OPEN'");
      const halfOpenSection = fnBlock.substring(halfOpenIdx, halfOpenIdx + 200);
      expect(halfOpenSection).toMatch(/v_can_execute\s*:=\s*true/i);
    });

    it('returns can_execute = false for OPEN state', () => {
      const fnIdx = migration021.indexOf('atomic_check_circuit_breaker');
      const fnBlock = migration021.substring(fnIdx);
      expect(fnBlock).toMatch(/v_can_execute\s*:=\s*false/i);
    });

    it('returns can_execute = true for CLOSED state', () => {
      const fnIdx = migration021.indexOf('atomic_check_circuit_breaker');
      const fnBlock = migration021.substring(fnIdx);
      const closedIdx = fnBlock.indexOf("'CLOSED'");
      const openIdx = fnBlock.indexOf("'OPEN'");
      const closedSection = fnBlock.substring(closedIdx, openIdx);
      expect(closedSection).toMatch(/v_can_execute\s*:=\s*true/i);
    });
  });

  describe('circuit_breaker_state table', () => {
    it('exists in migration 000016', () => {
      expect(migration016).toMatch(/CREATE TABLE.*circuit_breaker_state/i);
    });

    it('has RLS enabled', () => {
      expect(migration016).toMatch(/ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY/i);
    });
  });
});
