/** Pins the environment before any test file loads config.ts, since Bun auto-loads
 * backend/.env. The values look real enough to pass the boot guard but are never
 * contacted: authenticate() short-circuits on the test token. */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test-not-a-real-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
// Left as placeholders: config only requires Cloudinary in production, and
// hasCloudinary=false keeps the suite from making real image-storage calls.
process.env.CLOUDINARY_CLOUD_NAME = 'your_cloud_name';
process.env.CLOUDINARY_API_KEY = 'your_api_key';
process.env.CLOUDINARY_API_SECRET = 'your_api_secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
