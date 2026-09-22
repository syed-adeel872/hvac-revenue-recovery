const MAX_FIELD_LENGTH = 500;
const MAX_PAYLOAD_DEPTH = 3;

const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_REGEX = /\bon\w+\s*=/gi;
const JAVASCRIPT_URI_REGEX = /javascript\s*:/gi;
const DANGEROUS_ATTR_REGEX = /\s(on\w+|style)\s*=\s*["'][^"']*["']/gi;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /you\s+are\s+now\s+a/gi,
  /system\s*:\s*/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /###\s*system/gi,
  /forget\s+(all\s+)?prior/gi,
  /new\s+instructions?\s*:/gi,
  /disregard\s+(all\s+)?previous/gi,
];

export function stripHtmlTags(text: string): string {
  return text
    .replace(SCRIPT_REGEX, '')
    .replace(DANGEROUS_ATTR_REGEX, '')
    .replace(EVENT_HANDLER_REGEX, '')
    .replace(JAVASCRIPT_URI_REGEX, '')
    .replace(HTML_TAG_REGEX, '')
    .trim();
}

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function truncateField(value: unknown, maxLength: number = MAX_FIELD_LENGTH): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...[truncated]';
}

export function sanitizeValue(value: unknown, depth: number = 0): unknown {
  if (depth > MAX_PAYLOAD_DEPTH) return '[nested too deep]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let sanitized = stripHtmlTags(value);
    if (detectPromptInjection(sanitized)) {
      sanitized = sanitized.replace(INJECTION_PATTERNS[0], '[redacted]');
    }
    return truncateField(sanitized);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeValue(val, depth + 1);
    }
    return result;
  }
  return value;
}

export function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    sanitized[key] = sanitizeValue(value);
  }
  return sanitized;
}

function flattenRawPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload.raw_payload || typeof payload.raw_payload !== 'object') {
    return payload;
  }
  const raw = payload.raw_payload as Record<string, unknown>;
  const flat: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(raw)) {
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    flat[camelKey] = value;
    flat[key] = value;
  }
  return flat;
}

export function extractCustomerContext(payload: Record<string, unknown>): {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  estimateAmount?: number;
  estimateStatus?: string;
  leadStatus?: string;
  serviceName?: string;
  daysSinceSent?: number;
  hasViewedEstimate?: boolean;
} {
  const flat = flattenRawPayload(payload);

  const name = flat.customer_name || flat.customerName || flat.CustomerName;
  const email = flat.customer_email || flat.customerEmail || flat.CustomerEmail;
  const phone = flat.customer_phone || flat.customerPhone || flat.CustomerPhone;
  const status = flat.status || flat.Status;
  const leadStatus = flat.lead_status || flat.leadStatus || flat.LeadStatus;
  const service = flat.service_name || flat.serviceName || flat.ServiceType || flat.serviceType;

  const estimateAmountRaw = flat.total_amount || flat.estimateAmount || flat.EstimateAmount || flat.estimate_amount;
  const estimateAmount = typeof estimateAmountRaw === 'number' ? estimateAmountRaw : undefined;

  let daysSinceSent: number | undefined;
  const sentDate = flat.sent_at || flat.sentAt || flat.SentAt || flat.estimateSentDate || flat.EstimateSentDate;
  if (sentDate && typeof sentDate === 'string') {
    const sent = new Date(sentDate);
    const now = new Date();
    daysSinceSent = Math.floor((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
  }

  let hasViewedEstimate = false;
  const viewedDate = flat.viewed_at || flat.viewedAt || flat.ViewedAt || flat.estimateViewedDate || flat.EstimateViewedDate;
  if (viewedDate && typeof viewedDate === 'string') {
    hasViewedEstimate = new Date(viewedDate).getTime() > 0;
  }

  return {
    customerName: name ? truncateField(name) : undefined,
    customerEmail: email ? truncateField(email) : undefined,
    customerPhone: phone ? truncateField(phone) : undefined,
    estimateAmount,
    estimateStatus: status ? truncateField(status) : undefined,
    leadStatus: leadStatus ? truncateField(leadStatus) : undefined,
    serviceName: service ? truncateField(service) : undefined,
    daysSinceSent,
    hasViewedEstimate,
  };
}
