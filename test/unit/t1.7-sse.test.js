import { describe, expect, it } from 'vitest';
import { SseParser, serializeSse } from '../../src/core/sse.js';

function parseAll(chunks) {
  const parser = new SseParser();
  return chunks.flatMap((chunk) => parser.push(chunk)).concat(parser.end());
}

describe('T1.7 SSE parser', () => {
  it('parses LF, CRLF, and CR event terminators', () => {
    const events = parseAll(['data: one\n\n', 'data: two\r\n\r\n', 'data: three\r\r']);
    expect(events.map((event) => event.data)).toEqual(['one', 'two', 'three']);
  });

  it('joins multi-line data and preserves event metadata', () => {
    const [event] = parseAll(['event: update\nid: 7\nretry: 1000\ndata: first\ndata: second\n\n']);
    expect(event).toMatchObject({ event: 'update', id: '7', retry: 1000, data: 'first\nsecond' });
  });

  it('waits for a CRLF terminator split across chunks before dispatching', () => {
    const parser = new SseParser();
    expect(parser.push('data: split\r')).toEqual([]);
    const events = parser.push('\n\r\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('split');
  });

  it('retains incomplete trailing events until end', () => {
    const parser = new SseParser();
    expect(parser.push('data: partial')).toEqual([]);
    const [event] = parser.end();
    expect(event.data).toBe('partial');
  });

  it('passes comment lines through in raw event data', () => {
    const [event] = parseAll([': keepalive\ndata: value\n\n']);
    expect(event.raw).toContain(': keepalive');
    expect(event.data).toBe('value');
  });

  it('serializes an unmodified event byte-faithfully', () => {
    const raw = 'event: update\r\ndata: value\r\n\r\n';
    const [event] = parseAll([raw]);
    expect(serializeSse(event)).toBe(raw);
  });

  it('serializes a modified event with the standard SSE shape', () => {
    expect(serializeSse({ event: 'update', data: 'new', id: '2', retry: 50 })).toBe(
      'event: update\nid: 2\nretry: 50\ndata: new\n\n',
    );
  });
});
