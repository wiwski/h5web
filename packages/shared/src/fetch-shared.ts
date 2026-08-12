import { createStore, type StoreApi } from 'zustand';

export type OnProgress = (value: number) => void;

export type FetchFunc<Input, Result> = (
  input: Input,
  abortSignal: AbortSignal,
  onProgress: OnProgress,
) => Promise<Result>;

export interface ProgressState<Input> {
  ongoing: Map<Input, number | undefined>;
  setProgress: (input: Input, value?: number) => void;
  clearProgress: (input: Input) => void;
}

export type ProgressStore<Input> = StoreApi<ProgressState<Input>>;

export interface FetchStore<Input, Result> {
  has: (input: Input) => boolean;
  prefetch: (input: Input) => void;
  get: (input: Input) => Promise<Result>;
  preset: (input: Input, result: Result) => void;
  evict: (input: Input) => void;
  evictErrors: () => void;
  abort: (input: Input, reason?: string, evict?: boolean) => void;
  abortAll: (reason?: string, evict?: boolean) => void;
  get progressStore(): ProgressStore<Input>;
}

export function createProgressStore<Input>(): ProgressStore<Input> {
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

export class AbortError extends Error {
  public constructor(reason?: string) {
    super(reason);
    this.name = 'AbortError';
  }
}
