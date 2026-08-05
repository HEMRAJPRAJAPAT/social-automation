import type { NextFunction, Request, Response } from 'express';

import { childLogger } from '../../utils/logger.js';

const log = childLogger('http');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    log.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'request completed',
    );
  });
  next();
}
