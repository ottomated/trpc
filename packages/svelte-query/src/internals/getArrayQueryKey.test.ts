import { getArrayQueryKey } from './getArrayQueryKey';

test('getArrayQueryKey', () => {
  // empty path should not nest an extra array
  expect(getArrayQueryKey([], undefined, 'any')).toMatchInlineSnapshot(
    `Array []`,
  );

  // should not nest an empty object
  expect(getArrayQueryKey(['foo'], undefined, 'any')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
    ]
  `);
  expect(getArrayQueryKey(['foo'], undefined, 'query')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "query",
      },
    ]
  `);
  expect(getArrayQueryKey(['foo'], 'bar', 'any')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "input": "bar",
      },
    ]
  `);
  expect(getArrayQueryKey(['foo'], undefined, 'infinite'))
    .toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "infinite",
      },
    ]
  `);
  expect(getArrayQueryKey([], 'input', 'infinite')).toMatchInlineSnapshot(`
    Array [
      Array [],
      Object {
        "input": "input",
        "type": "infinite",
      },
    ]
  `);
  expect(getArrayQueryKey(['post', 'byId'], '1', 'query'))
    .toMatchInlineSnapshot(`
    Array [
      Array [
        "post",
        "byId",
      ],
      Object {
        "input": "1",
        "type": "query",
      },
    ]
  `);
});
