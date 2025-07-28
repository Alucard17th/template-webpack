
let __uidCounter = 0;
export function makeInstance(baseId) {
  return { id: baseId, uid: `${baseId}#${__uidCounter++}` };
}

export function buildDeck(baseCards, copies = 8) {
  const pile = [];
  for (let i = 0; i < copies; i++) {
    for (const c of baseCards) {
      pile.push(makeInstance(c.id));
    }
  }
  return pile;
}