import { isGroup } from '@h5web/shared/guards';
import { getNameFromPath } from '@h5web/shared/hdf5-utils';
import { createFetchStore } from '@h5web/shared/react-suspense-fetch';
import {
  type DefaultError,
  type QueriesResults,
  type QueryClient,
  type QueryKey,
  useQueries,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  useSuspenseQuery,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from 'react';

import { type DataProviderApi } from './api';
import {
  type AttrValuesStore,
  type EntitiesStore,
  type ValueQueryKey,
  type ValuesStore,
} from './models';
import { createQueryStore } from './query-store';

export interface DataContextValue {
  filepath: string;
  filename: string;
  entitiesStore: EntitiesStore;
  valuesStore: ValuesStore;
  attrValuesStore: AttrValuesStore;

  // Undocumented
  getExportURL?: DataProviderApi['getExportURL'];
  getSearchablePaths?: DataProviderApi['getSearchablePaths'];
}

interface InternalDataContextValue extends DataContextValue {
  queryClient: QueryClient;
}

const DataContext = createContext({} as InternalDataContextValue);

function useInternalDataContext(): InternalDataContextValue {
  return useContext(DataContext);
}

export function useDataContext(): DataContextValue {
  return useInternalDataContext();
}

export function useDataQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const { queryClient } = useInternalDataContext();
  return useQuery(options, queryClient);
}

export function useDataQueries<
  T extends unknown[],
  TCombinedResult = QueriesResults<T>,
>(
  options: Parameters<typeof useQueries<T, TCombinedResult>>[0],
): TCombinedResult {
  const { queryClient } = useInternalDataContext();
  return useQueries(options, queryClient);
}

export function useDataSuspenseQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseSuspenseQueryResult<TData, TError> {
  const { queryClient } = useInternalDataContext();
  return useSuspenseQuery(options, queryClient);
}

interface Props {
  api: DataProviderApi;
}

function DataProvider(props: PropsWithChildren<Props>) {
  const { api, children } = props;

  const entitiesStore = useMemo(() => {
    const store = createFetchStore(async (path: string) => {
      const entity = await api.getEntity(path);

      if (isGroup(entity)) {
        // Cache non-group children (datasets, datatypes and links)
        entity.children.forEach((child) => {
          if (!isGroup(child)) {
            store.preset(child.path, child);
          }
        });
      }

      return entity;
    });

    store.prefetch('/'); // pre-fetch root group
    return store;
  }, [api]);

  const valuesStore = useMemo(() => {
    return createQueryStore(
      api.getValue.bind(api),
      ({ dataset, selection }): ValueQueryKey => [
        'dataset-value',
        dataset.path,
        selection,
      ],
    );
  }, [api]);

  const attrValuesStore = useMemo(() => {
    return createFetchStore(
      api.getAttrValues.bind(api),
      (a, b) => a.path === b.path,
    );
  }, [api]);

  return (
    <DataContext
      value={{
        filepath: api.filepath,
        filename: getNameFromPath(api.filepath),
        entitiesStore,
        valuesStore,
        attrValuesStore,
        queryClient: valuesStore.queryClient,
        getExportURL: api.getExportURL?.bind(api),
        getSearchablePaths: api.getSearchablePaths?.bind(api),
      }}
    >
      {children}
    </DataContext>
  );
}

export default DataProvider;
