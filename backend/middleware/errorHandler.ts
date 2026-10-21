import type { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import type { AuthenticatedRequest, ApiResponse } from '../types/common.types';

/**
 * Errors that carry their own HTTP status. Express's body parsers (http-errors)
 * set `status`/`statusCode`, `expose` and a `type` such as
 * 'entity.parse.failed' (malformed JSON) or 'entity.too.large' (body > limit).
 * Our own code can opt in by attaching `status` (e.g. the CORS rejection).
 */
interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  expose?: boolean;
  type?: string;
}

/** Client-facing messages for the known body-parser error types. */
const BODY_PARSER_MESSAGES: Record<string, string> = {
  'entity.parse.failed': 'Malformed JSON in request body',
  'entity.too.large': 'Request body too large',
  'encoding.unsupported': 'Unsupported request body encoding',
  'charset.unsupported': 'Unsupported request body charset',
  'request.aborted': 'Request aborted by client',
};

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Response already started streaming - Express's default handler must close
  // the connection; writing a second response would throw.
  if (res.headersSent) {
    next(err);
    return;
  }

  const userId = (req as AuthenticatedRequest).user?.id ?? 'anonymous';
  const rawStatus = err.status ?? err.statusCode;
  const status = typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

  if (status < 500) {
    // Client error (bad JSON, oversized body, CORS-rejected origin, ...):
    // expected traffic, not a server fault - warn, and tell the caller why.
    logger.warn({
      route: req.path,
      method: req.method,
      userId: String(userId),
      status,
      errorType: err.type,
      error: err.message,
    }, 'Rejected the request with a client error');

    const message = (err.type && BODY_PARSER_MESSAGES[err.type])
      ?? (err.expose ? err.message : 'Bad request');
    res.status(status).json({ success: false, data: {}, error: message } satisfies ApiResponse);
    return;
  }

  logger.error({
    route: req.path,
    method: req.method,
    userId: String(userId),
    status,
    error: err.message,
    stack: err.stack,
  }, 'Unhandled error caught by global error handler');

  // Never leak internals for 5xx.
  res.status(status).json({
    success: false,
    data: {},
    error: 'Internal server error',
  } satisfies ApiResponse);
}
