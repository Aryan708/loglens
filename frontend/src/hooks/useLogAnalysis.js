import { useCallback, useState } from 'react';
import { analyzeLog } from '@core/analyzer.js';
import { analyzeInCloud } from '../api/client.js';
import { LOCAL_MAX_BYTES } from '../config.js';
import { formatBytes } from '../utils/filters.js';

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

/**
 * Owns the analysis lifecycle: idle -> loading -> ready | error.
 * Components call analyzeFile / analyzeText / reset and read the state;
 * they don't need to know whether the work happened in the browser or in AWS.
 */
export function useLogAnalysis() {
  const [state, setState] = useState({ status: 'idle', result: null, error: null, message: '', fileName: '' });

  const run = useCallback(async (fileName, work) => {
    setState({ status: 'loading', result: null, error: null, message: 'Analyzing…', fileName });
    try {
      const result = await work((message) => setState((s) => ({ ...s, message })));
      setState({ status: 'ready', result, error: null, message: '', fileName });
    } catch (error) {
      setState({ status: 'error', result: null, error: error.message, message: '', fileName });
    }
  }, []);

  const analyzeText = useCallback(
    (text, fileName = 'pasted.log') => run(fileName, async () => analyzeLog(text)),
    [run],
  );

  const analyzeFile = useCallback(
    (file, { cloud = false } = {}) => run(file.name, async (onStatus) => {
      if (cloud) return analyzeInCloud(file, onStatus);
      if (file.size > LOCAL_MAX_BYTES) {
        throw new Error(`File is ${formatBytes(file.size)}. Browser mode supports up to ${formatBytes(LOCAL_MAX_BYTES)}.`);
      }
      return analyzeLog(await readFileText(file));
    }),
    [run],
  );

  const reset = useCallback(() => {
    setState({ status: 'idle', result: null, error: null, message: '', fileName: '' });
  }, []);

  return { ...state, analyzeText, analyzeFile, reset };
}
