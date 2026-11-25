/**
 * Observes the JSON responses that the page's own client receives.
 *
 * Runs in the page's JavaScript context. Rules:
 *
 * - Never change what the page sees: arguments, return values, thrown errors
 *   and timing of the wrapped functions pass through untouched.
 * - Never throw into the page, and never cause an unhandled rejection.
 * - Never read request headers. Credentials stay where they are.
 * - Leave as little trace as possible. The wrappers are proxies of the native
 *   functions, so they keep the original name, length and property layout,
 *   and print as native code. A site that looks hard enough can still tell a
 *   function was wrapped; see the spec, section 7.1.
 */

import type { ResponseMessage } from '@/src/messaging/protocol';

export type Observed = Omit<ResponseMessage, 'v' | 'kind'>;

export interface InterceptOptions {
  /** The operation name for a URL worth observing, or undefined to ignore it. */
  operationFor(url: URL): string | undefined;
  onResponse(observed: Observed): void;
}

const MAX_BODY = 8 * 1024 * 1024;
const MAX_REQUEST = 64 * 1024;

interface Target {
  url: URL;
  op: string;
}

export function installInterceptor(options: InterceptOptions): void {
  // Captured now, before any page script runs, so that later changes the page
  // makes to these built-ins neither break the wrappers nor reveal them.
  const apply = Reflect.apply;
  const defineProperty = Object.defineProperty;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const Url = URL;
  const stringify = JSON.stringify;
  const then = Promise.prototype.then;
  const listen = EventTarget.prototype.addEventListener;
  const noop = () => {};

  const report = (target: Target, rest: Omit<Observed, 'op' | 'host' | 'variables'>) => {
    try {
      if (rest.body.length > MAX_BODY) return;
      const variables = target.url.searchParams.get('variables');
      options.onResponse({
        op: target.op,
        host: target.url.host,
        ...(variables !== null && variables.length <= MAX_REQUEST ? { variables } : {}),
        ...rest,
      });
    } catch {
      // Never surface an error to the page.
    }
  };

  const targetOf = (input: unknown): Target | undefined => {
    try {
      const raw =
        typeof input === 'string'
          ? input
          : input instanceof Url
            ? input.href
            : (input as { url?: unknown } | null)?.url;
      if (typeof raw !== 'string') return undefined;
      const url = new Url(raw, location.href);
      const op = options.operationFor(url);
      return op === undefined ? undefined : { url, op };
    } catch {
      return undefined;
    }
  };

  const requestText = (body: unknown): { requestBody?: string } =>
    typeof body === 'string' && body.length <= MAX_REQUEST ? { requestBody: body } : {};

  // --- fetch -----------------------------------------------------------------

  const nativeFetch = window.fetch;
  const fetchDescriptor = getDescriptor(window, 'fetch');
  const cloneResponse = Response.prototype.clone;
  const readText = Response.prototype.text;

  const watchFetch = (args: unknown[], pending: Promise<Response>) => {
    const target = targetOf(args[0]);
    if (!target) return;
    const init = args[1] as RequestInit | undefined;
    const method = String(
      init?.method ?? (args[0] as { method?: unknown } | null)?.method ?? 'GET',
    ).toUpperCase();
    const request = requestText(init?.body);

    // Both handlers are supplied, so this chain can never reject unhandled.
    apply(then, pending, [
      (response: Response) => {
        try {
          const copy = apply(cloneResponse, response, []) as Response;
          const text = apply(readText, copy, []) as Promise<string>;
          apply(then, text, [
            (body: string) =>
              report(target, {
                transport: 'fetch',
                method,
                status: response.status,
                body,
                ...request,
              }),
            noop,
          ]);
        } catch {
          // Never surface an error to the page.
        }
      },
      noop,
    ]);
  };

  if (typeof nativeFetch === 'function' && fetchDescriptor) {
    defineProperty(window, 'fetch', {
      ...fetchDescriptor,
      value: new Proxy(nativeFetch, {
        apply(original, thisArg, args) {
          const pending = apply(original, thisArg, args) as Promise<Response>;
          try {
            watchFetch(args, pending);
          } catch {
            // Never surface an error to the page.
          }
          return pending;
        },
      }),
    });
  }

  // --- XMLHttpRequest --------------------------------------------------------

  const xhr = XMLHttpRequest.prototype;
  const openDescriptor = getDescriptor(xhr, 'open');
  const sendDescriptor = getDescriptor(xhr, 'send');
  const getResponseType = getDescriptor(xhr, 'responseType')?.get;
  const getResponseText = getDescriptor(xhr, 'responseText')?.get;
  const getResponse = getDescriptor(xhr, 'response')?.get;
  const getStatus = getDescriptor(xhr, 'status')?.get;
  const opened = new WeakMap<object, Target & { method: string }>();

  if (
    !openDescriptor ||
    !sendDescriptor ||
    !getResponseType ||
    !getResponseText ||
    !getResponse ||
    !getStatus
  ) {
    return;
  }

  const readXhr = (request: object): string | undefined => {
    const type = apply(getResponseType, request, []) as string;
    if (type === '' || type === 'text') return apply(getResponseText, request, []) as string;
    if (type === 'json') return stringify(apply(getResponse, request, []));
    return undefined;
  };

  defineProperty(xhr, 'open', {
    ...openDescriptor,
    value: new Proxy(openDescriptor.value as XMLHttpRequest['open'], {
      apply(original, request: object, args: unknown[]) {
        try {
          const target = targetOf(args[1]);
          if (target) opened.set(request, { ...target, method: String(args[0]).toUpperCase() });
          else opened.delete(request);
        } catch {
          // Never surface an error to the page.
        }
        return apply(original, request, args);
      },
    }),
  });

  defineProperty(xhr, 'send', {
    ...sendDescriptor,
    value: new Proxy(sendDescriptor.value as XMLHttpRequest['send'], {
      apply(original, request: object, args: unknown[]) {
        try {
          const target = opened.get(request);
          if (target) {
            const sent = requestText(args[0]);
            const onLoad = () => {
              try {
                const body = readXhr(request);
                if (body === undefined) return;
                report(target, {
                  transport: 'xhr',
                  method: target.method,
                  status: apply(getStatus, request, []) as number,
                  body,
                  ...sent,
                });
              } catch {
                // Never surface an error to the page.
              }
            };
            apply(listen, request, ['load', onLoad, { once: true }]);
          }
        } catch {
          // Never surface an error to the page.
        }
        return apply(original, request, args);
      },
    }),
  });
}
