import {
  type Dataset,
  type ScalarShape,
  type StringType,
} from '@h5web/shared/hdf5-models';
import { type ReactNode } from 'react';

import { useDatasetsValues } from '../../hooks';
import ValueLoader from '../ValueLoader';

interface Props {
  dataDataset: Dataset<ScalarShape, StringType>;
  typeDataset: Dataset<ScalarShape, StringType>;
  render: (value: string, mimeType: string) => ReactNode;
}

function NxNoteFetcher(props: Props) {
  const { dataDataset, typeDataset, render } = props;

  const [value, mimeType] = useDatasetsValues([dataDataset, typeDataset]);

  if (value === undefined || mimeType === undefined) {
    return <ValueLoader />;
  }

  return <>{render(value, mimeType)}</>;
}

export default NxNoteFetcher;
