import serverless from 'serverless-http';
import { app } from '../src/server.js';

const handler = serverless(app, {
  binary: ['image/*', 'application/pdf'],
  request: (request: any, event: any, context: any) => {
    return request;
  }
});
export default handler;
export const config = {
  runtime: 'nodejs'
};
