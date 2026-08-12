import { type Entity } from '@h5web/shared/hdf5-models';
import {
  boolType,
  compoundType,
  cplxType,
  floatType,
  intType,
  strType,
} from '@h5web/shared/hdf5-utils';
import {
  assertMockAttribute,
  dataset,
  withImageAttr,
} from '@h5web/shared/mock-utils';
import { describe, expect, it } from 'vitest';

import { type AttrValuesStore } from '../../providers/models';
import { CORE_VIS } from './visualizations';

const mockStore = {
  get: async (entity: Entity): Promise<unknown> => {
    return Object.fromEntries(
      entity.attributes.map((attr) => {
        assertMockAttribute(attr);
        return [attr.name, attr.value];
      }),
    );
  },
};

const scalarInt = dataset('int', intType(), []);
const scalarUint = dataset('uint', intType(false), []);
const scalarBigInt = dataset('bigint', intType(true, 64), []);
const scalarFloat = dataset('float', floatType(), []);
const scalarStr = dataset('float', strType(), []);
const scalarBool = dataset('bool', boolType(intType(true, 8)), []);
const scalarCplx = dataset('cplx', cplxType(floatType()), []);
const scalarCompound = dataset('comp', compoundType({ int: intType() }), []);
const oneDInt = dataset('int_1d', intType(), [5]);
const oneDUint = dataset('uint_1d', intType(false), [5]);
const oneDBigUint = dataset('biguint_1d', intType(false, 64), [5]);
const oneDBool = dataset('bool_1d', boolType(intType(true, 8)), [3]);
const oneDCplx = dataset('cplx_1d', cplxType(floatType()), [10]);
const oneDCompound = dataset('comp_1d', compoundType({ int: intType() }), [5]);
const twoDInt = dataset('int_2d', intType(), [5, 3]);
const twoDUint = dataset('uint_2d', intType(false), [5, 3]);
const twoDBool = dataset('bool_2d', boolType(intType(true, 8)), [3, 2]);
const twoDCplx = dataset('cplx_2d', cplxType(floatType()), [2, 2]);
const twoDStr = dataset('str_2d', strType(), [5, 3]);
const threeDFloat = dataset('float_3d', intType(), [5, 3, 1]);
const threeDCplx = dataset('cplx_3d', cplxType(floatType()), [5, 2, 2]);
const twoDCompound = dataset(
  'comp_2d',
  compoundType({ int: intType() }),
  [5, 3],
);

const image = withImageAttr(dataset('image', intType(), [256, 256, 3]));
const imageFloat = withImageAttr(
  dataset('image_float', floatType(), [256, 256, 3]),
);
const imageStr = withImageAttr(dataset('image_str', strType(), [256, 256, 3]));
const imageScalar = withImageAttr(dataset('image_scalar', intType(), []));

const nestedCompound = dataset(
  'comp_nested',
  compoundType({ comp: compoundType({ int: intType() }) }),
  [2],
);

describe('Raw', () => {
  const { supportsDataset } = CORE_VIS.Raw;

  it('should support any dataset', async () => {
    await expect(supportsDataset(scalarInt)).resolves.toBe(true);
    await expect(supportsDataset(twoDStr)).resolves.toBe(true);
  });
});

describe('Scalar', () => {
  const { supportsDataset } = CORE_VIS.Scalar;

  it('should support dataset with printable type and scalar shape', async () => {
    await expect(supportsDataset(scalarInt)).resolves.toBe(true);
    await expect(supportsDataset(scalarUint)).resolves.toBe(true);
    await expect(supportsDataset(scalarBigInt)).resolves.toBe(true);
    await expect(supportsDataset(scalarFloat)).resolves.toBe(true);
    await expect(supportsDataset(scalarStr)).resolves.toBe(true);
    await expect(supportsDataset(scalarBool)).resolves.toBe(true);
    await expect(supportsDataset(scalarCplx)).resolves.toBe(true);
  });

  it('should not support dataset with non-printable type', async () => {
    await expect(supportsDataset(scalarCompound)).resolves.toBe(false);
  });

  it('should not support dataset with non-scalar shape', async () => {
    await expect(supportsDataset(oneDInt)).resolves.toBe(false);
  });
});

describe('Matrix', () => {
  const { supportsDataset } = CORE_VIS.Matrix;

  it('should support array dataset with printable type and at least one dimension', async () => {
    await expect(supportsDataset(oneDInt)).resolves.toBe(true);
    await expect(supportsDataset(oneDUint)).resolves.toBe(true);
    await expect(supportsDataset(oneDBigUint)).resolves.toBe(true);
    await expect(supportsDataset(twoDStr)).resolves.toBe(true);
    await expect(supportsDataset(twoDCplx)).resolves.toBe(true);
    await expect(supportsDataset(threeDFloat)).resolves.toBe(true);
    await expect(supportsDataset(oneDBool)).resolves.toBe(true);
  });

  it('should not support dataset with non-printable type', async () => {
    await expect(supportsDataset(oneDCompound)).resolves.toBe(false);
  });

  it('should not support dataset with non-array shape', async () => {
    await expect(supportsDataset(scalarInt)).resolves.toBe(false);
  });
});

describe('Line', () => {
  const { supportsDataset } = CORE_VIS.Line;

  it('should support array dataset with numeric-like type and at least one dimension', async () => {
    await expect(supportsDataset(oneDInt)).resolves.toBe(true);
    await expect(supportsDataset(oneDUint)).resolves.toBe(true);
    await expect(supportsDataset(oneDBigUint)).resolves.toBe(true);
    await expect(supportsDataset(oneDBool)).resolves.toBe(true);
    await expect(supportsDataset(twoDBool)).resolves.toBe(true);
    await expect(supportsDataset(threeDFloat)).resolves.toBe(true);
  });

  it('should not support dataset with non-numeric-like type', async () => {
    await expect(supportsDataset(twoDStr)).resolves.toBe(false);
  });

  it('should not support dataset with non-array shape', async () => {
    await expect(supportsDataset(scalarInt)).resolves.toBe(false);
  });
});

describe('Complex Line', () => {
  const { supportsDataset } = CORE_VIS.ComplexLine;

  it('should support array dataset with complex type and at least one dimension', async () => {
    await expect(supportsDataset(oneDCplx)).resolves.toBe(true);
  });

  it('should not support dataset with non-complex type', async () => {
    await expect(supportsDataset(twoDInt)).resolves.toBe(false);
    await expect(supportsDataset(oneDUint)).resolves.toBe(false);
    await expect(supportsDataset(twoDStr)).resolves.toBe(false);
  });

  it('should not support dataset with non-array shape', async () => {
    await expect(supportsDataset(scalarCplx)).resolves.toBe(false);
  });
});

describe('Heatmap', () => {
  const { supportsDataset } = CORE_VIS.Heatmap;

  it('should support array dataset with numeric-like type and at least two dimensions', async () => {
    await expect(supportsDataset(twoDInt)).resolves.toBe(true);
    await expect(supportsDataset(twoDUint)).resolves.toBe(true);
    await expect(supportsDataset(twoDBool)).resolves.toBe(true);
    await expect(supportsDataset(threeDFloat)).resolves.toBe(true);
  });

  it('should not support dataset with non-numeric-like type', async () => {
    await expect(supportsDataset(twoDStr)).resolves.toBe(false);
  });

  it('should not support dataset with non-array shape', async () => {
    await expect(supportsDataset(scalarInt)).resolves.toBe(false);
  });

  it('should not support dataset with less than two dimensions', async () => {
    await expect(supportsDataset(oneDInt)).resolves.toBe(false);
  });
});

describe('Complex Heatmap', () => {
  const { supportsDataset } = CORE_VIS.ComplexHeatmap;

  it('should support array dataset with complex type and at least two dimensions', async () => {
    await expect(supportsDataset(twoDCplx)).resolves.toBe(true);
    await expect(supportsDataset(threeDCplx)).resolves.toBe(true);
  });

  it('should not support dataset with non-complex type', async () => {
    await expect(supportsDataset(twoDUint)).resolves.toBe(false);
    await expect(supportsDataset(twoDInt)).resolves.toBe(false);
    await expect(supportsDataset(threeDFloat)).resolves.toBe(false);
    await expect(supportsDataset(twoDStr)).resolves.toBe(false);
  });

  it('should not support dataset with non-array shape', async () => {
    await expect(supportsDataset(scalarCplx)).resolves.toBe(false);
  });

  it('should not support dataset with less than two dimensions', async () => {
    await expect(supportsDataset(oneDCplx)).resolves.toBe(false);
  });
});

describe('RGB', () => {
  const { supportsDataset } = CORE_VIS.RGB;

  it('should support array dataset with IMAGE attribute and numeric type', async () => {
    await expect(
      supportsDataset(image, mockStore as AttrValuesStore),
    ).resolves.toBe(true);
    await expect(
      supportsDataset(imageFloat, mockStore as AttrValuesStore),
    ).resolves.toBe(true);
  });

  it('should not support dataset with non-numeric type', async () => {
    await expect(
      supportsDataset(imageStr, mockStore as AttrValuesStore),
    ).resolves.toBe(false);
  });

  it('should not support dataset with non-array shape', async () => {
    await expect(
      supportsDataset(imageScalar, mockStore as AttrValuesStore),
    ).resolves.toBe(false);
  });
});

describe('Compound', () => {
  const { supportsDataset } = CORE_VIS.Compound;

  it('should support scalar dataset with printable compound type', async () => {
    await expect(supportsDataset(scalarCompound)).resolves.toBe(true);
  });

  it('should support array dataset with printable compound type and at least one dimension', async () => {
    await expect(supportsDataset(oneDCompound)).resolves.toBe(true);
    await expect(supportsDataset(twoDCompound)).resolves.toBe(true);
  });

  it('should not support dataset with non-compound type or non-printable compound type', async () => {
    await expect(supportsDataset(oneDInt)).resolves.toBe(false);
    await expect(supportsDataset(nestedCompound)).resolves.toBe(false);
  });
});
