import type { ErrorRequestHandler } from 'express';

import { childLogger } from '../../utils/logger.js';

const log = childLogger('api-error-handler');

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  log.error({ err, path: req.path, method: req.method }, 'unhandled request error');
  res.status(500).json({
    error: 'Internal server error',
    message: err instanceof Error ? err.message : String(err),
  });
};
