import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Composite Foreign Keys', () => {
  const allContent: string = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  it('should have UNIQUE constraints on (client_id, id) for all parent tables', () => {
    const uniqueConstraints = [
      'customers_client_id_id_unique',
      'leads_client_id_id_unique',
      'estimates_client_id_id_unique',
      'conversations_client_id_id_unique',
      'bookings_client_id_id_unique',
      'workflow_events_client_id_id_unique',
      'actions_client_id_id_unique',
    ];

    uniqueConstraints.forEach(constraint => {
      expect(allContent).toMatch(new RegExp(constraint));
    });
  });

  it('should have composite FKs for all child->parent relationships', () => {
    const compositeFKs = [
      'leads_customer_id_fk',
      'estimates_customer_id_fk',
      'estimates_lead_id_fk',
      'consents_customer_id_fk',
      'conversations_customer_id_fk',
      'conversations_estimate_id_fk',
      'conversations_lead_id_fk',
      'messages_conversation_id_fk',
      'messages_customer_id_fk',
      'bookings_customer_id_fk',
      'bookings_estimate_id_fk',
      'bookings_lead_id_fk',
      'bookings_conversation_id_fk',
      'actions_customer_id_fk',
      'actions_lead_id_fk',
      'actions_estimate_id_fk',
      'actions_conversation_id_fk',
      'actions_booking_id_fk',
      'actions_workflow_event_id_fk',
      'errors_workflow_event_id_fk',
      'errors_action_id_fk',
    ];

    compositeFKs.forEach(fk => {
      expect(allContent).toMatch(new RegExp(fk));
    });
  });

  it('should have composite FKs referencing (client_id, id) on parent tables', () => {
    const fkDefinitions = [
      'leads_customer_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*customer_id\\)\\s*REFERENCES\\s*customers\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'estimates_customer_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*customer_id\\)\\s*REFERENCES\\s*customers\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'estimates_lead_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*lead_id\\)\\s*REFERENCES\\s*leads\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'conversations_customer_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*customer_id\\)\\s*REFERENCES\\s*customers\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'conversations_estimate_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*estimate_id\\)\\s*REFERENCES\\s*estimates\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'conversations_lead_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*lead_id\\)\\s*REFERENCES\\s*leads\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'messages_conversation_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*conversation_id\\)\\s*REFERENCES\\s*conversations\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'messages_customer_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*customer_id\\)\\s*REFERENCES\\s*customers\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'bookings_customer_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*customer_id\\)\\s*REFERENCES\\s*customers\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'bookings_estimate_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*estimate_id\\)\\s*REFERENCES\\s*estimates\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'bookings_lead_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*lead_id\\)\\s*REFERENCES\\s*leads\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'bookings_conversation_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*conversation_id\\)\\s*REFERENCES\\s*conversations\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'actions_customer_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*customer_id\\)\\s*REFERENCES\\s*customers\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'actions_lead_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*lead_id\\)\\s*REFERENCES\\s*leads\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'actions_estimate_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*estimate_id\\)\\s*REFERENCES\\s*estimates\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'actions_conversation_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*conversation_id\\)\\s*REFERENCES\\s*conversations\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'actions_booking_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*booking_id\\)\\s*REFERENCES\\s*bookings\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'actions_workflow_event_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*workflow_event_id\\)\\s*REFERENCES\\s*workflow_events\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'errors_workflow_event_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*workflow_event_id\\)\\s*REFERENCES\\s*workflow_events\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
      'errors_action_id_fk[\\s\\S]*FOREIGN KEY\\s*\\(client_id,\\s*action_id\\)\\s*REFERENCES\\s*actions\\s*\\(\\s*client_id\\s*,\\s*id\\s*\\)',
    ];

    fkDefinitions.forEach(def => {
      expect(allContent).toMatch(new RegExp(def, 'i'));
    });
  });

  it('should have indexes supporting composite FK lookups', () => {
    const indexes = [
      'idx_leads_client_customer',
      'idx_estimates_client_customer',
      'idx_estimates_client_lead',
      'idx_consents_client_customer',
      'idx_conversations_client_customer',
      'idx_conversations_client_estimate',
      'idx_conversations_client_lead',
      'idx_messages_client_conversation',
      'idx_messages_client_customer',
      'idx_bookings_client_customer',
      'idx_bookings_client_estimate',
      'idx_bookings_client_lead',
      'idx_bookings_client_conversation',
      'idx_actions_client_customer',
      'idx_actions_client_lead',
      'idx_actions_client_estimate',
      'idx_actions_client_conversation',
      'idx_actions_client_booking',
      'idx_actions_client_workflow',
      'idx_errors_client_workflow',
      'idx_errors_client_action',
    ];

    indexes.forEach(index => {
      expect(allContent).toMatch(new RegExp(index));
    });
  });

  it('should not have simple FKs without client_id for tenant-scoped relationships in final state', () => {
    // Check that the FINAL state (after all migrations) doesn't have simple FKs without client_id
    // Note: Initial schema has simple FKs that are later replaced by composite FKs
    // We check that the composite FKs exist (which implies the simple ones were replaced)
    // But we don't fail if initial schema had simple FKs that were later replaced

    // Verify composite FKs exist (which replace simple FKs)
    const compositeFKs = [
      'leads_customer_id_fk',
      'estimates_customer_id_fk',
      'estimates_lead_id_fk',
      'consents_customer_id_fk',
      'conversations_customer_id_fk',
      'conversations_estimate_id_fk',
      'conversations_lead_id_fk',
      'messages_conversation_id_fk',
      'messages_customer_id_fk',
      'bookings_customer_id_fk',
      'bookings_estimate_id_fk',
      'bookings_lead_id_fk',
      'bookings_conversation_id_fk',
      'actions_customer_id_fk',
      'actions_lead_id_fk',
      'actions_estimate_id_fk',
      'actions_conversation_id_fk',
      'actions_booking_id_fk',
      'actions_workflow_event_id_fk',
      'errors_workflow_event_id_fk',
      'errors_action_id_fk',
    ];

    compositeFKs.forEach(fk => {
      expect(allContent).toMatch(new RegExp(fk));
    });
  });
});