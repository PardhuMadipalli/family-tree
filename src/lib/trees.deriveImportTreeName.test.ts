// Feature: multiple-family-trees, Property 18: Import tree naming
//
// Validates: Requirements 7.7, 7.8
//
// `deriveImportTreeName(providedName, fileName?)` decides the name to use
// when importing a backup file as a new tree. The rules under test:
//
//   1. If `providedName` contains at least one non-whitespace character,
//      the trimmed value is used (Req 7.7).
//   2. Else if `fileName` is available and stripping the extension leaves a
//      non-empty trimmed string, that file-name-derived value is used
//      (Req 7.8).
//   3. Otherwise (no usable provided name and no usable file name) a
//      date-derived default of the shape `Imported tree YYYY-MM-DD` is
//      returned (Req 7.8).
//
// Three sub-properties below exercise each rule across many generated
// inputs. Each sub-property runs at least 100 fast-check iterations.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { deriveImportTreeName } from './trees';

describe('deriveImportTreeName naming rules', () => {
  // -----------------------------------------------------------------------
  // Sub-property 1 (Req 7.7): a provided name with at least one
  // non-whitespace character wins over any fileName, and the trimmed value
  // is what gets returned.
  // -----------------------------------------------------------------------
  it('returns trimmed provided name when it has any non-whitespace char', () => {
    // Generate a "core" string that is guaranteed to contain at least one
    // non-whitespace character, then optionally pad it with whitespace on
    // either side so the property exercises the trimming behaviour.
    const nonWhitespaceCore = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => s.trim().length > 0);
    const whitespacePad = fc.stringMatching(/^[ \t\n\r]*$/);

    const providedNameArb = fc
      .tuple(whitespacePad, nonWhitespaceCore, whitespacePad)
      .map(([leading, core, trailing]) => leading + core + trailing);

    // fileName can be anything (including undefined) — the rule says it
    // must be ignored when providedName has non-whitespace content.
    const anyFileNameArb = fc.option(fc.string({ maxLength: 60 }), {
      nil: undefined,
    });

    fc.assert(
      fc.property(providedNameArb, anyFileNameArb, (providedName, fileName) => {
        const result = deriveImportTreeName(providedName, fileName);
        expect(result).toBe(providedName.trim());
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Sub-property 2 (Req 7.8): when the provided name is empty/whitespace
  // (or undefined) and the fileName has a usable, extension-stripped value,
  // that file-name-derived value is what gets returned.
  // -----------------------------------------------------------------------
  it('returns extension-stripped file name when provided name is empty/whitespace', () => {
    // providedName: undefined, empty string, or whitespace-only.
    const emptyProvidedNameArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.stringMatching(/^[ \t\n\r]{1,10}$/),
    );

    // Build a fileName whose stem (everything before the final '.') is
    // non-empty after trimming. We construct stem + optional extension so
    // the predicate "stripped result is non-empty" is guaranteed by
    // construction without brittle filtering.
    //
    // The stem disallows '.' so there's a single, unambiguous extension
    // separator (or none at all when ext is empty).
    const stemArb = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => !s.includes('.') && s.trim().length > 0);
    const extensionArb = fc.oneof(
      fc.constant(''),
      fc
        .string({ minLength: 1, maxLength: 5 })
        .filter((s) => !s.includes('.'))
        .map((s) => `.${s}`),
    );

    fc.assert(
      fc.property(
        emptyProvidedNameArb,
        stemArb,
        extensionArb,
        (providedName, stem, ext) => {
          const fileName = stem + ext;
          const result = deriveImportTreeName(providedName, fileName);
          // Because the stem contains no '.', the only dot in `fileName`
          // (if any) is the extension separator. `stripFileExtension`
          // therefore returns exactly `stem`, and the helper returns it
          // trimmed.
          expect(result).toBe(stem.trim());
        },
      ),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Sub-property 3 (Req 7.8): when there is no usable provided name AND no
  // usable file name, a date-derived default of shape
  // `Imported tree YYYY-MM-DD` is returned.
  //
  // "No usable file name" here means undefined, empty, or whitespace-only
  // — these are the inputs that, after `stripFileExtension` + trim, leave
  // an empty string and therefore trigger the fall-through.
  // -----------------------------------------------------------------------
  it('returns date-derived default when neither provided name nor file name is usable', () => {
    const emptyProvidedNameArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.stringMatching(/^[ \t\n\r]{1,10}$/),
    );

    const unusableFileNameArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.stringMatching(/^[ \t\n\r]{1,10}$/),
    );

    const dateDerivedRegex = /^Imported tree \d{4}-\d{2}-\d{2}$/;

    fc.assert(
      fc.property(
        emptyProvidedNameArb,
        unusableFileNameArb,
        (providedName, fileName) => {
          const result = deriveImportTreeName(providedName, fileName);
          expect(result).toMatch(dateDerivedRegex);
        },
      ),
      { numRuns: 100 },
    );
  });
});
