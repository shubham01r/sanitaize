/** @param {string} text @param {{rehydrateText:(value:string)=>string}} vault */
export function replaceMocks(text, vault) {
  return vault.rehydrateText(text);
}

export class StreamRehydrator {
  /** @param {{rehydrateText:(value:string)=>string,longestMockPrefixSuffix:(value:string,minStart?:number)=>number,findMockMatches:(value:string)=>Array<{start:number,end:number}>}} vault */
  constructor(vault) {
    this.vault = vault;
    this.pending = '';
  }

  /** @param {string} delta */
  push(delta) {
    const buffer = this.pending + delta;
    const matches = this.vault.findMockMatches(buffer);
    const floor = matches.length ? (matches.at(-1)?.end ?? 0) : 0;
    const hold = this.vault.longestMockPrefixSuffix(buffer, floor);
    const head = buffer.slice(0, buffer.length - hold);
    this.pending = buffer.slice(buffer.length - hold);
    return this.vault.rehydrateText(head);
  }

  flush() {
    const output = this.vault.rehydrateText(this.pending);
    this.pending = '';
    return output;
  }
}

/**
 * @param {{vault:any, locate:(json:any)=>Array<any>, makeFlushEvent?:(key:string,text:string)=>any}} options
 */
export function createJsonDeltaHandler({ vault, locate, makeFlushEvent }) {
  /** @type {Map<string, StreamRehydrator>} */
  const rehydrators = new Map();
  return {
    /** @param {any} event */
    onEvent(event) {
      if (event.data === '[DONE]') return [event];
      try {
        const json = JSON.parse(event.data);
        for (const slot of locate(json)) {
          let rehydrator = rehydrators.get(slot.key);
          if (!rehydrator) {
            rehydrator = new StreamRehydrator(vault);
            rehydrators.set(slot.key, rehydrator);
          }
          if (slot.mode === 'cumulative') {
            slot.set(vault.rehydrateText(slot.get()));
          } else {
            slot.set(rehydrator.push(slot.get()));
          }
        }
        return [{ ...event, data: JSON.stringify(json), raw: undefined }];
      } catch {
        return [event];
      }
    },
    onEnd() {
      const events = [];
      for (const [key, rehydrator] of rehydrators) {
        const text = rehydrator.flush();
        if (text)
          events.push(
            makeFlushEvent?.(key, text) ?? {
              data: JSON.stringify({ p: key, o: 'append', v: text }),
            },
          );
      }
      return events;
    },
  };
}
