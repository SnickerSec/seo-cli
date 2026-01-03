import { Command } from 'commander';
import * as cheerio from 'cheerio';
import { error, success, info, warn } from '../lib/formatter.js';
import { validateUrl } from '../lib/utils.js';
import Table from 'cli-table3';
import chalk from 'chalk';

interface ContentStats {
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
}

interface ReadabilityScores {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  gunningFog: number;
  smogIndex: number;
  colemanLiauIndex: number;
  automatedReadabilityIndex: number;
  averageGradeLevel: number;
}

interface KeywordAnalysis {
  word: string;
  count: number;
  density: number;
}

interface ContentResult {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: { level: number; text: string }[];
  stats: ContentStats;
  readability: ReadabilityScores;
  keywords: KeywordAnalysis[];
  twoWordPhrases: KeywordAnalysis[];
  threeWordPhrases: KeywordAnalysis[];
  issues: string[];
  recommendations: string[];
}

// Common English stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
  'once', 'if', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'while', 'our', 'your', 'their',
  'my', 'his', 'her', 'up', 'down', 'out', 'off', 'over', 'any', 'get', 'got', 'us',
  'me', 'him', 'them', 'am', 'being', 'because', 'until', 'against', 'even', 'much',
]);

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  // Remove silent e at end
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

function extractText(html: string): { text: string; paragraphs: string[] } {
  const $ = cheerio.load(html);

  // Remove script, style, nav, footer, header, aside elements
  $('script, style, nav, footer, header, aside, noscript, iframe, svg').remove();

  // Get main content areas
  const mainContent = $('main, article, .content, .post, .entry, #content, #main').first();
  const $content = mainContent.length > 0 ? mainContent : $('body');

  const paragraphs: string[] = [];
  $content.find('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20) { // Filter out very short paragraphs
      paragraphs.push(text);
    }
  });

  // Get all text content
  const text = $content.text()
    .replace(/\s+/g, ' ')
    .trim();

  return { text, paragraphs };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1);
}

function getSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, '$1|')
    .split('|')
    .filter(s => s.trim().length > 0);
}

function calculateStats(text: string, paragraphs: string[]): ContentStats {
  const words = tokenize(text);
  const sentences = getSentences(text);

  const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  return {
    wordCount: words.length,
    characterCount: text.replace(/\s/g, '').length,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    avgWordsPerSentence: sentences.length > 0 ? words.length / sentences.length : 0,
    avgSyllablesPerWord: words.length > 0 ? totalSyllables / words.length : 0,
  };
}

function calculateReadability(stats: ContentStats): ReadabilityScores {
  const { wordCount, sentenceCount, avgWordsPerSentence, avgSyllablesPerWord, characterCount } = stats;

  if (wordCount === 0 || sentenceCount === 0) {
    return {
      fleschReadingEase: 0,
      fleschKincaidGrade: 0,
      gunningFog: 0,
      smogIndex: 0,
      colemanLiauIndex: 0,
      automatedReadabilityIndex: 0,
      averageGradeLevel: 0,
    };
  }

  // Flesch Reading Ease: 206.835 - 1.015(words/sentences) - 84.6(syllables/words)
  const fleschReadingEase = Math.max(0, Math.min(100,
    206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord)
  ));

  // Flesch-Kincaid Grade Level: 0.39(words/sentences) + 11.8(syllables/words) - 15.59
  const fleschKincaidGrade = Math.max(0,
    (0.39 * avgWordsPerSentence) + (11.8 * avgSyllablesPerWord) - 15.59
  );

  // Gunning Fog Index (approximation using syllables > 2 as complex words)
  const complexWordRatio = avgSyllablesPerWord > 1.5 ? (avgSyllablesPerWord - 1) * 0.3 : 0;
  const gunningFog = Math.max(0,
    0.4 * (avgWordsPerSentence + 100 * complexWordRatio)
  );

  // SMOG Index (approximation)
  const smogIndex = Math.max(0,
    1.0430 * Math.sqrt(complexWordRatio * 30 * sentenceCount) + 3.1291
  );

  // Coleman-Liau Index: 0.0588L - 0.296S - 15.8
  // L = avg letters per 100 words, S = avg sentences per 100 words
  const L = (characterCount / wordCount) * 100;
  const S = (sentenceCount / wordCount) * 100;
  const colemanLiauIndex = Math.max(0, (0.0588 * L) - (0.296 * S) - 15.8);

  // Automated Readability Index: 4.71(chars/words) + 0.5(words/sentences) - 21.43
  const automatedReadabilityIndex = Math.max(0,
    4.71 * (characterCount / wordCount) + 0.5 * avgWordsPerSentence - 21.43
  );

  // Average grade level
  const averageGradeLevel = (fleschKincaidGrade + gunningFog + smogIndex + colemanLiauIndex + automatedReadabilityIndex) / 5;

  return {
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
    gunningFog: Math.round(gunningFog * 10) / 10,
    smogIndex: Math.round(smogIndex * 10) / 10,
    colemanLiauIndex: Math.round(colemanLiauIndex * 10) / 10,
    automatedReadabilityIndex: Math.round(automatedReadabilityIndex * 10) / 10,
    averageGradeLevel: Math.round(averageGradeLevel * 10) / 10,
  };
}

function analyzeKeywords(text: string, topN: number = 15): KeywordAnalysis[] {
  const words = tokenize(text).filter(w => !STOP_WORDS.has(w) && w.length > 2);
  const totalWords = words.length;

  const frequency: Map<string, number> = new Map();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  return Array.from(frequency.entries())
    .map(([word, count]) => ({
      word,
      count,
      density: Math.round((count / totalWords) * 10000) / 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

function analyzeNGrams(text: string, n: number, topN: number = 10): KeywordAnalysis[] {
  const words = tokenize(text);
  const totalNGrams = words.length - n + 1;

  if (totalNGrams <= 0) return [];

  const frequency: Map<string, number> = new Map();

  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n);
    // Skip if any word is a stop word
    if (ngram.some(w => STOP_WORDS.has(w))) continue;

    const phrase = ngram.join(' ');
    frequency.set(phrase, (frequency.get(phrase) || 0) + 1);
  }

  return Array.from(frequency.entries())
    .filter(([_, count]) => count > 1) // Only phrases that appear more than once
    .map(([word, count]) => ({
      word,
      count,
      density: Math.round((count / totalNGrams) * 10000) / 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

function analyzeContent(result: ContentResult): void {
  const { stats, readability } = result;

  // Word count issues
  if (stats.wordCount < 300) {
    result.issues.push(`Low word count (${stats.wordCount}) - thin content`);
    result.recommendations.push('Aim for at least 300 words, ideally 1000+ for in-depth content');
  } else if (stats.wordCount < 600) {
    result.issues.push(`Word count (${stats.wordCount}) may be insufficient for ranking`);
    result.recommendations.push('Consider expanding content to 800-1500 words for better SEO');
  }

  // Readability issues
  if (readability.fleschReadingEase < 30) {
    result.issues.push('Content is very difficult to read (Flesch score < 30)');
    result.recommendations.push('Simplify language: use shorter sentences and simpler words');
  } else if (readability.fleschReadingEase < 50) {
    result.issues.push('Content is fairly difficult to read (Flesch score < 50)');
    result.recommendations.push('Consider breaking up complex sentences');
  }

  if (readability.averageGradeLevel > 12) {
    result.issues.push(`High reading level (grade ${readability.averageGradeLevel})`);
    result.recommendations.push('Target grade 8-10 reading level for broader audience');
  }

  // Sentence length
  if (stats.avgWordsPerSentence > 25) {
    result.issues.push(`Long average sentence length (${Math.round(stats.avgWordsPerSentence)} words)`);
    result.recommendations.push('Break up long sentences - aim for 15-20 words average');
  }

  // Paragraph count
  if (stats.paragraphCount < 3 && stats.wordCount > 200) {
    result.issues.push('Few paragraphs detected - content may lack structure');
    result.recommendations.push('Break content into more paragraphs for readability');
  }

  // Title issues
  if (!result.title) {
    result.issues.push('Missing page title');
  } else if (result.title.length > 60) {
    result.issues.push(`Title too long (${result.title.length} chars)`);
  } else if (result.title.length < 30) {
    result.issues.push(`Title may be too short (${result.title.length} chars)`);
  }

  // Meta description
  if (!result.metaDescription) {
    result.issues.push('Missing meta description');
    result.recommendations.push('Add a compelling meta description (150-160 chars)');
  } else if (result.metaDescription.length > 160) {
    result.issues.push(`Meta description too long (${result.metaDescription.length} chars)`);
  } else if (result.metaDescription.length < 70) {
    result.issues.push(`Meta description too short (${result.metaDescription.length} chars)`);
  }

  // H1 issues
  if (!result.h1) {
    result.issues.push('Missing H1 heading');
    result.recommendations.push('Add a single, descriptive H1 heading');
  }

  // Heading structure
  const h1Count = result.headings.filter(h => h.level === 1).length;
  if (h1Count > 1) {
    result.issues.push(`Multiple H1 tags (${h1Count}) - should have only one`);
  }

  // Keyword in important places
  if (result.keywords.length > 0) {
    const topKeyword = result.keywords[0].word;
    const titleLower = (result.title || '').toLowerCase();
    const h1Lower = (result.h1 || '').toLowerCase();
    const metaLower = (result.metaDescription || '').toLowerCase();

    if (!titleLower.includes(topKeyword)) {
      result.recommendations.push(`Consider adding top keyword "${topKeyword}" to title`);
    }
    if (!h1Lower.includes(topKeyword)) {
      result.recommendations.push(`Consider adding top keyword "${topKeyword}" to H1`);
    }
    if (!metaLower.includes(topKeyword)) {
      result.recommendations.push(`Consider adding top keyword "${topKeyword}" to meta description`);
    }
  }
}

async function fetchAndAnalyze(url: string): Promise<ContentResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SEO-CLI/1.0',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const h1 = $('h1').first().text().trim() || null;

  const headings: { level: number; text: string }[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = parseInt(el.tagName.substring(1));
    const text = $(el).text().trim();
    if (text) {
      headings.push({ level, text });
    }
  });

  const { text, paragraphs } = extractText(html);
  const stats = calculateStats(text, paragraphs);
  const readability = calculateReadability(stats);
  const keywords = analyzeKeywords(text);
  const twoWordPhrases = analyzeNGrams(text, 2);
  const threeWordPhrases = analyzeNGrams(text, 3);

  const result: ContentResult = {
    url,
    title,
    metaDescription,
    h1,
    headings,
    stats,
    readability,
    keywords,
    twoWordPhrases,
    threeWordPhrases,
    issues: [],
    recommendations: [],
  };

  analyzeContent(result);

  return result;
}

function getReadabilityLabel(score: number): string {
  if (score >= 90) return chalk.green('Very Easy');
  if (score >= 80) return chalk.green('Easy');
  if (score >= 70) return chalk.cyan('Fairly Easy');
  if (score >= 60) return chalk.cyan('Standard');
  if (score >= 50) return chalk.yellow('Fairly Difficult');
  if (score >= 30) return chalk.yellow('Difficult');
  return chalk.red('Very Difficult');
}

function getGradeLabel(grade: number): string {
  if (grade <= 6) return chalk.green(`Grade ${grade.toFixed(1)}`);
  if (grade <= 8) return chalk.cyan(`Grade ${grade.toFixed(1)}`);
  if (grade <= 10) return chalk.yellow(`Grade ${grade.toFixed(1)}`);
  if (grade <= 12) return chalk.yellow(`Grade ${grade.toFixed(1)} (High School)`);
  return chalk.red(`Grade ${grade.toFixed(1)} (College+)`);
}

export function createContentCommand(): Command {
  const cmd = new Command('content')
    .description('Analyze content readability and keyword density')
    .argument('<url>', 'URL to analyze')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-k, --keywords <number>', 'Number of top keywords to show', '15')
    .option('-t, --target <keyword>', 'Target keyword to check for')
    .action(async (url: string, options) => {
      try {
        if (!validateUrl(url)) {
          error('Invalid URL provided');
          process.exit(1);
        }

        info(`Analyzing content for ${url}...`);
        const result = await fetchAndAnalyze(url);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log();

        // Content Stats
        console.log(chalk.bold('Content Statistics:'));
        const statsTable = new Table({
          style: { head: ['cyan'] },
        });
        statsTable.push(
          ['Words', result.stats.wordCount.toLocaleString()],
          ['Characters', result.stats.characterCount.toLocaleString()],
          ['Sentences', result.stats.sentenceCount.toLocaleString()],
          ['Paragraphs', result.stats.paragraphCount.toLocaleString()],
          ['Avg Words/Sentence', result.stats.avgWordsPerSentence.toFixed(1)],
          ['Avg Syllables/Word', result.stats.avgSyllablesPerWord.toFixed(2)],
        );
        console.log(statsTable.toString());

        // Readability Scores
        console.log(chalk.bold('\nReadability Scores:'));
        const readTable = new Table({
          head: ['Metric', 'Score', 'Interpretation'],
          style: { head: ['cyan'] },
        });
        readTable.push(
          ['Flesch Reading Ease', result.readability.fleschReadingEase.toString(), getReadabilityLabel(result.readability.fleschReadingEase)],
          ['Flesch-Kincaid Grade', result.readability.fleschKincaidGrade.toString(), getGradeLabel(result.readability.fleschKincaidGrade)],
          ['Gunning Fog Index', result.readability.gunningFog.toString(), getGradeLabel(result.readability.gunningFog)],
          ['SMOG Index', result.readability.smogIndex.toString(), getGradeLabel(result.readability.smogIndex)],
          ['Coleman-Liau Index', result.readability.colemanLiauIndex.toString(), getGradeLabel(result.readability.colemanLiauIndex)],
          ['Automated Readability', result.readability.automatedReadabilityIndex.toString(), getGradeLabel(result.readability.automatedReadabilityIndex)],
          [chalk.bold('Average Grade Level'), chalk.bold(result.readability.averageGradeLevel.toString()), getGradeLabel(result.readability.averageGradeLevel)],
        );
        console.log(readTable.toString());

        // Target keyword check
        if (options.target) {
          const target = options.target.toLowerCase();
          console.log(chalk.bold(`\nTarget Keyword: "${options.target}"`));
          const keywordMatch = result.keywords.find(k => k.word === target);
          if (keywordMatch) {
            success(`Found ${keywordMatch.count} times (${keywordMatch.density}% density)`);
          } else {
            warn(`Keyword "${options.target}" not found in content`);
          }

          // Check placements
          const inTitle = (result.title || '').toLowerCase().includes(target);
          const inH1 = (result.h1 || '').toLowerCase().includes(target);
          const inMeta = (result.metaDescription || '').toLowerCase().includes(target);

          console.log(`  In Title: ${inTitle ? chalk.green('✓ Yes') : chalk.red('✗ No')}`);
          console.log(`  In H1: ${inH1 ? chalk.green('✓ Yes') : chalk.red('✗ No')}`);
          console.log(`  In Meta Desc: ${inMeta ? chalk.green('✓ Yes') : chalk.red('✗ No')}`);
        }

        // Top Keywords
        const keywordLimit = parseInt(options.keywords, 10);
        if (result.keywords.length > 0) {
          console.log(chalk.bold('\nTop Keywords:'));
          const kwTable = new Table({
            head: ['Keyword', 'Count', 'Density'],
            style: { head: ['cyan'] },
          });
          for (const kw of result.keywords.slice(0, keywordLimit)) {
            kwTable.push([kw.word, kw.count.toString(), `${kw.density}%`]);
          }
          console.log(kwTable.toString());
        }

        // Two-word phrases
        if (result.twoWordPhrases.length > 0) {
          console.log(chalk.bold('\nTop 2-Word Phrases:'));
          const phraseTable = new Table({
            head: ['Phrase', 'Count', 'Density'],
            style: { head: ['cyan'] },
          });
          for (const phrase of result.twoWordPhrases.slice(0, 10)) {
            phraseTable.push([phrase.word, phrase.count.toString(), `${phrase.density}%`]);
          }
          console.log(phraseTable.toString());
        }

        // Three-word phrases
        if (result.threeWordPhrases.length > 0) {
          console.log(chalk.bold('\nTop 3-Word Phrases:'));
          const phraseTable = new Table({
            head: ['Phrase', 'Count', 'Density'],
            style: { head: ['cyan'] },
          });
          for (const phrase of result.threeWordPhrases.slice(0, 10)) {
            phraseTable.push([phrase.word, phrase.count.toString(), `${phrase.density}%`]);
          }
          console.log(phraseTable.toString());
        }

        // Heading Structure
        if (result.headings.length > 0) {
          console.log(chalk.bold('\nHeading Structure:'));
          for (const h of result.headings.slice(0, 15)) {
            const indent = '  '.repeat(h.level - 1);
            const label = chalk.cyan(`H${h.level}`);
            const text = h.text.length > 60 ? h.text.substring(0, 60) + '...' : h.text;
            console.log(`${indent}${label} ${text}`);
          }
          if (result.headings.length > 15) {
            console.log(chalk.gray(`  ... and ${result.headings.length - 15} more headings`));
          }
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(chalk.bold('\nIssues:'));
          for (const issue of result.issues) {
            console.log(`  ${chalk.red('✗')} ${issue}`);
          }
        }

        // Recommendations
        if (result.recommendations.length > 0) {
          console.log(chalk.bold('\nRecommendations:'));
          for (const rec of result.recommendations) {
            console.log(`  ${chalk.yellow('→')} ${rec}`);
          }
        }

        if (result.issues.length === 0 && result.recommendations.length === 0) {
          console.log(chalk.green('\n✓ Content looks good!'));
        }

      } catch (e) {
        error(e instanceof Error ? e.message : 'Failed to analyze content');
        process.exit(1);
      }
    });

  return cmd;
}
