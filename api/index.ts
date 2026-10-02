import serverless from 'serverless-http';
import { app } from '../apps/api/src/server.js';

export const config = {
  runtime: 'nodejs22.x',
  maxDuration: 60,
};

export default serverless(app);
