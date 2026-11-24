import {describe,it,expect} from 'vitest';
import {resolveEpubChapterTitle, shortenEpubChapterTitle} from './epubChapterLabel';

const outline = [
  {title: 'Capa', pageIndex: 0},
  {title: 'Folha de rosto', pageIndex: 1},
  {title: 'Parte 1', pageIndex: 4, children: [
    {title: 'Capítulo 1', pageIndex: 4},
    {title: 'Capítulo 2', pageIndex: 6},
  ]},
  {title: 'Capítulo 11', pageIndex: 20},
  {title: 'Notas', pageIndex: -1},
];

describe('resolveEpubChapterTitle', () => {
  it('names the TOC entry the reader is in, not the file index', () => {
    expect(resolveEpubChapterTitle(outline, 20)).toBe('Capítulo 11');
    expect(resolveEpubChapterTitle(outline, 21)).toBe('Capítulo 11');
    expect(resolveEpubChapterTitle(outline, 5)).toBe('Capítulo 1');
    expect(resolveEpubChapterTitle(outline, 7)).toBe('Capítulo 2');
    expect(resolveEpubChapterTitle(outline, 2)).toBe('Folha de rosto');
  });
  it('gives no name when several chapters share the file', () => {
    const oneFile = [{title: 'Livro', pageIndex: 1}, ...['I', 'II', 'III'].map(title => ({title, pageIndex: 3}))];
    expect(resolveEpubChapterTitle(oneFile, 3)).toBeNull();
    expect(resolveEpubChapterTitle(oneFile, 2)).toBe('Livro');
  });
  it('returns null without a usable entry', () => {
    expect(resolveEpubChapterTitle([], 3)).toBeNull();
    expect(resolveEpubChapterTitle([{title: 'Notas', pageIndex: -1}], 3)).toBeNull();
    expect(resolveEpubChapterTitle(outline, -1)).toBeNull();
  });
  it('shortens long titles for the progress label', () => {
    expect(shortenEpubChapterTitle('Capítulo 11')).toBe('Capítulo 11');
    expect(shortenEpubChapterTitle('Um título de capítulo bem comprido demais')).toBe('Um título de…');
  });
});
