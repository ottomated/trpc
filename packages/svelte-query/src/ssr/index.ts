import { QueryKey } from '@tanstack/svelte-query';

/**
 * @internal
 */
export const localsSymbol = Symbol('trpcSSRData');

/**
 * @internal
 */
export type SveltekitRequestEventInput = {
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
	parent: () => Promise<unknown>;
  locals: object;
};
/**
 * @internal
 */
export type SveltekitRequestEvent = {
	fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
	parent: () => Promise<unknown>;
  locals: {
    [localsSymbol]: TRPCSSRData;
  };
};

/**
 * @internal
 */
export type TRPCSSRData = Map<QueryKey, unknown>;

export function getSSRData(event: SveltekitRequestEventInput) {
  const locals = event.locals as SveltekitRequestEvent['locals'];
  if (!locals[localsSymbol]) {
    locals[localsSymbol] = new Map();
  }

  return locals[localsSymbol];
}

export * from './ssrLink';
