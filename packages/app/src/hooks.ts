import { type DimensionMapping, getSliceSelection } from '@h5web/lib';
import {
  assertDataset,
  assertShape,
  assertType,
  assertValue,
} from '@h5web/shared/guards';
import {
  type ArrayShape,
  type AttributeValues,
  type Dataset,
  type DatasetDef,
  type DatasetFromDef,
  type Entity,
  type ProvidedEntity,
  type ScalarShape,
  type Value,
} from '@h5web/shared/hdf5-models';
import {
  type DefaultError,
  type QueryKey,
  useQueryErrorResetBoundary,
  useSuspenseQueries,
  useSuspenseQuery,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from '@tanstack/react-query';

import {
  useDataContext,
  useInternalDataContext,
} from './providers/DataProvider';
import { type ValuesStoreParams } from './providers/models';

export function useDataSuspenseQuery<
  QueryFnData = unknown,
  QueryError = DefaultError,
  Data = QueryFnData,
  Key extends QueryKey = QueryKey,
>(
  options: UseSuspenseQueryOptions<QueryFnData, QueryError, Data, Key>,
): UseSuspenseQueryResult<Data, QueryError> {
  const { queryClient } = useInternalDataContext().entitiesStore;
  return useSuspenseQuery(options, queryClient);
}

export function useDataSuspenseQueries<
  QueryFnData,
  Data = QueryFnData,
  Key extends QueryKey = QueryKey,
>(
  queries: readonly UseSuspenseQueryOptions<QueryFnData, Error, Data, Key>[],
): UseSuspenseQueryResult<Data>[] {
  const { queryClient } = useInternalDataContext().entitiesStore;
  return useSuspenseQueries({ queries }, queryClient);
}

export function useDataQueryErrorResetBoundary(): ReturnType<
  typeof useQueryErrorResetBoundary
> {
  return useQueryErrorResetBoundary();
}

export function useEntity(path: string): ProvidedEntity {
  const { entitiesStore } = useInternalDataContext();
  return useDataSuspenseQuery(entitiesStore.getQueryOptions(path)).data;
}

export function useDatasets<R extends Record<string, DatasetDef>>(
  defs: R,
): { [K in keyof R]: DatasetFromDef<R[K]> } {
  const { entitiesStore } = useInternalDataContext();
  const entries = Object.entries(defs);
  const results = useDataSuspenseQueries(
    entries.map(([, def]) => entitiesStore.getQueryOptions(def.path)),
  );

  return Object.fromEntries(
    entries.map(([key, def], index) => {
      const entity = results[index].data;

      assertDataset(entity);

      if (def.shape) {
        assertShape(entity, def.shape);
      }

      if (def.type) {
        assertType(entity, def.type);
      }

      return [key, entity];
    }),
  ) as { [K in keyof R]: DatasetFromDef<R[K]> };
}

export function useValue<D extends Dataset<ArrayShape | ScalarShape>>(
  dataset: D,
  selection?: string,
): Value<D>;

export function useValue<D extends Dataset<ArrayShape | ScalarShape>>(
  dataset: D | undefined,
  selection?: string,
): Value<D> | undefined;

export function useValue<D extends Dataset<ArrayShape | ScalarShape>>(
  dataset: D | undefined,
  selection?: string,
): Value<D> | undefined {
  const { valuesStore } = useInternalDataContext();
  const results = useDataSuspenseQueries(
    dataset ? [valuesStore.getQueryOptions({ dataset, selection })] : [],
  );
  if (!dataset) {
    return undefined;
  }

  // If `selection` is undefined, the entire dataset is fetched
  const value = results[0]?.data;
  assertValue(value, dataset);
  return value;
}

type ValueFromParams<
  T extends ValuesStoreParams['dataset'] | ValuesStoreParams,
> = Value<T extends ValuesStoreParams ? T['dataset'] : T>;

export function useValues<
  R extends Record<string, ValuesStoreParams['dataset'] | ValuesStoreParams>,
>(datasets: R): { [K in keyof R]: ValueFromParams<R[K]> } {
  const { valuesStore } = useInternalDataContext();

  const storeParams = Object.entries(datasets).map(
    ([key, datasetOrStoreParams]) =>
      [
        key,
        'dataset' in datasetOrStoreParams
          ? datasetOrStoreParams // already store params => keep as is
          : { dataset: datasetOrStoreParams, selection: undefined }, // dataset => prepare store params
      ] as const,
  );

  const results = useDataSuspenseQueries(
    storeParams.map(([, params]) => valuesStore.getQueryOptions(params)),
  );

  return Object.fromEntries(
    storeParams.map(([key], index) => [key, results[index].data]),
  ) as { [K in keyof R]: ValueFromParams<R[K]> };
}

export function useAttrValues(entity: Entity): AttributeValues {
  const { attrValuesStore } = useInternalDataContext();
  return useDataSuspenseQuery(attrValuesStore.getQueryOptions(entity)).data;
}

export function useValuesInCache(
  ...datasets: (Dataset<ScalarShape | ArrayShape> | undefined)[]
): (dimMapping: DimensionMapping) => boolean {
  const { valuesStore } = useDataContext();
  return (nextMapping) => {
    const selection = getSliceSelection(nextMapping);
    return datasets.every(
      (dataset) => !dataset || valuesStore.has({ dataset, selection }),
    );
  };
}
