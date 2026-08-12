import {
  type ComplexType,
  type Dataset,
  type NumericLikeType,
} from '@h5web/shared/hdf5-models';
import { type ReactNode } from 'react';

import { useDatasetsValues, useDatasetValue } from '../../hooks';
import ValueLoader from '../ValueLoader';
import { type NxData, type NxValues } from './models';

interface Props<T extends NumericLikeType | ComplexType> {
  nxData: NxData<T>;
  selection?: string; // for slice-by-slice fetching
  render: (val: NxValues<T>) => ReactNode;
}

function NxValuesFetcher<T extends NumericLikeType | ComplexType>(
  props: Props<T>,
): ReactNode {
  const { nxData, selection, render } = props;
  const { signalDef, axisDefs, auxDefs, titleDataset } = nxData;

  const axisDatasets = axisDefs.map((def) => def?.dataset);
  const auxDatasets = auxDefs.map((def) => def.dataset);
  const auxErrorDatasets = auxDefs.map((def) => def.errorDataset);

  const titleValue = useDatasetValue(titleDataset);
  const signal = useDatasetValue(signalDef.dataset, selection);
  const errors = useDatasetValue(signalDef.errorDataset, selection);
  const auxValues = useDatasetsValues(auxDatasets, selection);
  const auxErrors = useDatasetsValues(auxErrorDatasets, selection);
  const axisValues = useDatasetsValues(axisDatasets);

  if (
    signal === undefined ||
    isLoading(titleDataset, titleValue) ||
    isLoading(signalDef.errorDataset, errors) ||
    hasLoadingDataset(auxDatasets, auxValues) ||
    hasLoadingDataset(auxErrorDatasets, auxErrors) ||
    hasLoadingDataset(axisDatasets, axisValues)
  ) {
    return <ValueLoader />;
  }

  const title = titleValue || signalDef.label;
  return render({
    title,
    signal,
    errors,
    auxValues: auxValues as NxValues<T>['auxValues'],
    auxErrors,
    axisValues,
  });
}

function isLoading(dataset: Dataset | undefined, value: unknown): boolean {
  return dataset !== undefined && value === undefined;
}

function hasLoadingDataset(
  datasets: (Dataset | undefined)[],
  values: unknown[],
): boolean {
  return datasets.some((dataset, index) => isLoading(dataset, values[index]));
}

export default NxValuesFetcher;
