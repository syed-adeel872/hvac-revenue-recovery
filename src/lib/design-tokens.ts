export const COLORS = {
  bg: {
    darkest: '#0A0E14',
    card: '#141A25',
    elevated: '#1E293B',
  },
  accent: {
    blue: '#3B82F6',
    green: '#10B981',
    red: '#EF4444',
    amber: '#F59E0B',
  },
} as const;

export const FONTS = {
  ui: 'Inter, system-ui, -apple-system, sans-serif',
  mono: 'JetBrains Mono, ui-monospace, monospace',
} as const;

export type SafetyDecision = 'ALLOW' | 'BLOCK' | 'ESCALATE';
export type ConsentStatus = 'Verified' | 'Unknown' | 'Opted-Out';
export type RiskLevel = 'green' | 'yellow' | 'red';

export interface Opportunity {
  id: string;
  customerName: string;
  maskedEmail: string;
  maskedPhone: string;
  estimateAmount: number;
  intentScore: number;
  consent: ConsentStatus;
  safety: SafetyDecision;
  channel: string;
  template: string;
  draftId: string;
  idempotencyKey: string;
  traceId: string;
}

export interface PipelineCard {
  id: string;
  draftId: string;
  channel: string;
  template: string;
  idempotencyKey: string;
  safety: SafetyDecision;
  consent: ConsentStatus;
  traceId: string;
  status: 'drafted' | 'safety_check' | 'approved' | 'sent' | 'booked';
}

export interface AuditEntry {
  traceId: string;
  timestamp: string;
  worker: string;
  decision: SafetyDecision;
  tenantId: string;
  signature: string;
  action: string;
}

export interface Integration {
  name: string;
  status: 'connected' | 'error' | 'paused';
  health: number;
  rateLimit: string;
  lastSync: string;
  icon: string;
}
