import Table from 'cli-table3';
import chalk from 'chalk';
import { stringify } from 'csv-stringify/sync';
import type { FormattedRow } from '../types/index.js';

export function formatTable(headers: string[], rows: (string | number)[][]): string {
  const table = new Table({
    head: headers.map(h => chalk.cyan(h)),
    style: {
      head: [],
      border: [],
    },
  });

  rows.forEach(row => {
    table.push(row.map(cell => String(cell)));
  });

  return table.toString();
}

export function formatJson(data: FormattedRow[]): string {
  return JSON.stringify(data, null, 2);
}

export function formatCsv(headers: string[], rows: (string | number)[][]): string {
  const data = [headers, ...rows];
  return stringify(data);
}

export function formatOutput(
  headers: string[],
  rows: (string | number)[][],
  format: 'table' | 'json' | 'csv'
): string {
  switch (format) {
    case 'json': {
      const data = rows.map(row => {
        const obj: FormattedRow = {};
        headers.forEach((header, i) => {
          obj[header] = row[i];
        });
        return obj;
      });
      return formatJson(data);
    }
    case 'csv':
      return formatCsv(headers, rows);
    case 'table':
    default:
      return formatTable(headers, rows);
  }
}

export function success(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function error(message: string): void {
  console.error(chalk.red('✗'), message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function warn(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}
