import { isComplexValue } from '@h5web/shared/guards';
import { type ProvidedEntity } from '@h5web/shared/hdf5-models';

import { useDataContext, useDataQuery } from '../providers/DataProvider';
import AttributeLink from './AttributeLink';
import AttrValueLoader from './AttrValueLoader';
import { renderComplex } from './utils';

const FOLLOWABLE_ATTRS = new Set([
  'default',
  'signal',
  'axes',
  'auxiliary_signals',
]);

interface Props {
  entity: ProvidedEntity;
  onFollowPath: (path: string) => void;
}

function AttributesInfo(props: Props) {
  const { entity, onFollowPath } = props;

  const { attrValuesStore } = useDataContext();
  const { data: attrValues } = useDataQuery({
    queryKey: ['attribute-values', entity.path],
    queryFn: async () => attrValuesStore.get(entity),
  });

  if (!attrValues) {
    return <AttrValueLoader />;
  }

  return entity.attributes.map(({ name, type }) => {
    const value = attrValues[name];
    return (
      <tr key={name}>
        <th scope="row">{name}</th>
        <td>
          {FOLLOWABLE_ATTRS.has(name) ? (
            <AttributeLink onFollowPath={onFollowPath} value={value} />
          ) : isComplexValue(type, value) ? (
            renderComplex(value)
          ) : (
            JSON.stringify(value)
          )}
        </td>
      </tr>
    );
  });
}

export default AttributesInfo;
