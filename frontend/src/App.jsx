import { useEffect, useRef } from 'react';
import UploadPanel from './components/UploadPanel.jsx';
import Dashboard from './components/Dashboard.jsx';
import { useLogAnalysis } from './hooks/useLogAnalysis.js';
import { CLOUD_ENABLED } from './config.js';

const SAMPLE_URL = `${import.meta.env.BASE_URL ?? '/'}sample-app.log`;

export default function App() {
  const { status, result, error, message, fileName, analyzeFile, analyzeText, reset } = useLogAnalysis();
  const resultsHeading = useRef(null);
  const busy = status === 'loading';

  // Move focus to the results so keyboard and screen-reader users land on them.
  useEffect(() => {
    if (status === 'ready') resultsHeading.current?.focus();
  }, [status]);

  const loadSample = async () => {
    const response = await fetch(SAMPLE_URL);
    analyzeText(await response.text(), 'sample-app.log');
  };

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="container site-header__inner">
          <div className="brand">
            <svg aria-hidden="true" viewBox="0 0 32 32" className="brand__logo">
              <circle cx="14" cy="14" r="9" />
              <path d="M21 21l7 7" />
            </svg>
            <span>LogLens</span>
          </div>
          <span className="mode-pill" title={CLOUD_ENABLED ? 'Connected to the AWS API' : 'Everything runs locally in your browser'}>
            {CLOUD_ENABLED ? 'Cloud mode' : 'Browser mode'}
          </span>
        </div>
      </header>

      <main id="main" className="container">
        {status !== 'ready' && (
          <>
            <div className="hero">
              <h1>Find the problem in your logs, fast.</h1>
              <p className="muted">
                Upload a log file to see error spikes, recurring failures and a searchable timeline.
                In browser mode your file never leaves your computer.
              </p>
            </div>
            <UploadPanel onFile={analyzeFile} onSample={loadSample} onText={analyzeText} busy={busy} />
          </>
        )}

        <div aria-live="polite" className="status">
          {busy && (
            <p className="status__loading"><span className="spinner" aria-hidden="true" />{message}</p>
          )}
          {status === 'error' && (
            <div className="alert" role="alert">
              <strong>Could not analyze {fileName}.</strong> {error}
            </div>
          )}
        </div>

        {status === 'ready' && result && (
          <>
            <div className="results-header">
              <div>
                <h1 ref={resultsHeading} tabIndex={-1}>{fileName}</h1>
                <p className="muted small">
                  Formats detected: {Object.keys(result.formats ?? result.summary.formats ?? {}).join(', ') || 'none'}
                  {result.truncated || result.summary.truncated ? ' · truncated to the first entries' : ''}
                </p>
              </div>
              <button type="button" className="button" onClick={reset}>Analyze another file</button>
            </div>
            <Dashboard key={fileName} result={result} />
          </>
        )}
      </main>

      <footer className="site-footer container small muted">
        Built with React, AWS Lambda, Step Functions, DynamoDB and S3.
      </footer>
    </>
  );
}
