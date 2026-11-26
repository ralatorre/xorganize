import { liveQuery } from 'dexie';
import { library } from '@/src/db/schema';
import { createSearchService } from '@/src/search/service';

/** The worker's own scope, typed for the two calls made on it. */
const scope = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};

// Wiring only: the worker's own connection to the database, and its messages.
const service = createSearchService({
  db: library(),
  watch: (query, next, error) => {
    const subscription = liveQuery(query).subscribe({ next, error });
    return () => subscription.unsubscribe();
  },
  reply: (message) => scope.postMessage(message),
});

scope.addEventListener('message', (event) => service.receive(event.data));
