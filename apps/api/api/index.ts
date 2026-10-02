import serverless from 'serverless-http';
import { app } from '../src/server.js';

const handler = serverless(app);
export default handler;
export const config = {
  runtime: 'nodejs'
};
