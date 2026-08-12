import { type ChildEntity } from '@h5web/shared/hdf5-models';

import { useDataContext, useDataQuery } from '../providers/DataProvider';
import styles from './Explorer.module.css';
import { needsNxBadge } from './utils';

interface Props {
  entity: ChildEntity;
}

function NxBadge(props: Props) {
  const { entity } = props;
  const { attrValuesStore } = useDataContext();
  const { data: showBadge } = useDataQuery({
    queryKey: ['nx-badge', entity.path],
    queryFn: async () => needsNxBadge(entity, attrValuesStore),
  });

  if (!showBadge) {
    return null;
  }

  return (
    <>
      {' '}
      <span className={styles.nx} aria-label="(NeXus group)">
        NX
      </span>
    </>
  );
}

export default NxBadge;
