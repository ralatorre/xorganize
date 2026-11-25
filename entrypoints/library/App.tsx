import { DIAGNOSTICS } from '@/src/build';
import { Diagnostics } from './Diagnostics';

export function App() {
  return (
    <main class="library">
      <header class="library__header">
        <h1>xorganize</h1>
      </header>
      <section class="library__empty" aria-labelledby="empty-title">
        <h2 id="empty-title">Your library is empty</h2>
        <p>
          Bookmarks and likes you capture on X will appear here, ready to tag, search and export.
        </p>
        <p class="library__note">Capture is not available in this build yet.</p>
      </section>
      {DIAGNOSTICS ? <Diagnostics /> : null}
    </main>
  );
}
