const Logger = (() => {
  const stamp = () => new Date().toLocaleTimeString();
  return {
    info: (...a) => console.info(`[Clipforge ${stamp()}] ℹ`, ...a),
    success: (...a) => console.info(`[Clipforge ${stamp()}] ✓`, ...a),
    warn: (...a) => console.warn(`[Clipforge ${stamp()}] ⚠`, ...a),
    error: (...a) => console.error(`[Clipforge ${stamp()}] ✕`, ...a)
  };
})();
export default Logger;
