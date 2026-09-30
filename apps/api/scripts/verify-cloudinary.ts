/** Exercises the live Cloudinary upload path against the real account: per-user
 * folder isolation and the public_id shape the ownership check expects. Run
 * manually, never in CI. */
import { storeImages } from '../src/services/images.js';
import { assertRealImages } from '../src/middleware/upload.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

// 1x1 transparent PNG - a real image, so the magic-byte check must accept it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function fakeFile(name: string) {
  return {
    originalname: name,
    mimetype: 'image/png',
    size: PNG.length,
    buffer: PNG,
  } as never;
}

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('1. magic-byte check accepts a real PNG');
try {
  assertRealImages([fakeFile('a.png')] as never);
  check('real PNG accepted', true);
} catch (e) {
  check('real PNG accepted', false, (e as Error).message);
}

console.log('\n2. magic-byte check rejects a renamed text file');
try {
  assertRealImages([
    { originalname: 'evil.png', mimetype: 'image/png', size: 10, buffer: Buffer.from('not an image') } as never,
  ] as never);
  check('text file disguised as PNG rejected', false, 'it was accepted');
} catch {
  check('text file disguised as PNG rejected', true);
}

console.log('\n3. real upload lands in a per-user folder');
const stored = await storeImages([fakeFile('test.png')], USER_A);
check('one image stored', stored.length === 1, JSON.stringify(stored));
const publicId = stored[0]?.public_id ?? '';
check('public_id is namespaced to the user', publicId.startsWith(`pulse-market/${USER_A}/`), publicId);
check('stored url is https', stored[0]?.url?.startsWith('https://'), stored[0]?.url);

console.log('\n4. a different user cannot claim that asset');
const { belongsToUser } = await import('../src/services/images.js');
check('owner is recognised', belongsToUser(publicId, USER_A));
check('other user is rejected', !belongsToUser(publicId, USER_B));

console.log('\n5. server can delete the asset it owns');
const { destroyImage } = await import('../src/services/images.js');
const outcome = await destroyImage(publicId, USER_A);
check('owner delete reported "deleted"', outcome === 'deleted', `outcome=${outcome}`);
check('asset is gone from the CDN', (await fetch(stored[0]!.url)).status === 404);

console.log('\n6. deleting it a second time reports "missing", not success');
const second = await destroyImage(publicId, USER_A);
check('repeat delete reported "missing"', second === 'missing', `outcome=${second}`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
