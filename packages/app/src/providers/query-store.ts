import {
  AbortError,
  type FetchStore,
  type OnProgress,
} from '@h5web/shared/react-suspense-fetch';
import {
  hashKey,
  type Query,
  QueryClient,
  type QueryKey,
  type UseSuspenseQueryOptions,
} from '@tanstack/react-query';
import { createStore, type StoreApi } from 'zustand';

type FetchFunc<Input, Result> = (
  input: Input,
  abortSignal: AbortSignal,
  onProgress: OnProgress,
) => Promise<Result>;

export type DataQueryOptions<
  Result,
  Key extends QueryKey,
> = UseSuspenseQueryOptions<Result, Error, Result, Key>;

interface ProgressState<Input> {
  ongoing: Map<Input, number | undefined>;
  setProgress: (input: Input, value?: number) => void;
  clearProgress: (input: Input) => void;
}

export interface QueryStore<
  Input,
  Result,
  Key extends QueryKey,
> extends FetchStore<Input, Result> {
  readonly queryClient: QueryClient;
  getQueryOptions: (input: Input) => DataQueryOptions<Result, Key>;
}

export function createDataQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
        staleTime: Infinity,
      },
    },
  });
}

export function createQueryStore<Input, Result, Key extends QueryKey>(
  queryClient: QueryClient,
  fetchFunc: FetchFunc<Input, Result>,
  getQueryKey: (input: Input) => Key,
): QueryStore<Input, Result, Key> {
  const storeId = Symbol('query-store');
  const controllers = new Map<string, AbortController>();
  const presetQueryHashes = new Set<string>();
  const suspensePromises = new Map<string, Promise<void>>();
  const progressStore = createProgressStore<Input>();

  function isStoreQuery(query: Query): boolean {
    return (
      query.meta?.queryStore === storeId ||
      presetQueryHashes.has(query.queryHash)
    );
  }

  function getQueryOptions(input: Input): DataQueryOptions<Result, Key> {
    const queryKey = getQueryKey(input);

    return {
      queryKey,
      meta: { queryStore: storeId },
      queryFn: async ({ signal }) => {
        const queryHash = hashKey(queryKey);
        const controller = new AbortController();
        controllers.set(queryHash, controller);

        function handleQueryCancel() {
          controller.abort(signal.reason);
        }

        signal.addEventListener('abort', handleQueryCancel, { once: true });
        progressStore.getState().setProgress(input);

        try {
          return await fetchFunc(input, controller.signal, (value) => {
            progressStore.getState().setProgress(input, value);
          });
        } finally {
          signal.removeEventListener('abort', handleQueryCancel);
          progressStore.getState().clearProgress(input);

          if (controllers.get(queryHash) === controller) {
            controllers.delete(queryHash);
          }
        }
      },
    };
  }

  function abortController(input: Input, reason?: string): void {
    const queryHash = hashKey(getQueryKey(input));
    controllers.get(queryHash)?.abort(new AbortError(reason));
  }

  // Preserve wakeable identity across compatibility `get` calls.
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  function getSuspensePromise(input: Input): Promise<void> {
    const queryHash = hashKey(getQueryKey(input));
    const ongoingPromise = suspensePromises.get(queryHash);
    if (ongoingPromise) {
      return ongoingPromise;
    }

    /* eslint-disable promise/prefer-await-to-then -- chaining exposes the exact
     * wakeable needed for identity-safe cleanup; an async wrapper would not */
    const suspensePromise = queryClient
      .fetchQuery(getQueryOptions(input))
      .then(() => undefined)
      .catch(() => undefined) // fetch errors are thrown by `get` after this wakeable settles
      .finally(() => {
        if (suspensePromises.get(queryHash) === suspensePromise) {
          suspensePromises.delete(queryHash);
        }
      });
    /* eslint-enable promise/prefer-await-to-then */
    suspensePromises.set(queryHash, suspensePromise);
    return suspensePromise;
  }

  return {
    queryClient,
    getQueryOptions,
    has: (input) => {
      return queryClient.getQueryState(getQueryKey(input)) !== undefined;
    },
    prefetch: (input) => {
      if (!queryClient.getQueryState(getQueryKey(input))) {
        void queryClient.prefetchQuery(getQueryOptions(input));
      }
    },
    get: (input) => {
      const queryState = queryClient.getQueryState<Result>(getQueryKey(input));

      if (queryState?.status === 'success') {
        return queryState.data as Result;
      }

      if (queryState?.status === 'error') {
        if (queryState.error) {
          throw queryState.error;
        }

        throw new Error('Query failed without an error');
      }

      throw getSuspensePromise(input); // eslint-disable-line @typescript-eslint/only-throw-error -- compatibility Suspense API
    },
    preset: (input, result) => {
      const queryKey = getQueryKey(input);
      presetQueryHashes.add(hashKey(queryKey));
      queryClient.setQueryData<Result>(queryKey, result);
    },
    evict: (input) => {
      const queryHash = hashKey(getQueryKey(input));
      presetQueryHashes.delete(queryHash);
      suspensePromises.delete(queryHash);
      queryClient.removeQueries({ queryKey: getQueryKey(input), exact: true });
    },
    evictErrors: () => {
      queryClient.removeQueries({
        predicate: (query) => {
          return isStoreQuery(query) && query.state.status === 'error';
        },
      });
    },
    abort: (input, reason, evict) => {
      abortController(input, reason);

      if (evict) {
        const queryHash = hashKey(getQueryKey(input));
        presetQueryHashes.delete(queryHash);
        suspensePromises.delete(queryHash);
        queryClient.removeQueries({
          queryKey: getQueryKey(input),
          exact: true,
        });
      }
    },
    abortAll: (reason, evict) => {
      controllers.forEach((controller) => {
        controller.abort(new AbortError(reason));
      });

      if (evict) {
        suspensePromises.clear();
        queryClient.removeQueries({
          predicate: isStoreQuery,
        });
        presetQueryHashes.clear();
      }
    },
    get progressStore() {
      return progressStore;
    },
  };
}

function createProgressStore<Input>(): StoreApi<ProgressState<Input>> {
  return createStore<ProgressState<Input>>((set, get) => ({
    ongoing: new Map(),
    setProgress: (input, value) => {
      const ongoing = new Map(get().ongoing);
      ongoing.set(input, value);
      set({ ongoing });
    },
    clearProgress: (input) => {
      const ongoing = new Map(get().ongoing);
      ongoing.delete(input);
      set({ ongoing });
    },
  }));
}
