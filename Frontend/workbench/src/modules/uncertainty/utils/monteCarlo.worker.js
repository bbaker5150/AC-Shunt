// Web-worker wrapper around the Monte Carlo engine so simulations never block
// the render thread. UI code constructs it Vite-style:
//
//   const worker = new Worker(
//     new URL("./monteCarlo.worker.js", import.meta.url),
//     { type: "module" }
//   );
//   worker.postMessage({ id, options });   // options = runMonteCarloPropagation args
//   worker.onmessage = ({ data }) => ...   // { id, result } or { id, error }
//
// The raw samples array (when returnSamples is set) is transferred, not
// copied, to keep large runs cheap.

import { runMonteCarloPropagation } from "./monteCarlo";

self.onmessage = (event) => {
  const { id, options } = event.data || {};
  try {
    const result = runMonteCarloPropagation(options);
    const transfer = result.samples ? [result.samples.buffer] : [];
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
