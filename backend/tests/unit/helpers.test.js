const { describe, it, expect } = require('@jest/globals');
const { slugify, paginate, paginateMeta, generateNumber, omit, pick } = require('../../src/utils/helpers');

describe('Helpers', () => {
  describe('slugify', () => {
    it('converts to lowercase kebab-case', () => {
      expect(slugify('Hello World!')).toBe('hello-world');
      expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
      expect(slugify('Special#$%Chars')).toBe('specialchars');
    });
  });

  describe('paginate', () => {
    it('returns correct take and skip', () => {
      expect(paginate(1, 20)).toEqual({ take: 20, skip: 0 });
      expect(paginate(2, 10)).toEqual({ take: 10, skip: 10 });
      expect(paginate(3, 15)).toEqual({ take: 15, skip: 30 });
    });

    it('caps limit at 100', () => {
      expect(paginate(1, 500)).toEqual({ take: 100, skip: 0 });
    });

    it('handles page 0 (clamps to 1)', () => {
      expect(paginate(0, 20)).toEqual({ take: 20, skip: 0 });
    });
  });

  describe('paginateMeta', () => {
    it('calculates total pages correctly', () => {
      const meta = paginateMeta(100, 1, 20);
      expect(meta.totalPages).toBe(5);
      expect(meta.hasNextPage).toBe(true);
      expect(meta.hasPrevPage).toBe(false);
    });

    it('detects last page', () => {
      const meta = paginateMeta(50, 5, 10);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPrevPage).toBe(true);
    });
  });

  describe('generateNumber', () => {
    it('pads numbers correctly', () => {
      expect(generateNumber('INV', 1)).toBe('INV-00001');
      expect(generateNumber('TKT', 100)).toBe('TKT-00100');
      expect(generateNumber('ORD', 99999)).toBe('ORD-99999');
    });
  });

  describe('pick', () => {
    it('picks only specified keys', () => {
      const result = pick({ a: 1, b: 2, c: 3 }, ['a', 'c']);
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });

  describe('omit', () => {
    it('omits specified keys', () => {
      const result = omit({ a: 1, b: 2, c: 3 }, ['b']);
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });
});
