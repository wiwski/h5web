/* eslint-disable @typescript-eslint/promise-function-async */
import { createStore, type StoreApi } from 'zustand';

type FetchFunc<Input, Result> = (
  input: Input,
  abortSignal: AbortSignal,
  onProgress: OnProgress,
) => Promise<Result>;

type AreEqual<Input> = (a: Input, b: Input) => boolean;
export type OnProgress = (value: number) => void;
type PromiseStatus = 'pending' | 'fulfilled' | 'rejected';

interface PendingPromiseWithStatus<T> extends Promise<T> {
  status: 'pending';
  value: null;
  reason: null;
}

interface FulfilledPromiseWithStatus<T> extends Promise<T> {
  status: 'fulfilled';
  value: T;
  reason: null;
}

interface RejectedPromiseWithStatus<T> extends Promise<T> {
  status: 'rejected';
  value: null;
  reason: unknown;
}

export type PromiseWithStatus<T> =
  | PendingPromiseWithStatus<T>
  | FulfilledPromiseWithStatus<T>
  | RejectedPromiseWithStatus<T>;

type MutablePromiseWithStatus<T> = Promise<T> & {
  status: PromiseStatus;
  value: T | null;
  reason: unknown;
};

interface Instance<Result> {
  get: () => PromiseWithStatus<Result>;
  isError: () => boolean;
  abort: (reason?: string) => void;
}

export interface FetchStore<Input, Result> {
  has: (input: Input) => boolean;
  prefetch: (input: Input) => void;
  get: (input: Input) => PromiseWithStatus<Result>;
  preset: (input: Input, result: Result) => void;
  evict: (input: Input) => void;
  evictErrors: () => void;
  abort: (input: Input, reason?: string, evict?: boolean) => void;
  abortAll: (reason?: string, evict?: boolean) => void;
  get progressStore(): StoreApi<ProgressState<Input>>;
}

interface ProgressState<Input> {
  ongoing: Map<Input, number | undefined>;
  setProgress: (input: Input, value?: number) => void;
  clearProgress: (input: Input) => void;
}

export function createFetchStore<Input, Result>(
  fetchFunc: FetchFunc<Input, Result>,
  areEqual: AreEqual<Input> = Object.is,
): FetchStore<Input, Result> {
  const cache = createCache<Input, Instance<Result>>(areEqual);

  const progressStore = createStore<ProgressState<Input>>((set, get) => ({
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

  return {
    has: (input: Input): boolean => cache.has(input),
    prefetch: (input: Input): void => {
      if (!cache.has(input)) {
        cache.set(input, createInstance(input, fetchFunc, progressStore));
      }
    },
    get: (input: Input): PromiseWithStatus<Result> => {
      const instance =
        cache.get(input) || createInstance(input, fetchFunc, progressStore);
      cache.set(input, instance);
      return instance.get();
    },
    preset: (input: Input, result: Result): void => {
      const promise = createFulfilledPromiseWithStatus(result);
      cache.set(input, {
        get: () => promise,
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
  progressStore: StoreApi<ProgressState<Input>>,
): Instance<Result> {
  const controller = new AbortController();
  const { promise, resolve, reject } = createPendingPromiseWithStatus<Result>();

  progressStore.getState().setProgress(input);

  void (async () => {
    try {
      const result = await fetchFunc(input, controller.signal, (value) => {
        progressStore.getState().setProgress(input, value);
      });

      promise.status = 'fulfilled';
      promise.value = result;
      promise.reason = null;
      resolve(result);
    } catch (fetchError: unknown) {
      promise.status = 'rejected';
      promise.value = null;
      promise.reason = fetchError;
      reject(fetchError);
    } finally {
      progressStore.getState().clearProgress(input);
    }
  })();

  return {
    get: () => promise as PromiseWithStatus<Result>,
    isError: () => false,
    abort: (reason?: string) => {
      controller.abort(new AbortError(reason));
    },
  };
}

export class AbortError extends Error {
  public constructor(reason?: string) {
    super(reason);
    this.name = 'AbortError';
  }
}

function createPendingPromiseWithStatus<T>() {
  let resolveFn!: (value: T | PromiseLike<T>) => void;
  let rejectFn!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  }) as MutablePromiseWithStatus<T>;

  promise.status = 'pending';
  promise.value = null;
  promise.reason = null;

  return {
    promise,
    resolve: resolveFn,
    reject: rejectFn,
  };
}

function createFulfilledPromiseWithStatus<T>(value: T): PromiseWithStatus<T> {
  const promise = Promise.resolve(value) as MutablePromiseWithStatus<T>;
  promise.status = 'fulfilled';
  promise.value = value;
  promise.reason = null;
  return promise as PromiseWithStatus<T>;
}
