import { useEffect, useState } from 'preact/hooks';
import type { DiagnosticsReport } from '@/src/diagnostics/report';
import { clearReport, readReport } from '@/src/diagnostics/store';

/**
 * Diagnostics build only. Shows which operations have been seen and lets the
 * report be saved as a file. The report describes structure, not content.
 */
export function Diagnostics() {
  const [report, setReport] = useState<DiagnosticsReport>();

  useEffect(() => {
    let live = true;
    const load = () => {
      readReport().then(
        (next) => live && setReport(next),
        () => {},
      );
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const download = async () => {
    const latest = await readReport();
    const blob = new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `xorganize-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const clear = async () => {
    await clearReport();
    setReport(await readReport());
  };

  const operations = report?.operations ?? [];

  return (
    <section class="diagnostics" aria-labelledby="diagnostics-title">
      <h2 id="diagnostics-title">Diagnostics</h2>
      <p>
        This build records the structure of the responses X sends: key names, value types and
        counts. It does not record post text, handles, ids, cookies or tokens. Browse your bookmarks
        and likes, then save the report.
      </p>
      <div class="diagnostics__actions">
        <button type="button" onClick={download} disabled={operations.length === 0}>
          Save report
        </button>
        <button type="button" onClick={clear} disabled={operations.length === 0}>
          Clear
        </button>
      </div>
      {operations.length === 0 ? (
        <p class="diagnostics__none">Nothing recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Responses</th>
              <th scope="col">Via</th>
              <th scope="col">Entries</th>
              <th scope="col">Posts</th>
            </tr>
          </thead>
          <tbody>
            {operations.map((operation) => (
              <tr key={operation.op}>
                <th scope="row">{operation.op}</th>
                <td>{operation.responses}</td>
                <td>{operation.transports.join(', ')}</td>
                <td>{operation.entriesTotal}</td>
                <td>{operation.tweetResultsTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
