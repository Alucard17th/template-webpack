export class PlayerState {
  constructor(deck) {
    this.hp = 30;
    this.mana = 0;
    this.hand = [];
    this.board = [];
    this.deck = deck;
  }
  startTurn() {
    // this.mana = Math.min(this.mana + 1, 10);

    if (this.hand.length < 8) {
      const card = this.deck.draw();
      if (card) this.hand.push(card);
    }
  }

  getState(key) {
    return this[key];
  }

  getHp() {
    return this.hp;
  }
}
