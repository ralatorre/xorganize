import { render } from 'preact';
import { DIAGNOSTICS } from '@/src/build';
import { updateSettings } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { loadSnapshot } from '@/src/library/snapshot';
import { App } from './App';
import { Diagnostics } from './Diagnostics';
import './style.css';

// Wiring only: the real database and, in the diagnostics build, its store.
const db = library();
const load = (perSource: number) => loadSnapshot(db, perSource);
const setRemoteImages = (enabled: boolean) => void updateSettings(db, { remoteImages: enabled });

const root = document.getElementById('app');
if (root) {
  render(
    <App load={load} setRemoteImages={setRemoteImages}>
      {DIAGNOSTICS ? <Diagnostics store={createDiagnosticsStore(indexedDB)} /> : null}
    </App>,
    root,
  );
}
