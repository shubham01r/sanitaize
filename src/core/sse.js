export class SseParser {
  constructor() {
    this.buffer = '';
    this.event = null;
    /** @type {string[]} */
    this.data = [];
    this.raw = '';
    this.id = undefined;
    this.retry = undefined;
  }

  /**
   * @param {string} chunk
   * @param {boolean} [flush]
   * @returns {any[]}
   */
  processBuffer(chunk, flush = false) {
    this.buffer += chunk;
    const events = [];
    while (this.buffer) {
      const index = this.buffer.search(/[\r\n]/);
      if (index === -1) break;
      const character = this.buffer[index];
      if (character === '\r' && index === this.buffer.length - 1 && !flush) break;
      const terminatorLength = character === '\r' && this.buffer[index + 1] === '\n' ? 2 : 1;
      const line = this.buffer.slice(0, index);
      const terminator = this.buffer.slice(index, index + terminatorLength);
      this.buffer = this.buffer.slice(index + terminatorLength);
      this.raw += line + terminator;
      const event = this.consumeLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  /** @param {string} chunk */
  push(chunk) {
    return this.processBuffer(chunk, false);
  }

  /** @param {string} line */
  consumeLine(line) {
    if (line === '') {
      if (this.data.length === 0 && this.event === null && this.raw === '') return null;
      const event = {
        event: this.event ?? undefined,
        data: this.data.join('\n'),
        id: this.id ?? undefined,
        retry: this.retry ?? undefined,
        raw: this.raw,
      };
      this.resetEvent();
      return event;
    }
    if (line.startsWith(':')) return null;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    else if (field === 'event') this.event = value;
    else if (field === 'id') this.id = value;
    else if (field === 'retry' && /^\d+$/.test(value)) this.retry = Number(value);
    return null;
  }

  resetEvent() {
    this.event = null;
    this.data = [];
    this.raw = '';
  }

  end() {
    const events = this.processBuffer('', true);
    if (this.buffer) {
      const line = this.buffer;
      this.buffer = '';
      this.raw += line;
      this.consumeLine(line);
    }
    if (this.data.length > 0 || this.event !== null || this.raw) {
      events.push({
        event: this.event ?? undefined,
        data: this.data.join('\n'),
        id: this.id ?? undefined,
        retry: this.retry ?? undefined,
        raw: this.raw,
      });
      this.resetEvent();
    }
    return events;
  }
}

/** @param {{event?:string,data:string,id?:string,retry?:number,raw?:string}} event */
export function serializeSse(event) {
  if (event.raw) return event.raw;
  let output = '';
  if (event.event !== undefined) output += `event: ${event.event}\n`;
  if (event.id !== undefined) output += `id: ${event.id}\n`;
  if (event.retry !== undefined) output += `retry: ${event.retry}\n`;
  output += `data: ${event.data}\n\n`;
  return output;
}
