import {
  AbortError,
  createProgressStore,
  type FetchFunc,
  type FetchStore,
} from '@h5web/shared/fetch-shared';
import {
  QueryClient,
  type QueryKey,
  type UseQueryOptions,
} from '@tanstack/react-query';

type QueryOptions<Result, Key extends QueryKey> = UseQueryOptions<
  Result,
  Error,
  Result,
  Key
>;

export interface QueryStore<
  Input,
  Result,
  Key extends QueryKey,
> extends FetchStore<Input, Result> {
  readonly queryClient: QueryClient;
  getQueryOptions: (input: Input) => QueryOptions<Result, Key>;
  getQueryKey: (input: Input) => Key;
}

// Keep recent values around briefly for quick back-and-forth navigation, without
// retaining every slice visited during a long browsing session.
const VALUE_CACHE_TIME = 5000;

export function createQueryStore<Input, Result, Key extends QueryKey>(
  fetchFunc: FetchFunc<Input, Result>,
  getQueryKey: (input: Input) => Key,
): QueryStore<Input, Result, Key> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        throwOnError: true,
      },
    },
  });

  const progressStore = createProgressStore<Input>();

  const controllers = new Map<string, AbortController>();
  const storeId = Symbol('query-store');

  function isStoreQuery(meta: Record<string, unknown> | undefined): boolean {
    return meta?.queryStore === storeId;
  }

  function getQueryOptions(input: Input): QueryOptions<Result, Key> {
    const queryKey = getQueryKey(input);

    return {
      queryKey,
      gcTime: VALUE_CACHE_TIME,
      meta: { queryStore: storeId },
      queryFn: async ({ signal }) => {
        const hash = JSON.stringify(queryKey);
        const controller = new AbortController();
        controllers.set(hash, controller);

        function onCancel() {
          controller.abort(signal.reason);
        }
        signal.addEventListener('abort', onCancel, { once: true });

        progressStore.getState().setProgress(input);

        try {
          return await fetchFunc(input, controller.signal, (value) => {
            progressStore.getState().setProgress(input, value);
          });
        } finally {
          signal.removeEventListener('abort', onCancel);
          progressStore.getState().clearProgress(input);

          if (controllers.get(hash) === controller) {
            controllers.delete(hash);
          }
        }
      },
    };
  }

  function abortController(input: Input, reason?: string): void {
    const hash = JSON.stringify(getQueryKey(input));
    controllers.get(hash)?.abort(new AbortError(reason));
  }

  return {
    queryClient,
    getQueryOptions,
    getQueryKey,
    has: (input) => {
      return queryClient.getQueryState(getQueryKey(input)) !== undefined;
    },
    prefetch: (input) => {
      void queryClient.prefetchQuery(getQueryOptions(input));
    },
    get: async (input) => queryClient.fetchQuery(getQueryOptions(input)),
    preset: (input, result) => {
      queryClient.setQueryData<Result>(getQueryKey(input), result);
    },
    evict: (input) => {
      queryClient.removeQueries({ queryKey: getQueryKey(input), exact: true });
    },
    evictErrors: () => {
      queryClient.removeQueries({
        predicate: (query) =>
          isStoreQuery(query.meta) && query.state.status === 'error',
      });
    },
    abort: (input, reason, evict) => {
      const queryKey = getQueryKey(input);

      if (evict) {
        void queryClient.cancelQueries({ queryKey, exact: true });
        queryClient.removeQueries({ queryKey, exact: true });
        return;
      }

      abortController(input, reason);
    },
    abortAll: (reason, evict) => {
      if (evict) {
        void queryClient.cancelQueries({
          predicate: (query) => isStoreQuery(query.meta),
        });
        queryClient.removeQueries({
          predicate: (query) => isStoreQuery(query.meta),
        });
        return;
      }

      controllers.forEach((controller) => {
        controller.abort(new AbortError(reason));
      });
    },
    get progressStore() {
      return progressStore;
    },
  };
}
