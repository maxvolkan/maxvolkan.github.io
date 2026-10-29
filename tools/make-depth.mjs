// Makes a depth map for every scenes/<name>_color.jpg → scenes/<name>_depth.png
// Depth Anything V2 (small) guesses distance from a single photo: bright = near, dark = far.
// Run: cd tools && npm i && npm run depth   (first run downloads the ~100MB model)
import { pipeline } from '@huggingface/transformers';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../scenes/', import.meta.url));
const estimate = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');

for (const f of readdirSync(dir).filter((f) => f.endsWith('_color.jpg'))) {
  const { depth } = await estimate(dir + f);
  await depth.save(dir + f.replace('_color.jpg', '_depth.png'));
  console.log('✓', f);
}
