import { type DimensionMapping, getSliceSelection } from '@h5web/lib';
import { assertDatasetValue, isDefined } from '@h5web/shared/guards';
import {
  type ArrayShape,
  type Dataset,
  type Entity,
  type ProvidedEntity,
  type ScalarShape,
  type Value,
} from '@h5web/shared/hdf5-models';
import { useEffect } from 'react';

import {
  useDataContext,
  useDataQueries,
  useDataQuery,
} from './providers/DataProvider';
import { type AttrName } from './providers/models';
import { hasAttribute } from './utils';

export function useEntity(path: string): ProvidedEntity | undefined {
  const { entitiesStore } = useDataContext();
  const { data } = useDataQuery({
    queryKey: ['entity', path],
    queryFn: async () => entitiesStore.get(path),
  });

  return data;
}

export function usePrefetchValues(
  datasets: (Dataset<ScalarShape | ArrayShape> | undefined)[],
  selection?: string,
): void {
  const { valuesStore } = useDataContext();
  useEffect(() => {
    datasets.filter(isDefined).forEach((dataset) => {
      valuesStore.prefetch({ dataset, selection });
    });
  }, [datasets, selection, valuesStore]);
}

export function useDatasetValue<D extends Dataset<ArrayShape | ScalarShape>>(
  dataset: D | undefined,
  selection?: string,
): Value<D> | undefined {
  return useDatasetsValuesInternal([dataset], selection)[0];
}

export function useDatasetsValues<D extends Dataset<ArrayShape | ScalarShape>>(
  datasets: (D | undefined)[],
  selection?: string,
): (Value<D> | undefined)[] {
  return useDatasetsValuesInternal(datasets, selection);
}

function useDatasetsValuesInternal<D extends Dataset<ArrayShape | ScalarShape>>(
  datasets: (D | undefined)[],
  selection?: string,
): (Value<D> | undefined)[] {
  const { valuesStore } = useDataContext();

  const entries = datasets.flatMap((dataset, index) =>
    dataset ? [{ dataset, index }] : [],
  );

  const results = useDataQueries({
    queries: entries.map(({ dataset }) => {
      const input = { dataset, selection };

      return valuesStore.getQueryOptions(input);
    }),
  });

  const values: (Value<D> | undefined)[] = Array.from({
    length: datasets.length,
  });

  entries.forEach(({ dataset, index }, resultIndex) => {
    const value = results[resultIndex]?.data;

    if (value !== undefined) {
      assertDatasetValue(value, dataset);
      values[index] = value;
    }
  });

  return values;
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

export function useAttrValue(entity: Entity, attrName: AttrName): unknown {
  const { attrValuesStore } = useDataContext();
  const hasAttr = hasAttribute(entity, attrName);
  const { data } = useDataQuery({
    queryKey: ['attribute-values', entity.path],
    queryFn: async () => attrValuesStore.get(entity),
    enabled: hasAttr,
  });

  return hasAttr ? data?.[attrName] : undefined;
}
