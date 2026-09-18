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

export function extractCustomerContext(payload: Record<string, unknown>): {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  estimateAmount?: number;
  estimateStatus?: string;
  leadStatus?: string;
  serviceName?: string;
} {
  const name = payload.customer_name || payload.customerName;
  const email = payload.customer_email || payload.customerEmail;
  const phone = payload.customer_phone || payload.customerPhone;
  const status = payload.status;
  const leadStatus = payload.lead_status || payload.leadStatus;
  const service = payload.service_name || payload.serviceName;

  return {
    customerName: name ? truncateField(name) : undefined,
    customerEmail: email ? truncateField(email) : undefined,
    customerPhone: phone ? truncateField(phone) : undefined,
    estimateAmount: typeof payload.total_amount === 'number' ? payload.total_amount : undefined,
    estimateStatus: status ? truncateField(status) : undefined,
    leadStatus: leadStatus ? truncateField(leadStatus) : undefined,
    serviceName: service ? truncateField(service) : undefined,
  };
}
