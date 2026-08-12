import { assertGroup } from '@h5web/shared/guards';
import { buildEntityPath } from '@h5web/shared/hdf5-utils';
import { FiRefreshCw } from 'react-icons/fi';

import { useEntity } from '../hooks';
import EntityItem from './EntityItem';
import styles from './Explorer.module.css';

interface Props {
  level: number;
  parentPath: string;
  selectedPath: string;
  onSelect: (path: string) => void;
}

function EntityList(props: Props) {
  const { level, parentPath, selectedPath, onSelect } = props;

  const group = useEntity(parentPath);
  if (!group) {
    return (
      <FiRefreshCw
        className={styles.spinner}
        aria-label={`Loading ${level === 0 ? 'root' : 'group'} metadata...`}
        data-testid={
          level === 0 ? 'LoadingExplorerRoot' : 'LoadingExplorerGroup'
        }
      />
    );
  }

  assertGroup(group);

  if (group.children.length === 0) {
    return null;
  }

  return (
    <ul className={styles.group} role="group">
      {group.children.map((entity) => {
        const { name } = entity;

        return (
          <EntityItem
            key={name}
            path={buildEntityPath(parentPath, name)}
            entity={entity}
            level={level}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        );
      })}
    </ul>
  );
}

export default EntityList;
