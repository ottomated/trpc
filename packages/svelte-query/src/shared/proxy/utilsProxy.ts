import {
  CancelOptions,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  QueryClient,
  QueryFilters,
  QueryFunction,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  ResetQueryFilters,
  SetDataOptions,
  Updater,
} from '@tanstack/svelte-query';
import { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import {
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  inferProcedureInput,
} from '@trpc/server';
import {
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { splitUserOptions } from '../../utils/splitUserOptions';
import { UserExposedOptions } from '../../createTRPCSvelte';
import { QueryType, getArrayQueryKey } from '../../internals/getArrayQueryKey';

type DecorateProcedure<TProcedure extends AnyQueryProcedure> = {
  invalidate: <TPageData = unknown>(
    input: inferProcedureInput<TProcedure>,
    filters?: InvalidateQueryFilters<TPageData>,
    options?: InvalidateOptions,
  ) => Promise<void>;
  prefetch: (
    input: inferProcedureInput<TProcedure>,
    options?: UserExposedOptions<
      FetchQueryOptions<
        inferProcedureInput<TProcedure>,
        TRPCClientErrorLike<TProcedure>
      >
    >,
  ) => Promise<void>;
  prefetchInfinite: (
    input: inferProcedureInput<TProcedure>,
    options?: UserExposedOptions<
      FetchInfiniteQueryOptions<
        inferProcedureInput<TProcedure>,
        TRPCClientErrorLike<TProcedure>
      >
    >,
  ) => Promise<void>;
  fetch: (
    input: inferProcedureInput<TProcedure>,
    options?: UserExposedOptions<
      FetchQueryOptions<
        inferProcedureInput<TProcedure>,
        TRPCClientErrorLike<TProcedure>
      >
    >,
  ) => Promise<inferTransformedProcedureOutput<TProcedure>>;
  fetchInfinite: (
    input: inferProcedureInput<TProcedure>,
    options?: UserExposedOptions<
      FetchInfiniteQueryOptions<
        inferProcedureInput<TProcedure>,
        TRPCClientErrorLike<TProcedure>
      >
    >,
  ) => Promise<InfiniteData<inferTransformedProcedureOutput<TProcedure>>>;
  refetch: <TPageData = unknown>(
    input: inferProcedureInput<TProcedure>,
    filters?: RefetchQueryFilters<TPageData>,
    options?: RefetchOptions,
  ) => Promise<void>;
  cancel: (
    input: inferProcedureInput<TProcedure>,
    filters?: QueryFilters,
    options?: CancelOptions,
  ) => Promise<void>;
  reset: <TPageData = unknown>(
    input: inferProcedureInput<TProcedure>,
    filters?: ResetQueryFilters<TPageData>,
    options?: ResetOptions,
  ) => Promise<void>;
  setData: (
    input: inferProcedureInput<TProcedure>,
    updater: Updater<
      inferTransformedProcedureOutput<TProcedure> | undefined,
      inferTransformedProcedureOutput<TProcedure> | undefined
    >,
    options?: SetDataOptions,
  ) => inferTransformedProcedureOutput<TProcedure> | undefined;
  setInfiniteData(
    input: inferProcedureInput<TProcedure>,
    updater: Updater<
      inferTransformedProcedureOutput<TProcedure> | undefined,
      inferTransformedProcedureOutput<TProcedure> | undefined
    >,
    options?: SetDataOptions,
  ): inferTransformedProcedureOutput<TProcedure> | undefined;
  getData: (
    input: inferProcedureInput<TProcedure>,
    filters?: QueryFilters,
  ) => inferTransformedProcedureOutput<TProcedure> | undefined;
  getInfiniteData(
    input?: inferProcedureInput<TProcedure>,
    filters?: QueryFilters,
  ): InfiniteData<inferTransformedProcedureOutput<TProcedure>> | undefined;
};

type DecorateRouter = {
  invalidate(
    input?: undefined,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;
};

type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyRouter | AnyQueryProcedure
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]> &
        DecorateRouter
    : // utils only apply to queries
      DecorateProcedure<TRouter['_def']['record'][TKey]>;
} & DecorateRouter; // Add functions that should be available at utils root

export type CreateSvelteUtilsProxy<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<TRouter>;

type ContextMethod = keyof DecorateProcedure<AnyQueryProcedure>;

const queryTypes: Record<ContextMethod, QueryType> = {
  invalidate: 'any',
  prefetch: 'query',
  prefetchInfinite: 'infinite',
  fetch: 'query',
  fetchInfinite: 'infinite',
  refetch: 'any',
  cancel: 'any',
  reset: 'any',
  setData: 'query',
  setInfiniteData: 'infinite',
  getData: 'query',
  getInfiniteData: 'infinite',
};

export function createUtilsProxy<TRouter extends AnyRouter>(
  trpc: TRPCUntypedClient<TRouter>,
  client: QueryClient,
): CreateSvelteUtilsProxy<TRouter> {
  return createRecursiveProxy(({ path, args: unknownArgs }) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const method = path.pop()! as ContextMethod;

    const args = unknownArgs as any[];

    const queryType = queryTypes[method];
    const queryKey = getArrayQueryKey(path, args[0], queryType);

    switch (method) {
      case 'prefetch':
      case 'fetch':
      case 'prefetchInfinite':
      case 'fetchInfinite': {
        const joinedPath = path.join('.');

        const options = args[1] as UserExposedOptions<any> | undefined;
        const [trpcOptions, tanstackQueryOptions] = splitUserOptions(options);

        const queryFn: QueryFunction =
          queryType === 'query'
            ? () => trpc.query(joinedPath, args[0], trpcOptions)
            : (context) => {
                const input = { ...args[0], cursor: context.pageParam };
                return trpc.query(joinedPath, input, trpcOptions);
              };

        // tanstack query methods look like fetchQuery, prefetchInfiniteQuery, etc., so we append "Query"
        return (client as any)[method + 'Query']({
          ...tanstackQueryOptions,
          queryKey,
          queryFn,
        });
      }
      case 'invalidate':
        return client.invalidateQueries(queryKey, args[1], args[2]);
      case 'refetch':
        return client.refetchQueries(
          getArrayQueryKey(path, args[0], 'query'),
          args[1],
          args[2],
        );
      case 'cancel':
        return client.cancelQueries(queryKey, args[1], args[2]);
      case 'reset':
        return client.resetQueries(queryKey, args[1], args[2]);
      case 'setData':
      case 'setInfiniteData':
        return client.setQueryData(queryKey, args[1], args[2]);
      case 'getData':
      case 'getInfiniteData':
        return client.getQueryData(queryKey, args[1]);
      default:
        throw new TypeError(`trpc.${path}.${method} is not a function`);
    }
  }) as any;
}
