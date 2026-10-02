import serverless from 'serverless-http';
import { app } from '../apps/api/src/server.js';

export default serverless(app);
