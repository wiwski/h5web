import { AbortError } from '@h5web/shared/react-suspense-fetch';
import { describe, expect, it, vi } from 'vitest';

import { createDataQueryClient, createQueryStore } from './query-store';

// Return the exact wakeable thrown by the synchronous Suspense API.
// eslint-disable-next-line @typescript-eslint/promise-function-async
function getPendingPromise(get: () => unknown): Promise<unknown> {
  try {
    get();
  } catch (error) {
    if (error instanceof Promise) {
      return error;
    }

    throw error;
  }

  throw new Error('Expected the store to suspend');
}

async function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        const { reason } = signal;
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      },
      {
        once: true,
      },
    );
  });
}

describe('QueryStore', () => {
  it('supports the synchronous `get` compatibility contract and deduplicates requests', async () => {
    let fetchSignal: AbortSignal | undefined;
    const fetch = vi.fn<
      (input: string, signal: AbortSignal) => Promise<string>
    >(async (input, signal) => {
      fetchSignal = signal;
      return `value:${input}`;
    });
    const store = createQueryStore(
      createDataQueryClient(),
      fetch,
      (input) => ['test', input] as const,
    );

    const promise = getPendingPromise(() => store.get('foo'));
    const duplicatePromise = getPendingPromise(() => store.get('foo'));

    expect(duplicatePromise).toBe(promise);
    await expect(promise).resolves.toBeUndefined();
    expect(store.get('foo')).toBe('value:foo');
    expect(store.has('foo')).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();

    store.abort('foo');
    expect(fetchSignal?.aborted).toBe(false); // completed controller was removed
  });

  it('keeps exact dataset selections in separate cache entries', async () => {
    interface Input {
      path: string;
      selection?: string;
    }

    const fetch = vi.fn<(input: Input) => Promise<string>>(
      async ({ path, selection }) => {
        return `${path}:${selection ?? ''}`;
      },
    );
    const store = createQueryStore(
      createDataQueryClient(),
      fetch,
      ({ path, selection }) => ['dataset-value', path, selection] as const,
    );

    await getPendingPromise(() =>
      store.get({ path: '/data', selection: '0:10' }),
    );
    await getPendingPromise(() =>
      store.get({ path: '/data', selection: '1:11' }),
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.has({ path: '/data', selection: '0:10' })).toBe(true);
    expect(store.has({ path: '/data', selection: '1:11' })).toBe(true);
  });

  it('isolates identical keys between data providers', async () => {
    const firstStore = createQueryStore(
      createDataQueryClient(),
      async () => 'first',
      (input: string) => ['entity', input] as const,
    );
    const secondStore = createQueryStore(
      createDataQueryClient(),
      async () => 'second',
      (input: string) => ['entity', input] as const,
    );

    await Promise.all([
      getPendingPromise(() => firstStore.get('/')),
      getPendingPromise(() => secondStore.get('/')),
    ]);

    expect(firstStore.get('/')).toBe('first');
    expect(secondStore.get('/')).toBe('second');
  });

  it('supports prefetch, preset, eviction, and error eviction', async () => {
    const error = new Error('boom');
    const fetch = vi.fn<(input: string) => Promise<string>>(async (input) => {
      if (input === 'bad') {
        throw error;
      }

      return `value:${input}`;
    });
    const store = createQueryStore(
      createDataQueryClient(),
      fetch,
      (input) => ['test', input] as const,
    );

    store.prefetch('good');
    await getPendingPromise(() => store.get('good'));
    expect(store.get('good')).toBe('value:good');
    expect(fetch).toHaveBeenCalledOnce();

    store.preset('preset', 'cached');
    expect(store.get('preset')).toBe('cached');
    store.abortAll('reset', true);
    expect(store.has('preset')).toBe(false);

    store.preset('preset', 'cached');
    store.evict('preset');
    expect(store.has('preset')).toBe(false);

    const errorWakeable = getPendingPromise(() => store.get('bad'));
    await expect(errorWakeable).resolves.toBeUndefined();
    expect(store.progressStore.getState().ongoing).toEqual(new Map());
    expect(() => store.get('bad')).toThrow(error);
    store.evictErrors();
    expect(store.has('bad')).toBe(false);
  });

  it('reports progress, preserves a cancellation error, and retries after eviction', async () => {
    let attempt = 0;
    const fetch = vi.fn<
      (
        input: string,
        signal: AbortSignal,
        onProgress: (value: number) => void,
      ) => Promise<string>
    >(
      async (
        input: string,
        signal: AbortSignal,
        onProgress: (value: number) => void,
      ) => {
        attempt += 1;
        onProgress(0.5);

        if (attempt === 1) {
          return waitForAbort(signal);
        }

        return `value:${input}`;
      },
    );
    const store = createQueryStore(
      createDataQueryClient(),
      fetch,
      (input) => ['test', input] as const,
    );

    const promise = getPendingPromise(() => store.get('foo'));
    await Promise.resolve();
    expect(store.progressStore.getState().ongoing.get('foo')).toBe(0.5);

    store.abort('foo', 'cancelled by user');
    await expect(promise).resolves.toBeUndefined();
    expect(store.progressStore.getState().ongoing).toEqual(new Map());
    expect(() => store.get('foo')).toThrow(AbortError);
    expect(() => store.get('foo')).toThrow('cancelled by user');

    store.evictErrors();
    await getPendingPromise(() => store.get('foo'));
    expect(store.get('foo')).toBe('value:foo');
  });

  it('silently removes an aborted query when eviction is requested', async () => {
    const fetch = vi
      .fn<(input: string, signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(async (_input, signal) => waitForAbort(signal))
      .mockResolvedValueOnce('retried');
    const store = createQueryStore(
      createDataQueryClient(),
      fetch,
      (input) => ['test', input] as const,
    );

    const cancelledPromise = getPendingPromise(() => store.get('foo'));
    store.abort('foo', 'entity changed', true);

    await expect(cancelledPromise).resolves.toBeUndefined();
    expect(store.has('foo')).toBe(false);

    await getPendingPromise(() => store.get('foo'));
    expect(store.get('foo')).toBe('retried');
  });
});
