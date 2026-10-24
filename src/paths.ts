import path from 'node:path';

/**
 * What the video and its captions are called: `output.name` if the spec sets one, else the spec's
 * file name (`mossbit-tutorial.vertical.yaml` → `mossbit-tutorial.vertical.mp4`).
 */
export function outputName(specFile: string, name?: string): string {
  const base = name ?? path.basename(specFile).replace(/\.ya?ml$/, '');
  return base.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'video';
}

export function outputDir(specFile: string): string {
  const name = path.basename(specFile).replace(/\.ya?ml$/, '');
  return path.join(path.dirname(specFile), 'showhow-output', name);
}
