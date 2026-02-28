
// A simple line-by-line diff implementation
// In a real app, you'd use the 'diff' npm package, but we can simulate it for this demo environment.

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export function computeSimpleDiff(oldText: string, newText: string): DiffPart[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff: DiffPart[] = [];
  
  // Very basic diffing logic for visual representation
  // This is a placeholder for a more complex LCS algorithm
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push({ value: oldLines[i] + '\n' });
      i++; j++;
    } else if (i < oldLines.length && (j >= newLines.length || !newLines.includes(oldLines[i]))) {
      diff.push({ value: oldLines[i] + '\n', removed: true });
      i++;
    } else if (j < newLines.length) {
      diff.push({ value: newLines[j] + '\n', added: true });
      j++;
    }
  }
  return diff;
}
