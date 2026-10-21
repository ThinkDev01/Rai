import type { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import type { AuthenticatedRequest, ApiResponse } from '../types/common.types';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const userId = (req as AuthenticatedRequest).user?.id ?? 'anonymous';

  logger.error({
    route: req.path,
    method: req.method,
    userId: String(userId),
    error: err.message,
  }, 'Unhandled error caught by global error handler');

  res.status(500).json({
    success: false,
    data: {},
    error: 'Internal server error',
  } satisfies ApiResponse);
}
