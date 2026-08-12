/* eslint-disable @typescript-eslint/promise-function-async */
import {
  AbortError,
  createProgressStore,
  type FetchFunc,
  type FetchStore,
  type ProgressStore,
} from './fetch-shared';

export { AbortError, type FetchStore, type OnProgress } from './fetch-shared';

type AreEqual<Input> = (a: Input, b: Input) => boolean;

interface Instance<Result> {
  get: () => Promise<Result>;
  read: () => Result;
  isError: () => boolean;
  abort: (reason?: string) => void;
}

export interface SuspenseFetchStore<Input, Result> extends FetchStore<
  Input,
  Result
> {
  read: (input: Input) => Result;
}

export function createFetchStore<Input, Result>(
  fetchFunc: FetchFunc<Input, Result>,
  areEqual: AreEqual<Input> = Object.is,
): SuspenseFetchStore<Input, Result> {
  const cache = createCache<Input, Instance<Result>>(areEqual);

  const progressStore = createProgressStore<Input>();

  return {
    has: (input: Input): boolean => cache.has(input),
    prefetch: (input: Input): void => {
      if (!cache.has(input)) {
        cache.set(input, createInstance(input, fetchFunc, progressStore));
      }
    },
    get: (input: Input): Promise<Result> => {
      const instance =
        cache.get(input) || createInstance(input, fetchFunc, progressStore);
      cache.set(input, instance);
      return instance.get();
    },
    read: (input: Input): Result => {
      const instance =
        cache.get(input) || createInstance(input, fetchFunc, progressStore);
      cache.set(input, instance);
      return instance.read();
    },
    preset: (input: Input, result: Result): void => {
      const promise = Promise.resolve(result);
      cache.set(input, {
        get: () => promise,
        read: () => result,
        isError: () => false,
        abort: () => undefined,
      });
    },
    evict: (input: Input): void => {
      cache.delete(input);
    },
    evictErrors: () => {
      cache.entries().forEach(([input, instance]) => {
        if (instance.isError()) {
          cache.delete(input);
        }
      });
    },
    abort: (input: Input, reason?: string, evict?: boolean): void => {
      cache.get(input)?.abort(reason);

      if (evict) {
        cache.delete(input);
      }
    },
    abortAll: (reason?: string, evict?: boolean): void => {
      cache.entries().forEach(([input, instance]) => {
        instance.abort(reason);

        if (evict) {
          cache.delete(input);
        }
      });
    },
    get progressStore() {
      return progressStore;
    },
  };
}

function createCache<K, V>(areEqual: AreEqual<K>) {
  const map = new Map<K, V>();

  return {
    set: (key: K, value: V) => {
      map.set(key, value);
    },
    has: (key: K) => {
      for (const [k] of map) {
        if (areEqual(k, key)) {
          return true;
        }
      }
      return false;
    },
    get: (key: K) => {
      for (const [k, v] of map) {
        if (areEqual(k, key)) {
          return v;
        }
      }
      return undefined;
    },
    delete: (key: K) => {
      for (const [k] of map) {
        if (areEqual(k, key)) {
          map.delete(k);
        }
      }
    },
    entries: () => [...map.entries()],
    values: () => [...map.values()],
  };
}

function createInstance<Input, Result>(
  input: Input,
  fetchFunc: FetchFunc<Input, Result>,
  progressStore: ProgressStore<Input>,
): Instance<Result> {
  let status: 'pending' | 'success' | 'error' = 'pending';
  let result: Result | undefined;
  let error: unknown;
  const controller = new AbortController();

  const promise: Promise<Result> = (async () => {
    progressStore.getState().setProgress(input);
    try {
      result = await fetchFunc(input, controller.signal, (value) => {
        progressStore.getState().setProgress(input, value);
      });
      status = 'success';
      return result;
    } catch (caughtError: unknown) {
      status = 'error';
      error = caughtError;
      throw caughtError;
    } finally {
      progressStore.getState().clearProgress(input);
    }
  })();

  return {
    get: () => promise,
    read: () => {
      if (status === 'error') {
        throw error;
      }
      if (status === 'success') {
        return result as Result;
      }
      throw promise; // eslint-disable-line @typescript-eslint/only-throw-error
    },
    isError: () => status === 'error',
    abort: (reason?: string) => {
      controller.abort(new AbortError(reason));
    },
  };
}
