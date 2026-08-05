import express, { type Express } from 'express';

import type { AppContainer } from '../container.js';
import { OUTPUT_DIR } from '../utils/fs.js';

import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { analyticsRouter } from './routes/analytics.route.js';
import { executionsRouter } from './routes/executions.route.js';
import { healthRouter } from './routes/health.route.js';
import { triggerRouter } from './routes/trigger.route.js';

export function createApp(container: AppContainer): Express {
  const app = express();

  app.use(requestLogger);
  app.use(express.json());
  app.use('/media', express.static(OUTPUT_DIR));

  app.use(healthRouter());
  app.use(executionsRouter());
  app.use(analyticsRouter());
  app.use(triggerRouter(container));

  app.use(errorHandler);

  return app;
}
