export enum WebhookErrorCode {
  INVALID_REQUEST = 'invalid_request',
  PAYLOAD_TOO_LARGE = 'payload_too_large',
  MALFORMED_JSON = 'malformed_json',
  UNSUPPORTED_PROVIDER = 'unsupported_provider',
  PROVIDER_NOT_CONFIGURED = 'provider_not_configured',
  MISSING_AUTHENTICATION = 'missing_authentication',
  INVALID_SIGNATURE = 'invalid_signature',
  INVALID_CREDENTIALS = 'invalid_credentials',
  UNSUPPORTED_AUTH_METHOD = 'unsupported_auth_method',
  REPLAY_ATTACK = 'replay_attack',
  STALE_REQUEST = 'stale_request',
  FUTURE_REQUEST = 'future_request',
  SCHEMA_VALIDATION_FAILED = 'schema_validation_failed',
  TENANT_MISMATCH = 'tenant_mismatch',
  CROSS_TENANT_REJECTED = 'cross_tenant_rejected',
  IDEMPOTENCY_CONFLICT = 'idempotency_conflict',
  PERSISTENCE_FAILED = 'persistence_failed',
  INTERNAL_ERROR = 'internal_error',
}

export class WebhookError extends Error {
  public readonly code: WebhookErrorCode;
  public readonly statusCode: number;
  public readonly safeMessage: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: WebhookErrorCode,
    message: string,
    statusCode: number,
    safeMessage?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
    this.statusCode = statusCode;
    this.safeMessage = safeMessage ?? message;
    this.details = details;
    Object.setPrototypeOf(this, WebhookError.prototype);
  }
}

export interface ErrorResponseBody {
  error: string;
  code: WebhookErrorCode;
  details?: Record<string, unknown>;
}

export function mapErrorToResponse(error: unknown): { status: number; body: ErrorResponseBody } {
  if (error instanceof WebhookError) {
    return {
      status: error.statusCode,
      body: {
        error: error.safeMessage,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        error: 'Internal server error',
        code: WebhookErrorCode.INTERNAL_ERROR,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: 'Internal server error',
      code: WebhookErrorCode.INTERNAL_ERROR,
    },
  };
}

export function createError(
  code: WebhookErrorCode,
  message: string,
  safeMessage?: string,
  details?: Record<string, unknown>
): WebhookError {
  const statusMap: Record<WebhookErrorCode, number> = {
    [WebhookErrorCode.INVALID_REQUEST]: 400,
    [WebhookErrorCode.PAYLOAD_TOO_LARGE]: 413,
    [WebhookErrorCode.MALFORMED_JSON]: 400,
    [WebhookErrorCode.UNSUPPORTED_PROVIDER]: 404,
    [WebhookErrorCode.PROVIDER_NOT_CONFIGURED]: 404,
    [WebhookErrorCode.MISSING_AUTHENTICATION]: 401,
    [WebhookErrorCode.INVALID_SIGNATURE]: 401,
    [WebhookErrorCode.INVALID_CREDENTIALS]: 401,
    [WebhookErrorCode.UNSUPPORTED_AUTH_METHOD]: 400,
    [WebhookErrorCode.REPLAY_ATTACK]: 409,
    [WebhookErrorCode.STALE_REQUEST]: 401,
    [WebhookErrorCode.FUTURE_REQUEST]: 401,
    [WebhookErrorCode.SCHEMA_VALIDATION_FAILED]: 400,
    [WebhookErrorCode.TENANT_MISMATCH]: 403,
    [WebhookErrorCode.CROSS_TENANT_REJECTED]: 403,
    [WebhookErrorCode.IDEMPOTENCY_CONFLICT]: 409,
    [WebhookErrorCode.PERSISTENCE_FAILED]: 500,
    [WebhookErrorCode.INTERNAL_ERROR]: 500,
  };

  return new WebhookError(code, message, statusMap[code], safeMessage, details);
}