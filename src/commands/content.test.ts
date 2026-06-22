import { describe, it, expect } from 'vitest';
import {
  countSyllables,
  extractText,
  tokenize,
  getSentences,
  calculateStats,
  calculateReadability,
  analyzeKeywords,
  analyzeNGrams,
  analyzeContent
} from './content.js';
import type { ContentResult } from './content.js';

describe('content analyzer helpers', () => {
  describe('countSyllables', () => {
    it('should count syllables for basic words', () => {
      expect(countSyllables('cat')).toBe(1);
      expect(countSyllables('dog')).toBe(1);
      expect(countSyllables('hello')).toBe(2);
      expect(countSyllables('computer')).toBe(3);
      expect(countSyllables('beautiful')).toBe(4);
    });

    it('should handle silent e and suffixes at end of words', () => {
      // "rate" has silent e -> 1 syllable
      expect(countSyllables('rate')).toBe(1);
      // "hates" -> 1 syllable
      expect(countSyllables('hates')).toBe(1);
      // "baked" -> 1 syllable
      expect(countSyllables('baked')).toBe(1);
    });

    it('should fall back to 1 for short words of length 3 or less', () => {
      expect(countSyllables('a')).toBe(1);
      expect(countSyllables('go')).toBe(1);
      expect(countSyllables('the')).toBe(1);
    });
  });

  describe('extractText', () => {
    it('should strip scripts, styles, header, footer, and nav tags', () => {
      const html = `
        <html>
          <head><style>body { color: red; }</style></head>
          <body>
            <header>Site Header</header>
            <nav><a href="/">Home</a></nav>
            <main>
              <h1>Main Article Title</h1>
              <p>This is the first main paragraph that contains enough characters to be counted.</p>
              <script>console.log("hello");</script>
              <p>Here is another long paragraph that should also be extracted for indexing.</p>
            </main>
            <footer>Footer Info</footer>
          </body>
        </html>
      `;
      const { text, paragraphs } = extractText(html);
      
      expect(text).toContain('Main Article Title');
      expect(text).toContain('first main paragraph');
      expect(text).not.toContain('Site Header');
      expect(text).not.toContain('Home');
      expect(text).not.toContain('Footer Info');
      expect(text).not.toContain('console.log');
      
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0]).toBe('This is the first main paragraph that contains enough characters to be counted.');
    });
  });

  describe('tokenize & getSentences', () => {
    it('should tokenize text into clean lowercase words', () => {
      const tokens = tokenize('Hello, world! This is a test-case sentence.');
      expect(tokens).toEqual(['hello', 'world', 'this', 'is', 'test-case', 'sentence']);
    });

    it('should split text into sentences correctly', () => {
      const sentences = getSentences('Hello world. This is sentence two! And number three? Yes.');
      expect(sentences).toHaveLength(4);
      expect(sentences[0].trim()).toBe('Hello world.');
      expect(sentences[1].trim()).toBe('This is sentence two!');
    });
  });

  describe('calculateStats', () => {
    it('should calculate basic content statistics', () => {
      const text = 'This is a sample sentence. It has ten words total in this text.';
      const paragraphs = ['This is a sample sentence. It has ten words total in this text.'];
      const stats = calculateStats(text, paragraphs);

      expect(stats.wordCount).toBe(12);
      expect(stats.sentenceCount).toBe(2);
      expect(stats.paragraphCount).toBe(1);
      expect(stats.avgWordsPerSentence).toBe(6);
      expect(stats.avgSyllablesPerWord).toBeGreaterThan(1);
    });
  });

  describe('calculateReadability', () => {
    it('should calculate standard readability scores', () => {
      // Test data designed to represent a readable profile
      const stats = {
        wordCount: 100,
        characterCount: 450,
        sentenceCount: 10,
        paragraphCount: 3,
        avgWordsPerSentence: 10,  // 100 / 10
        avgSyllablesPerWord: 1.3, // 130 / 100
      };

      const readability = calculateReadability(stats);
      expect(readability.fleschReadingEase).toBeGreaterThan(50);
      expect(readability.fleschKincaidGrade).toBeLessThan(12);
      expect(readability.averageGradeLevel).toBeGreaterThan(0);
    });

    it('should return zeroes for empty stats', () => {
      const stats = {
        wordCount: 0,
        characterCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        avgWordsPerSentence: 0,
        avgSyllablesPerWord: 0,
      };

      const readability = calculateReadability(stats);
      expect(readability.fleschReadingEase).toBe(0);
      expect(readability.averageGradeLevel).toBe(0);
    });
  });

  describe('analyzeKeywords & analyzeNGrams', () => {
    it('should find top keywords excluding stop words', () => {
      const text = 'caching is good. caching speeds up things. caching is simple.';
      const keywords = analyzeKeywords(text, 3);
      
      expect(keywords[0].word).toBe('caching');
      expect(keywords[0].count).toBe(3);
    });

    it('should find common n-grams', () => {
      const text = 'google search console is helpful. google search console shows metrics.';
      const phrases = analyzeNGrams(text, 3, 2);

      expect(phrases).toHaveLength(1);
      expect(phrases[0].word).toBe('google search console');
      expect(phrases[0].count).toBe(2);
    });
  });

  describe('analyzeContent', () => {
    it('should flag short content and provide recommendations', () => {
      const result: ContentResult = {
        url: 'https://example.com',
        title: 'Short',
        metaDescription: 'Too short',
        h1: null,
        headings: [],
        stats: {
          wordCount: 150,
          characterCount: 600,
          sentenceCount: 10,
          paragraphCount: 1,
          avgWordsPerSentence: 15,
          avgSyllablesPerWord: 1.4,
        },
        readability: {
          fleschReadingEase: 60,
          fleschKincaidGrade: 8,
          gunningFog: 8,
          smogIndex: 8,
          colemanLiauIndex: 8,
          automatedReadabilityIndex: 8,
          averageGradeLevel: 8,
        },
        keywords: [{ word: 'seo', count: 5, density: 3.3 }],
        twoWordPhrases: [],
        threeWordPhrases: [],
        issues: [],
        recommendations: [],
      };

      analyzeContent(result);

      expect(result.issues).toContain('Low word count (150) - thin content');
      expect(result.issues).toContain('Missing H1 heading');
      expect(result.issues).toContain('Title may be too short (5 chars)');
      expect(result.issues).toContain('Meta description too short (9 chars)');
    });

    it('should suggest adding the top keyword to title/H1/meta if missing', () => {
      const result: ContentResult = {
        url: 'https://example.com',
        title: 'Learn Web Development',
        metaDescription: 'Tutorial about coding in javascript and typescript.',
        h1: 'Web Development Guide',
        headings: [{ level: 1, text: 'Web Development Guide' }],
        stats: {
          wordCount: 500,
          characterCount: 2000,
          sentenceCount: 25,
          paragraphCount: 5,
          avgWordsPerSentence: 20,
          avgSyllablesPerWord: 1.5,
        },
        readability: {
          fleschReadingEase: 50,
          fleschKincaidGrade: 10,
          gunningFog: 10,
          smogIndex: 10,
          colemanLiauIndex: 10,
          automatedReadabilityIndex: 10,
          averageGradeLevel: 10,
        },
        keywords: [
          { word: 'caching', count: 12, density: 2.4 },
        ],
        twoWordPhrases: [],
        threeWordPhrases: [],
        issues: [],
        recommendations: [],
      };

      analyzeContent(result);

      expect(result.recommendations).toContain('Consider adding top keyword "caching" to title');
      expect(result.recommendations).toContain('Consider adding top keyword "caching" to H1');
      expect(result.recommendations).toContain('Consider adding top keyword "caching" to meta description');
    });
  });
});
