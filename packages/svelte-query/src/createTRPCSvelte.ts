import {
  CreateInfiniteQueryOptions,
  CreateInfiniteQueryResult,
  CreateMutationOptions,
  CreateMutationResult,
  CreateQueryOptions,
  CreateQueryResult,
  QueryClient,
  QueryKey,
  createInfiniteQuery,
  createMutation,
  createQuery,
	QueryClientConfig,
} from '@tanstack/svelte-query';
import {
  CreateTRPCClientOptions,
  TRPCClientErrorLike,
  TRPCRequestOptions,
  TRPCUntypedClient,
  createTRPCUntypedClient,
} from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  ProcedureRouterRecord,
  ProtectedIntersection,
  inferProcedureInput,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { BROWSER } from 'esm-env';
import { getArrayQueryKey } from './internals/getArrayQueryKey';
import { CreateSvelteUtilsProxy, createUtilsProxy } from './shared';
import {
  SveltekitRequestEvent,
  SveltekitRequestEventInput,
  TRPCSSRData,
  getSSRData,
  localsSymbol,
} from './ssr';
import { splitUserOptions } from './utils/splitUserOptions';

/**
 * @internal
 */
export type TodoTypeName<TOptions> = Omit<
  TOptions,
  'queryFn' | 'queryKey' | 'mutationFn' | 'mutationKey'
>;

/**
 * @internal
 */
export type UserExposedOptions<TOptions> = TodoTypeName<TOptions> &
  TRPCRequestOptions;

type DecorateProcedure<TProcedure extends AnyProcedure> =
  TProcedure extends AnyQueryProcedure
    ? {
        query: (
          input: inferProcedureInput<TProcedure>,
          options?: UserExposedOptions<
            CreateQueryOptions<
              inferTransformedProcedureOutput<TProcedure>,
              TRPCClientErrorLike<TProcedure>
            >
          >,
        ) => CreateQueryResult<
          inferTransformedProcedureOutput<TProcedure>,
          TRPCClientErrorLike<TProcedure>
        >;
      } & (inferProcedureInput<TProcedure> extends void
        ? {
            ssr: (
              event: SveltekitRequestEventInput,
              options?: TRPCRequestOptions,
            ) => Promise<void>;
          }
        : {
            ssr: (
              input: inferProcedureInput<TProcedure>,
              event: SveltekitRequestEventInput,
              options?: TRPCRequestOptions,
            ) => Promise<void>;
          }) &
        (inferProcedureInput<TProcedure> extends { cursor?: any }
          ? {
              infiniteQuery: (
                input: Omit<inferProcedureInput<TProcedure>, 'cursor'>,
                options?: UserExposedOptions<
                  CreateInfiniteQueryOptions<
                    inferTransformedProcedureOutput<TProcedure>,
                    TRPCClientErrorLike<TProcedure>
                  >
                >,
              ) => CreateInfiniteQueryResult<
                inferTransformedProcedureOutput<TProcedure>,
                TRPCClientErrorLike<TProcedure>
              >;
							ssrInfinite: (
								input: inferProcedureInput<TProcedure>,
								event: SveltekitRequestEventInput,
								options?: TRPCRequestOptions,
							) => Promise<void>;
            }
          : object)
    : TProcedure extends AnyMutationProcedure
    ? {
        mutation: <TContext = unknown>(
          opts?: UserExposedOptions<
            CreateMutationOptions<
              inferTransformedProcedureOutput<TProcedure>,
              TRPCClientErrorLike<TProcedure>,
              inferProcedureInput<TProcedure>,
              TContext
            >
          >,
        ) => CreateMutationResult<
          inferTransformedProcedureOutput<TProcedure>,
          TRPCClientErrorLike<TProcedure>,
          inferProcedureInput<TProcedure>,
          TContext
        >;
      }
    : never;

type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey]>
    : never;
};

/**
 * @internal
 */
export type CreateTRPCSvelteBase<TRouter extends AnyRouter> = {
  context: CreateSvelteUtilsProxy<TRouter>;
  queryClient: QueryClient;
  ssr: typeof getSSRData;
  loadSSRData: (data: TRPCSSRData) => void;
};

export type CreateTRPCSvelte<TRouter extends AnyRouter> = ProtectedIntersection<
  CreateTRPCSvelteBase<TRouter>,
  DecoratedProcedureRecord<TRouter['_def']['record']>
>;

const clientMethods = {
  query: [1, 'query'],
  mutation: [0, 'any'],
  infiniteQuery: [1, 'infinite'],
	ssr: [1, 'query'],
	ssrInfinite: [-1, 'infinite']
} as const;

type ClientMethod = keyof typeof clientMethods;

function createSvelteInternalProxy<TRouter extends AnyRouter>(
	client: TRPCUntypedClient<TRouter>,
	opts: CreateTRPCSvelteOptions<TRouter>,
) {
  const queryClient = new QueryClient(opts.queryClientConfig);

	return createFlatProxy<CreateTRPCSvelte<TRouter>>((firstPath) => {
		console.log(JSON.stringify(queryClient.getQueriesData()));
    switch (firstPath) {
      case 'context':
        return createUtilsProxy(client, queryClient);
      case 'queryClient':
        return queryClient;
      case 'ssr':
        if (BROWSER) {
          throw new Error('`trpc.ssr` is only available on the server');
        } else {
          return getSSRData;
        }
      case 'loadSSRData': {
        return (data: TRPCSSRData) => {
					for (const [key, value] of data.entries()) {
            queryClient.setQueryData(key, value);
          }
        };
      }
    }

    return createRecursiveProxy(({ path, args: unknownArgs }) => {
      path.unshift(firstPath);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const method = path.pop()! as ClientMethod;
      const joinedPath = path.join('.');

      const args = unknownArgs as any[];

      // Pull the query options out of the args - it's at a different index based on the method
      const methodData = clientMethods[method];
      if (!methodData) {
        throw new TypeError(`trpc.${path}.${method} is not a function`);
      }
      const [optionIndex, queryType] = methodData;
      const options = args[optionIndex] as UserExposedOptions<any> | undefined;
      const [trpcOptions, tanstackQueryOptions] = splitUserOptions(options);

      // Create the query key - input is undefined for mutations
      const key = (
        method === 'ssr'
          ? undefined
          : getArrayQueryKey(
              path,
              method === 'mutation' ? undefined : args[0],
              queryType,
            )
      ) as QueryKey;

      const enabled = tanstackQueryOptions?.enabled !== false && BROWSER;

      switch (method) {
        case 'query':
          return createQuery({
            ...tanstackQueryOptions,
            enabled,
            queryKey: key,
            queryFn: () => client.query(joinedPath, args[0], trpcOptions),
          });
        case 'mutation': {
          return createMutation({
            ...tanstackQueryOptions,
            mutationKey: key,
            mutationFn: (variables: any) =>
              client.mutation(joinedPath, variables, trpcOptions),
          });
        }
        case 'infiniteQuery':
          return createInfiniteQuery({
            ...tanstackQueryOptions,
            enabled,
            queryKey: key,
            queryFn: (context) => {
              const input = { ...args[0], cursor: context.pageParam };
              return client.query(joinedPath, input, trpcOptions);
            },
          });
				case 'ssr':
				case 'ssrInfinite':
          if (BROWSER) {
            throw new TypeError(
              `\`trpc.${path}.ssr\` is only available on the server`,
            );
          } else {
            let event: SveltekitRequestEvent;
            let options: TRPCRequestOptions | undefined;
            let input: unknown;
            if (args.length === 1) {
              event = args[0];
            } else if (args.length === 2) {
              if ('locals' in args[0] && localsSymbol in args[0].locals) {
                event = args[0];
                options = args[1];
              } else {
                input = args[0];
                event = args[1];
              }
            } else if (args.length === 3) {
              input = args[0];
              event = args[1];
              options = args[2];
            } else {
              throw new Error('Invalid arguments');
            }
            const key = getArrayQueryKey(path, input, queryType);

            return client
              .query(joinedPath, input, {
                ...options,
                context: {
                  ...options?.context,
                  fetch: event.fetch,
                },
              })
							.then((data) => {

								if (!event.locals[localsSymbol]) {
									event.locals[localsSymbol] = new Map();
								}
								event.locals[localsSymbol].set(key, data);
								void event.parent();
              });
          }
        default:
          throw new TypeError(`trpc.${path}.${method} is not a function`);
      }
    });
  });
}

/**
 * @internal
 */
type CreateTRPCSvelteOptions<TRouter extends AnyRouter> = CreateTRPCClientOptions<TRouter> & {
	queryClientConfig?: QueryClientConfig;
}

export function createTRPCSvelte<TRouter extends AnyRouter>(
  opts: CreateTRPCSvelteOptions<TRouter>,
): CreateTRPCSvelte<TRouter> {
  const client = createTRPCUntypedClient<TRouter>(opts);

  const proxy = createSvelteInternalProxy(client, opts);

  return proxy as any;

  // const hooks = createHooksInternal<TRouter, TSSRContext>(opts);
  // const proxy = createHooksInternalProxy<TRouter, TSSRContext, TFlags>(hooks);

  // return proxy as any;
}
