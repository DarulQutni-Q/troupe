import { describe, expect, it } from 'vitest'
import { linkHostLabel, splitLinks, trimUrlCandidate } from '../chat-links'

describe('splitLinks', () => {
  it('splits bare http(s) URLs out of text, keeping the text around them', () => {
    expect(splitLinks('Rekaman Day 2: https://zoom.us/rec/share/abc?x=1 Passcode: W')).toEqual([
      { kind: 'text', text: 'Rekaman Day 2: ' },
      { kind: 'link', url: 'https://zoom.us/rec/share/abc?x=1' },
      { kind: 'text', text: ' Passcode: W' }
    ])
  })

  it('leaves trailing sentence punctuation and unbalanced closers outside the link', () => {
    expect(splitLinks('see (https://x.dev/a).')).toEqual([
      { kind: 'text', text: 'see (' },
      { kind: 'link', url: 'https://x.dev/a' },
      { kind: 'text', text: ').' }
    ])
    expect(trimUrlCandidate('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)'
    )
    expect(trimUrlCandidate('https://x.dev/a?!,')).toBe('https://x.dev/a')
    expect(trimUrlCandidate('https://x.dev/(a)).')).toBe('https://x.dev/(a)')
  })

  it('trims a long run of closers in linear time', () => {
    const started = performance.now()
    expect(trimUrlCandidate(`https://example.com/${')'.repeat(50_000)}`)).toBe(
      'https://example.com/'
    )
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('ignores non-http schemes, a bare scheme, and text without links', () => {
    const hasLink = (text: string) => splitLinks(text).some((s) => s.kind === 'link')
    expect(hasLink('ftp://x.dev javascript:alert(1) mailto:a@b.c')).toBe(false)
    expect(hasLink('https:// nothing')).toBe(false)
    expect(splitLinks('plain words')).toEqual([{ kind: 'text', text: 'plain words' }])
  })

  it('finds several links on one line', () => {
    const links = splitLinks('a http://a.dev b https://b.dev/x')
      .filter((s) => s.kind === 'link')
      .map((s) => (s.kind === 'link' ? s.url : ''))
    expect(links).toEqual(['http://a.dev', 'https://b.dev/x'])
  })

  it('stops at composer sentinel characters', () => {
    expect(splitLinks('https://a.devskill')[0]).toEqual({
      kind: 'link',
      url: 'https://a.dev'
    })
  })

  it('labels a link by its host without www.', () => {
    expect(linkHostLabel('https://www.example.com/path')).toBe('example.com')
  })
})
