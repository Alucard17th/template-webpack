export class Deck {
  constructor(cardList = []) {           // array of *objects*, not IDs
    this.stack = [...cardList];
  }
  shuffle () {
    for (let i = this.stack.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.stack[i], this.stack[j]] = [this.stack[j], this.stack[i]];
    }
    return this;
  }
  draw () { return this.stack.pop(); }
  size () { return this.stack.length; }
}