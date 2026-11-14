import { describe, expect, it } from 'vitest';
import { AssetLoader } from '../src/assets.js';
import { latLonToVec3 } from '../src/math.js';

const manifestFetch = (async (url: string) => {
  if (url.endsWith('manifest.json')) {
    return new Response(
      JSON.stringify({
        version: 1,
        models: [{ id: 'm', path: 'models/missing.glb', credit: 'x' }],
      }),
    );
  }
  return new Response('', { status: 404 });
}) as unknown as typeof fetch;

describe('AssetLoader', () => {
  it('devuelve Placeholder y lista el asset ausente', async () => {
    const loader = new AssetLoader({ fetchFn: manifestFetch });
    const obj = await loader.loadModel('unknown-id');
    expect(obj.userData['placeholder']).toBe(true);
    expect(loader.missingAssets()).toContain('unknown-id');
  });

  it('manifest inaccesible: placeholder y "manifest" en la lista', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const loader = new AssetLoader({ fetchFn: failing });
    const obj = await loader.loadModel('x');
    expect(obj.userData['placeholder']).toBe(true);
    expect(loader.missingAssets()).toEqual(expect.arrayContaining(['manifest', 'x']));
  });
});

describe('latLonToVec3', () => {
  const near = (a: number, b: number): void => expect(a).toBeCloseTo(b, 9);
  it('lat 0 lon 0 -> +Z', () => {
    const v = latLonToVec3(0, 0, 2);
    near(v.x, 0);
    near(v.y, 0);
    near(v.z, 2);
  });
  it('polo norte -> +Y', () => {
    const v = latLonToVec3(90, 0);
    near(v.y, 1);
  });
  it('lon 90 este -> +X', () => {
    const v = latLonToVec3(0, 90);
    near(v.x, 1);
    near(v.z, 0);
  });
});
