import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTable, formatJson, formatCsv, formatOutput } from './formatter.js';

describe('formatTable', () => {
  it('should format data as ASCII table', () => {
    const headers = ['Name', 'Value'];
    const rows = [
      ['foo', 'bar'],
      ['baz', 'qux'],
    ];

    const result = formatTable(headers, rows);

    expect(result).toContain('Name');
    expect(result).toContain('Value');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
    expect(result).toContain('baz');
    expect(result).toContain('qux');
  });

  it('should handle empty rows', () => {
    const headers = ['Name', 'Value'];
    const rows: (string | number)[][] = [];

    const result = formatTable(headers, rows);

    expect(result).toContain('Name');
    expect(result).toContain('Value');
  });

  it('should convert numbers to strings', () => {
    const headers = ['Name', 'Count'];
    const rows = [['items', 42]];

    const result = formatTable(headers, rows);

    expect(result).toContain('42');
  });
});

describe('formatJson', () => {
  it('should format data as pretty JSON', () => {
    const data = [
      { name: 'foo', value: 'bar' },
      { name: 'baz', value: 'qux' },
    ];

    const result = formatJson(data);

    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it('should handle empty array', () => {
    const result = formatJson([]);
    expect(result).toBe('[]');
  });

  it('should handle objects with string and number values', () => {
    const data = [
      {
        name: 'test',
        count: 42,
        score: 3.14,
      },
    ];

    const result = formatJson(data);
    const parsed = JSON.parse(result);

    expect(parsed[0].name).toBe('test');
    expect(parsed[0].count).toBe(42);
    expect(parsed[0].score).toBe(3.14);
  });
});

describe('formatCsv', () => {
  it('should format data as CSV', () => {
    const headers = ['Name', 'Value'];
    const rows = [
      ['foo', 'bar'],
      ['baz', 'qux'],
    ];

    const result = formatCsv(headers, rows);

    expect(result).toContain('Name,Value');
    expect(result).toContain('foo,bar');
    expect(result).toContain('baz,qux');
  });

  it('should handle values with commas by quoting', () => {
    const headers = ['Name', 'Description'];
    const rows = [['foo', 'has, comma']];

    const result = formatCsv(headers, rows);

    expect(result).toContain('"has, comma"');
  });

  it('should handle values with quotes by escaping', () => {
    const headers = ['Name', 'Quote'];
    const rows = [['foo', 'says "hello"']];

    const result = formatCsv(headers, rows);

    // CSV escapes quotes by doubling them
    expect(result).toContain('""hello""');
  });

  it('should handle empty rows', () => {
    const headers = ['Name', 'Value'];
    const rows: (string | number)[][] = [];

    const result = formatCsv(headers, rows);

    expect(result.trim()).toBe('Name,Value');
  });
});

describe('formatOutput', () => {
  const headers = ['Name', 'Value'];
  const rows = [
    ['foo', 'bar'],
    ['baz', 'qux'],
  ];

  it('should format as table when format is "table"', () => {
    const result = formatOutput(headers, rows, 'table');

    expect(result).toContain('Name');
    expect(result).toContain('│'); // Table border character
  });

  it('should format as JSON when format is "json"', () => {
    const result = formatOutput(headers, rows, 'json');
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].Name).toBe('foo');
    expect(parsed[0].Value).toBe('bar');
  });

  it('should format as CSV when format is "csv"', () => {
    const result = formatOutput(headers, rows, 'csv');

    expect(result).toContain('Name,Value');
    expect(result).toContain('foo,bar');
  });

  it('should default to table format for unknown format', () => {
    // @ts-expect-error - testing invalid format
    const result = formatOutput(headers, rows, 'unknown');

    expect(result).toContain('│'); // Table border character
  });

  it('should map headers to JSON keys correctly', () => {
    const customHeaders = ['First Name', 'Last Name', 'Email'];
    const customRows = [['John', 'Doe', 'john@example.com']];

    const result = formatOutput(customHeaders, customRows, 'json');
    const parsed = JSON.parse(result);

    expect(parsed[0]['First Name']).toBe('John');
    expect(parsed[0]['Last Name']).toBe('Doe');
    expect(parsed[0]['Email']).toBe('john@example.com');
  });
});

describe('console output functions', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('success() should log to console', async () => {
    const { success } = await import('./formatter.js');
    success('Test message');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('error() should log to console.error', async () => {
    const { error } = await import('./formatter.js');
    error('Test error');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('info() should log to console', async () => {
    const { info } = await import('./formatter.js');
    info('Test info');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('warn() should log to console', async () => {
    const { warn } = await import('./formatter.js');
    warn('Test warning');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
