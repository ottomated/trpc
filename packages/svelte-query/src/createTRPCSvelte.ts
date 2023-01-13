import {
  CreateInfiniteQueryOptions,
  CreateInfiniteQueryResult,
  CreateMutationOptions,
  CreateMutationResult,
  CreateQueryOptions,
  CreateQueryResult,
  createInfiniteQuery,
  createMutation,
  createQuery,
  useQueryClient,
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
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { getArrayQueryKey } from './internals/getArrayQueryKey';
import { CreateSvelteUtilsProxy, createUtilsProxy } from './shared';
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
      } & (inferProcedureInput<TProcedure> extends { cursor?: any }
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
  getContext(): CreateSvelteUtilsProxy<TRouter>;
};

export type CreateTRPCSvelte<TRouter extends AnyRouter> = ProtectedIntersection<
  CreateTRPCSvelteBase<TRouter>,
  DecoratedProcedureRecord<TRouter['_def']['record']>
>;

const clientMethods = {
  query: [1, 'query'],
  mutation: [0, 'any'],
  infiniteQuery: [1, 'infinite'],
} as const;

type ClientMethod = keyof typeof clientMethods;

function createSvelteInternalProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
) {
  return createRecursiveProxy(({ path, args: unknownArgs }) => {
    if (path[0] === 'getContext') {
      const queryClient = useQueryClient();
      return createUtilsProxy(client, queryClient);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const method = path.pop()! as ClientMethod;
    const joinedPath = path.join('.');

    const args = unknownArgs as any[];

    // Pull the query options out of the args - it's at a different index based on the method
    const [optionIndex, queryType] = clientMethods[method];
    const options = args[optionIndex] as UserExposedOptions<any> | undefined;
    const [trpcOptions, tanstackQueryOptions] = splitUserOptions(options);

    // Create the query key - input is undefined for mutations
    const key = getArrayQueryKey(
      path,
      method === 'mutation' ? undefined : args[0],
      queryType,
    );

    const browser = typeof window !== 'undefined';
    const enabled = tanstackQueryOptions?.enabled !== false && browser;

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
      default:
        throw new TypeError(`trpc.${path}.${method} is not a function`);
    }
  });
}

export function createTRPCSvelte<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): CreateTRPCSvelte<TRouter> {
  const client = createTRPCUntypedClient<TRouter>(opts);

  const proxy = createSvelteInternalProxy(client);

  return proxy as any;

  // const hooks = createHooksInternal<TRouter, TSSRContext>(opts);
  // const proxy = createHooksInternalProxy<TRouter, TSSRContext, TFlags>(hooks);

  // return proxy as any;
}
