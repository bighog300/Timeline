export type TextChunk = {
  index: number;
  start: number;
  end: number;
  text: string;
};

export const chunkText = ({
  text,
  maxChars,
  overlapChars,
}: {
  text: string;
  maxChars: number;
  overlapChars: number;
}): TextChunk[] => {
  if (!text) {
    return [];
  }

  const safeOverlap = Math.max(0, Math.min(overlapChars, maxChars - 1));
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push({
      index,
      start,
      end,
      text: text.slice(start, end),
    });
    if (end >= text.length) {
      break;
    }
    start = end - safeOverlap;
    index += 1;
  }

  return chunks;
};
