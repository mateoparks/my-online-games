// W28, Matthew's first playtest notes: the words checked for doubled words,
// the bindery's bare shelves, the titled books spread along the path, a
// slower start, the "hold it up" moment and the librarian noticing gaps.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test, read, loadGame } = require('./harness');

// ---------- the words ----------

// Every string literal in a game file that reads like words for players.
// Developer messages (errors, solver reports, doc citations) are skipped.
function playerStrings() {
  const context = { globalThis: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('manifest.js'), context);
  const strings = [];
  for (const file of Object.values(context.VL.FILES).flat()) {
    read(file).split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line) || /Error\(|problems\.push|report\(|found\.push|doc: '§|replan: /.test(line)) return;
      for (const match of line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
        const text = (match[1] ?? match[2] ?? match[3]).replace(/\\(.)/g, '$1').replace(/\$\{[^}]*\}/g, '#');
        if (/[a-z]{2,} [a-zA-Z]/.test(text)) strings.push({ where: `${file}:${i + 1}`, text });
      }
    });
  }
  return strings;
}

// Little words that can sit twice in a sentence without anyone noticing.
const SMALL = new Set(('a an the and or but nor of to in on at by for with from up down out into over off as so if then than '
  + 'is it its it\'s be was were are am been have has had do does did can will would could should may might must '
  + 'i me my you your you\'re he him his she her they them their we us our this that these those there what who '
  + 'not no all any some every each one more most very just too only').split(' '));

// Repeats that are meant: a chant, a list, a laugh.
const MEANT = [
  /thank you, thank you/i, /busy, busy/i, /clang, clang, clang/i, /round and round/i, /far, far/i, /ha ha ha/i,
  /wood for shells, shells for paper/i, /fetched/i, /^into /i, /^crab large/i,
];

const sentencesOf = (text) => text.split(/(?<=[.!?]["”]?)\s+|\.\.\.|:\s/).map((s) => s.trim()).filter(Boolean);

function repeatedWords(sentence) {
  if (MEANT.some((pattern) => pattern.test(sentence))) return [];
  const seen = new Set();
  const twice = new Set();
  for (const word of sentence.toLowerCase().match(/[a-zà-ÿ]+(?:'[a-z]+)?/g) || []) {
    if (word.length < 3 || SMALL.has(word)) continue;
    if (seen.has(word)) twice.add(word);
    seen.add(word);
  }
  return [...twice];
}

test('no sentence a player reads repeats a word by accident ("Now that works, now")', () => {
  const strings = playerStrings();
  assert.ok(strings.length > 300, `${strings.length} strings found`);
  const problems = [];
  for (const { where, text } of strings) {
    for (const sentence of sentencesOf(text)) {
      const twice = repeatedWords(sentence);
      if (twice.length) problems.push(`${where} "${sentence}" repeats ${twice.join(', ')}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the doubled-word check catches the kind of line Matthew saw, and lets a chant through', () => {
  assert.deepEqual(repeatedWords('Now that works better, now.'), ['now']);
  assert.deepEqual(repeatedWords('Wood gear, I make from wood.'), ['wood']);
  assert.deepEqual(repeatedWords('Oh, thank you, thank you, Robin!'), []);
  assert.deepEqual(repeatedWords('The tide brings in shells every morning.'), []);
});

test('a titled book\'s last page and the popup after it never end on the same word', () => {
  const { VL } = loadGame();
  const lastWord = (text) => (text.toLowerCase().match(/[a-z']+/g) || []).at(-1);
  const problems = [];
  for (const book of Object.values(VL.BOOKS).filter((b) => b.kind === 'titled')) {
    const state = VL.newGame();
    book.read(state);
    const popup = VL.currentPopup(state);
    if (popup && lastWord(popup.text) === lastWord(book.reading.at(-1))) problems.push(`${book.id}: both end on "${lastWord(popup.text)}"`);
  }
  assert.deepEqual(problems, []);
});
