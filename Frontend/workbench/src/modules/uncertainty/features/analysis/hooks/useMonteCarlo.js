// React hook that runs GUM-S1 Monte Carlo propagation for a derived test
// point, keeping simulations off the render thread and avoiding redundant
// recomputes.
//
// Mechanics:
// - Debounced: edits to the equation/TMDEs settle for DEBOUNCE_MS before a
//   run starts, so typing never queues a pile of simulations.
// - Cached: results are keyed by a hash of every MC-relevant input; reopening
//   a point or re-rendering with unchanged inputs reuses the last result.
// - Worker-first: simulations run in monteCarlo.worker.js when Workers are
//   available, with a synchronous in-thread fallback (tests, odd
//   environments). Seeded, so a given configuration always reproduces the
//   same digits no matter where it runs.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMonteCarloInputs,
  runMonteCarloPropagation,
  computeMcInputsHash,
} from "../../../utils/monteCarlo";

const DEBOUNCE_MS = 400;

// Fixed seed + adaptive batching (simplified JCGM 101 §7.9). The seed is part
// of the contract: reported numbers must reproduce across sessions/machines.
// quantileCount: compact output-distribution table persisted with the point
// (mcSummary) so the risk pipeline can resample measurement errors without
// re-running the simulation.
export const MC_RUN_OPTIONS = {
  seed: 0x5eed,
  adaptive: true,
  batchSize: 50000,
  maxSamples: 400000,
  coverageProbability: 0.95,
  quantileCount: 513,
};

const IDLE = { status: "idle", result: null, error: null, hash: null };

export default function useMonteCarlo({
  enabled,
  equationString,
  variableMappings,
  tmdeTolerances,
  manualComponents,
  correlations,
}) {
  const [state, setState] = useState(IDLE);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const cacheRef = useRef({ hash: null, result: null });

  const hash = useMemo(() => {
    if (!enabled) return null;
    return computeMcInputsHash({
      equationString,
      variableMappings,
      correlations,
      tmdeTolerances,
      manualComponents,
    });
  }, [
    enabled,
    equationString,
    variableMappings,
    tmdeTolerances,
    manualComponents,
    correlations,
  ]);

  useEffect(
    () => () => {
      workerRef.current?.terminate?.();
      workerRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!hash) {
      setState((s) => (s.status === "idle" ? s : IDLE));
      return undefined;
    }
    if (cacheRef.current.hash === hash) {
      setState({
        status: "done",
        result: cacheRef.current.result,
        error: null,
        hash,
      });
      return undefined;
    }

    const id = ++requestIdRef.current;
    setState({ status: "running", result: null, error: null, hash });

    const timer = setTimeout(() => {
      const { inputs, missingTypes } = buildMonteCarloInputs(
        variableMappings,
        tmdeTolerances,
        manualComponents
      );
      if (missingTypes.length > 0) {
        if (requestIdRef.current === id) {
          setState({
            status: "error",
            result: null,
            error: `Waiting for values for: ${[...new Set(missingTypes)].join(", ")}`,
            hash,
          });
        }
        return;
      }

      const options = {
        equationString,
        inputs,
        correlations: correlations || {},
        ...MC_RUN_OPTIONS,
      };

      const finish = (result, error) => {
        if (requestIdRef.current !== id) return; // superseded by newer inputs
        if (result) cacheRef.current = { hash, result };
        setState({
          status: error ? "error" : "done",
          result: result || null,
          error: error || null,
          hash,
        });
      };
      const runInline = () => {
        try {
          finish(runMonteCarloPropagation(options));
        } catch (e) {
          finish(null, e.message);
        }
      };

      let worker = workerRef.current;
      if (!worker && typeof Worker !== "undefined") {
        try {
          worker = new Worker(
            new URL("../../../utils/monteCarlo.worker.js", import.meta.url),
            { type: "module" }
          );
          workerRef.current = worker;
        } catch {
          worker = null;
        }
      }
      if (worker) {
        worker.onmessage = ({ data }) => {
          if (data?.id === id) finish(data.result, data.error);
        };
        worker.onerror = () => {
          // Worker failed to boot — fall back to an inline run.
          workerRef.current?.terminate?.();
          workerRef.current = null;
          runInline();
        };
        worker.postMessage({ id, options });
      } else {
        runInline();
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // The non-hash values are folded into the hash, so reruns key off it alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  return state;
}
