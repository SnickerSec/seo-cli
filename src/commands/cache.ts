import { Command } from 'commander';
import { clearCache, getCacheStats } from '../lib/cache.js';
import { formatTable, success, info } from '../lib/formatter.js';
import { formatBytes } from '../lib/utils.js';

export function createCacheCommand(): Command {
  const cache = new Command('cache')
    .description('Manage response cache');

  cache
    .command('status')
    .description('Show cache statistics')
    .action(() => {
      const stats = getCacheStats();

      console.log('\n');
      info('Cache Statistics\n');

      const rows = [
        ['Total Entries', stats.entries.toString()],
        ['Total Size', formatBytes(stats.size)],
      ];
      console.log(formatTable(['Metric', 'Value'], rows));

      if (Object.keys(stats.namespaces).length > 0) {
        console.log('\nBy Namespace:');
        const nsRows = Object.entries(stats.namespaces).map(([ns, count]) => [ns, count.toString()]);
        console.log(formatTable(['Namespace', 'Entries'], nsRows));
      }

      console.log('');
    });

  cache
    .command('clear [namespace]')
    .description('Clear cache (optionally for a specific namespace: moz, pagespeed, gsc, ga)')
    .action((namespace) => {
      const cleared = clearCache(namespace);
      success(`Cleared ${cleared} cache entries${namespace ? ` from ${namespace}` : ''}`);
    });

  return cache;
}
