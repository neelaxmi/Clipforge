// Builds an ffmpeg concat-demuxer list. Must use REAL newlines (a literal "\n" breaks multi-clip exports).
export function buildConcatList(names) {
  return names.map(name => `file '${String(name).replace(/'/g, "'\\''")}'`).join("\n");
}
