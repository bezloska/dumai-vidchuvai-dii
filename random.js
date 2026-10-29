// Same six-face rejection sampling and no-consecutive-combination rule.
export function randomFace() {
  const buffer = new Uint32Array(1);
  const limit = 4294967292;
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % 6;
}
export function nextRoll(previous) {
  const signs = ['+', '−', '+', '−', '+', '−'];
  let numberFace, signFace;
  do {
    numberFace = randomFace();
    signFace = randomFace();
  } while (previous && previous.number === numberFace + 1 && previous.sign === signs[signFace]);
  return {number: numberFace + 1, sign: signs[signFace], numberFace, signFace};
}
export function stepWord(number) {
  return number === 1 ? 'крок' : number <= 4 ? 'кроки' : 'кроків';
}
