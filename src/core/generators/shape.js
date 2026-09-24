/**
 * @param {string} value
 * @param {any} rand
 */
export function shapeMock(value, rand) {
  let output = '';
  for (const char of value) {
    if (/[0-9]/.test(char)) output += rand.digits(1);
    else if (/[A-Z]/.test(char)) output += rand.uppercase(1);
    else if (/[a-z]/.test(char)) output += rand.lowercase(1);
    else output += char;
  }
  return output === value
    ? `${output.slice(0, -1)}${output.slice(-1) === 'a' ? 'b' : 'a'}`
    : output;
}
