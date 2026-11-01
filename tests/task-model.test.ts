import { validateTaskTitle } from '../src/features/tasks/model';

describe('TM-01 title validation', () => {
  test.each(['', '   ', '\t\n\r\v\f\u00a0\u2028\u2029\ufeff'])(
    'rejects empty or whitespace-only input %j and preserves it',
    (input) => {
      expect(validateTaskTitle(input)).toEqual({ ok: false, input, error: 'required' });
    },
  );

  test('trims ECMAScript whitespace at the edges and preserves internal spaces', () => {
    expect(validateTaskTitle('\ufeff\t\n  Купить  молоко  \r\n\u00a0')).toEqual({
      ok: true,
      title: 'Купить  молоко',
    });
  });

  test('preserves case, internal tabs and Unicode representation', () => {
    expect(validateTaskTitle('  A\t e\u0301  B  ')).toEqual({
      ok: true,
      title: 'A\t e\u0301  B',
    });
  });

  test.each([1, 100])('accepts %i code points after trimming', (length) => {
    const title = 'я'.repeat(length);
    expect(validateTaskTitle(`  ${title}  `)).toEqual({ ok: true, title });
  });

  test('rejects 101 code points without truncating the original input', () => {
    const input = `  ${'я'.repeat(101)}  `;
    expect(validateTaskTitle(input)).toEqual({ ok: false, input, error: 'tooLong' });
  });

  test('accepts 99 letters plus an emoji as 100 code points', () => {
    const title = `${'я'.repeat(99)}😀`;
    expect(validateTaskTitle(title)).toEqual({ ok: true, title });
  });

  test('counts astral characters as code points rather than UTF-16 units', () => {
    expect(validateTaskTitle('😀'.repeat(100))).toEqual({ ok: true, title: '😀'.repeat(100) });
    const input = '😀'.repeat(101);
    expect(validateTaskTitle(input)).toEqual({ ok: false, input, error: 'tooLong' });
  });

  test('counts combining sequences as code points rather than graphemes', () => {
    const input = 'e\u0301'.repeat(51);
    expect(validateTaskTitle(input)).toEqual({ ok: false, input, error: 'tooLong' });
  });

  test.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['CRLF', '\r\n'],
    ['VT', '\v'],
    ['FF', '\f'],
    ['NEL', '\u0085'],
    ['LS', '\u2028'],
    ['PS', '\u2029'],
  ])('rejects pasted internal %s without removing or replacing input', (_, separator) => {
    const input = `  Купить${separator}молоко  `;
    expect(validateTaskTitle(input)).toEqual({ ok: false, input, error: 'singleLine' });
  });

  test('does not trim NEL because ECMAScript trim does not treat it as whitespace', () => {
    const input = '\u0085Задача\u0085';
    expect(validateTaskTitle(input)).toEqual({ ok: false, input, error: 'singleLine' });
  });
});
