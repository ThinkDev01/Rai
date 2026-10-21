import type { Request, Response, NextFunction } from 'express';
import logger from '../../config/logger';
import { checkDbConnection } from './health.model';
import type { ApiResponse } from '../../types/common.types';

interface HealthData {
  status: string;
  db: string;
  timestamp: string;
}

export async function healthCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = 'anonymous';
  const route = '/api/health';

  logger.info({ route, method: req.method, userId }, 'Health check route hit');

  try {
    logger.info({ route, method: req.method, userId }, 'Pinging database');

    const dbOk = await checkDbConnection();

    logger.info({ route, method: req.method, userId, dbOk }, 'Health check complete');
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        db: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      },
      error: '',
    } satisfies ApiResponse<HealthData>);
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error');
    logger.error({ route, method: req.method, userId, error: error.message }, 'Health check failed');
    next(error);
  }
}
