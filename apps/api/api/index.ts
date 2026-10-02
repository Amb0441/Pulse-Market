import serverless from 'serverless-http';
import { app } from '../src/server.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

export default serverless(app);
