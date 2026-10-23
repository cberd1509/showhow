import path from 'node:path';

export function outputDir(specFile: string): string {
  const name = path.basename(specFile).replace(/\.ya?ml$/, '');
  return path.join(path.dirname(specFile), 'showhow-output', name);
}
