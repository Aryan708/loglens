import { useId, useRef, useState } from 'react';
import { CLOUD_ENABLED } from '../config.js';

export default function UploadPanel({ onFile, onSample, onText, busy }) {
  const inputId = useId();
  const pasteId = useId();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [cloud, setCloud] = useState(CLOUD_ENABLED);
  const [pasted, setPasted] = useState('');

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) onFile(file, { cloud });
  };

  return (
    <section className="panel upload" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Analyze a log file</h2>
      <p className="muted">
        Supports plain text, bracketed, JSON-lines and syslog formats. Stack traces are grouped with their error.
      </p>

      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        data-testid="dropzone"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="dropzone__icon">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <p>
          <strong>Drag and drop a log file here</strong>
          <span className="muted"> or</span>
        </p>
        <label htmlFor={inputId} className="button button--primary">Choose file</label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".log,.txt,.json,.jsonl,.out,text/plain"
          className="visually-hidden"
          disabled={busy}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <div className="upload__actions">
        <button type="button" className="button" onClick={onSample} disabled={busy}>
          Try the sample log
        </button>
        {CLOUD_ENABLED && (
          <label className="toggle">
            <input type="checkbox" checked={cloud} onChange={(e) => setCloud(e.target.checked)} />
            Process in AWS (S3 → Step Functions → DynamoDB)
          </label>
        )}
      </div>

      <details className="paste">
        <summary>Or paste log lines</summary>
        <label htmlFor={pasteId} className="visually-hidden">Log text</label>
        <textarea
          id={pasteId}
          rows={6}
          value={pasted}
          placeholder="2026-03-14 10:22:01,123 ERROR [payment-service] Timeout after 3000ms"
          onChange={(e) => setPasted(e.target.value)}
        />
        <button
          type="button"
          className="button button--primary"
          disabled={busy || !pasted.trim()}
          onClick={() => onText(pasted)}
        >
          Analyze text
        </button>
      </details>
    </section>
  );
}
