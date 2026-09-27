import fc from 'fast-check';
import {
  ProgramBlueprintGenerator,
  SessionBlueprintGenerator,
  SessionGenerator,
  WeightGenerator,
} from '@/models/storage/generators';
import { describe, it, expect } from 'vitest';
import { Weight } from '@/models/weight';
import { ProgramBlueprint, SessionBlueprint } from '../blueprint-models';
import { Session } from '../session-models';
import { fromJsonString, toJsonString } from '@/models/storage/versions/latest';

describe('conversions', () => {
  describe.each`
    type                | initialValueGenerator        | assertEquals
    ${SessionBlueprint} | ${SessionBlueprintGenerator} | ${toJSONEquals}
    ${Session}          | ${SessionGenerator}          | ${toJSONEquals}
    ${ProgramBlueprint} | ${ProgramBlueprintGenerator} | ${toJSONEquals}
    ${Weight}           | ${WeightGenerator}           | ${toJSONEquals}
  `(
    'should convert back and forth between $type.name surviving an encoding',
    ({ initialValueGenerator, type, assertEquals }) => {
      it('with json', () => {
        fc.assert(
          fc.property(initialValueGenerator as fc.Arbitrary<unknown>, (initialValue) => {
            const converted = (initialValue as ToJSON).toJSON();
            const encoded = toJsonString(converted);
            const convertedBack = (type as FromJSON).fromJSON(fromJsonString(encoded));

            // oxlint-disable-next-line typescript/no-unsafe-call
            assertEquals(initialValue, convertedBack);
          }),
        );
      });
    },
  );
});

interface ToJSON {
  toJSON(): unknown;
}

interface FromJSON {
  fromJSON(t: unknown): unknown;
}

function toJSONEquals(a: ToJSON, b: ToJSON) {
  expect(b.toJSON()).toEqual(a.toJSON());
}
