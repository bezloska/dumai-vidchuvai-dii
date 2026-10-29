import { createDiceRenderer } from './dice3d.js';
import { nextRoll, stepWord } from './random.js';

const game = document.querySelector('.scene');
const viewport = document.querySelector('#dice-viewport');
const rollButton = document.querySelector('#roll');
const result = document.querySelector('#result');
const resultCopy = document.querySelector('.result-copy');
const resultSign = document.querySelector('.result-sign');
const status = document.querySelector('#game-status');
const numberLabel = document.querySelector('#number-label');
const signLabel = document.querySelector('#sign-label');
let renderer;
let previous = null;
let completedRolls = 0;

function setResult(number, sign) {
  const word = stepWord(number);
  resultCopy.replaceChildren(document.createTextNode('Твій шлях — '));
  const value = document.createElement('strong'); value.textContent = String(number);
  resultCopy.append(value, document.createTextNode(` ${word}`));
  resultSign.textContent = sign;
  const spoken = `Твій шлях — ${number} ${word}, ${sign === '+' ? 'плюс' : 'мінус'}`;
  result.setAttribute('aria-label', spoken);
  numberLabel.textContent = `Числовий кубик: ${number}`;
  signLabel.textContent = `Кубик знаків: ${sign}`;
  status.textContent = spoken;
}
function reportError(message) {
  game.dataset.state = 'error'; rollButton.disabled = true;
  status.textContent = message; status.classList.remove('sr-only');
}
export function getGameState() {
  return {state: game.dataset.state, completedRolls, result: previous && {number: previous.number, sign: previous.sign}, visibleFaces: renderer?.visibleFaces() ?? []};
}

export const ready = (async () => {
  try {
    renderer = await createDiceRenderer(viewport);
    game.classList.add('has-3d');
    game.dataset.state = 'idle';
    rollButton.disabled = false;
    rollButton.setAttribute('aria-label', 'Кинути кубики');
    status.textContent = 'Кубики готові до кидка';
    return true;
  } catch (error) {
    reportError('Не вдалося увімкнути 3D. Увімкніть WebGL 2 у браузері та перезавантажте сторінку.');
    console.error('Dice initialization failed:', error);
    return false;
  }
})();
viewport.addEventListener('dice-context-lost', () => reportError('Браузер призупинив 3D. Очікуємо відновлення графіки…'));
viewport.addEventListener('dice-context-restored', () => {
  game.dataset.state = 'idle'; rollButton.disabled = false;
  status.classList.add('sr-only'); status.textContent = 'Кубики готові до кидка';
});
rollButton.addEventListener('click', async () => {
  if (rollButton.disabled || game.dataset.state !== 'idle') return;
  rollButton.disabled = true; game.dataset.state = 'rolling';
  rollButton.setAttribute('aria-label', 'Кубики в русі');
  result.setAttribute('aria-busy', 'true');
  status.textContent = 'Кубики в русі…';
  let outcome;
  try {
    outcome = nextRoll(previous);
    await renderer.rollTo(outcome.numberFace, outcome.signFace, matchMedia('(prefers-reduced-motion: reduce)').matches);
    const faces = renderer.visibleFaces();
    // Publish the outcome only after the actual model faces have settled.
    if (faces[0].value !== String(outcome.number) || faces[1].value !== outcome.sign || faces.some(f => f.alignment < .999)) {
      throw new Error('Dice face orientation mismatch');
    }
    previous = outcome; completedRolls++;
    setResult(outcome.number, outcome.sign);
    game.dataset.state = 'idle';
  } catch (error) {
    console.error('Dice roll failed:', error);
    reportError('Кидок не завершено. Перезавантажте сторінку, щоб відновити гру.');
  } finally {
    result.removeAttribute('aria-busy');
    if (game.dataset.state === 'idle') {
      rollButton.disabled = false;
      rollButton.setAttribute('aria-label', 'Кинути кубики');
    }
  }
});
