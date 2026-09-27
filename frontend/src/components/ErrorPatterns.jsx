/** Leading literal text of a template, used as a search term ("Timeout after <NUM>ms" -> "Timeout after"). */
export function searchTermFor(template) {
  const literal = template.split('<')[0].trim();
  return literal.length >= 4 ? literal : template.replace(/<[A-Z]+>/g, '').trim();
}

export default function ErrorPatterns({ patterns, onShow }) {
  const max = patterns[0]?.count ?? 1;
  return (
    <section className="panel" aria-labelledby="patterns-heading">
      <h2 id="patterns-heading">Recurring errors</h2>
      {patterns.length === 0 ? (
        <p className="muted">No errors found. Nice.</p>
      ) : (
        <ol className="patterns">
          {patterns.map((p) => (
            <li key={p.template} className="pattern">
              <div className="pattern__top">
                <code className="pattern__template">{p.template}</code>
                <span className="pattern__count">{p.count}×</span>
              </div>
              <div className="pattern__bar" aria-hidden="true">
                <span style={{ width: `${(p.count / max) * 100}%` }} />
              </div>
              <div className="pattern__meta small muted">
                {p.sources.length > 0 && <span>{p.sources.join(', ')}</span>}
                <button type="button" className="link" onClick={() => onShow(searchTermFor(p.template))}>
                  Show matching entries
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
