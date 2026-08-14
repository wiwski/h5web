import { isGroup } from '@h5web/shared/guards';
import {
  type AttributeValues,
  type Entity,
  type ProvidedEntity,
} from '@h5web/shared/hdf5-models';
import { getNameFromPath } from '@h5web/shared/hdf5-utils';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
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
  type ValuesStore,
  type ValuesStoreParams,
} from './models';
import {
  createDataQueryClient,
  createQueryStore,
  type QueryStore,
} from './query-store';

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

type EntityQueryKey = readonly ['entity', string];
type ValueQueryKey = readonly ['dataset-value', string, string | undefined];
type AttrValuesQueryKey = readonly ['attribute-values', string];

interface InternalDataContextValue extends DataContextValue {
  entitiesStore: QueryStore<string, ProvidedEntity, EntityQueryKey>;
  valuesStore: QueryStore<ValuesStoreParams, unknown, ValueQueryKey>;
  attrValuesStore: QueryStore<Entity, AttributeValues, AttrValuesQueryKey>;
}

const DataContext = createContext({} as InternalDataContextValue);

export function useDataContext(): DataContextValue {
  return useContext(DataContext);
}

export function useInternalDataContext(): InternalDataContextValue {
  return useContext(DataContext);
}

interface Props {
  api: DataProviderApi;
}

function DataProvider(props: PropsWithChildren<Props>) {
  const { api, children } = props;

  const entitiesStore = useMemo(() => {
    const queryClient = createDataQueryClient();
    const store = createQueryStore(
      queryClient,
      async (path: string) => {
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
      },
      (path) => ['entity', path] as const,
    );

    store.prefetch('/'); // pre-fetch root group
    return store;
  }, [api]);

  const { queryClient } = entitiesStore;

  const valuesStore = useMemo(() => {
    return createQueryStore(
      queryClient,
      api.getValue.bind(api),
      ({ dataset, selection }) =>
        ['dataset-value', dataset.path, selection] as const,
    );
  }, [api, queryClient]);

  const attrValuesStore = useMemo(() => {
    return createQueryStore(
      queryClient,
      api.getAttrValues.bind(api),
      (entity) => ['attribute-values', entity.path] as const,
    );
  }, [api, queryClient]);

  return (
    <QueryErrorResetBoundary>
      <DataContext.Provider
        value={{
          filepath: api.filepath,
          filename: getNameFromPath(api.filepath),
          entitiesStore,
          valuesStore,
          attrValuesStore,
          getExportURL: api.getExportURL?.bind(api),
          getSearchablePaths: api.getSearchablePaths?.bind(api),
        }}
      >
        {children}
      </DataContext.Provider>
    </QueryErrorResetBoundary>
  );
}

export default DataProvider;
