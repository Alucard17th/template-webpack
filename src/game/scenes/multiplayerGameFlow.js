import { getParticipants, getState, isHost, myPlayer, setState } from "playroomkit";
import { HEALTH_POINTS, DECK_COPIES } from "../core/constants.js";
import { buildDeck } from "../../helpers/deckUtils.js";
import { Deck } from "../../logic/Deck.js";
import { CARDS } from "../../data/cards.js";

export function showGameOverOverlay(scene) {
  if (scene.gameOverShown) return;
  scene.gameOverShown = true;

  const winnerId = getState("gameOver").winnerId;
  const msg = winnerId === myPlayer()?.id ? "YOU WIN!" : "YOU LOSE";

  const Z = 10_000;
  scene.gameOverContainer = scene.add.container(0, 0).setDepth(Z);

  const bg = scene.add
    .rectangle(
      scene.scale.width / 2,
      scene.scale.height / 2,
      600,
      300,
      0x000000,
      0.8
    )
    .setOrigin(0.5);
  scene.gameOverContainer.add(bg);

  const text = scene.add
    .text(scene.scale.width / 2, scene.scale.height / 2 - 40, msg, {
      fontSize: 72,
      color: "#fff",
      fontStyle: "bold",
    })
    .setOrigin(0.5);
  scene.gameOverContainer.add(text);

  const restartBtn = scene.add
    .text(scene.scale.width / 2, scene.scale.height / 2 + 60, "🔄 Restart Game", {
      fontSize: 32,
      color: "#00ff00",
      backgroundColor: "#222",
      padding: { x: 20, y: 10 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  restartBtn.on("pointerup", () => {
    if (isHost()) resetGame(scene);
    else scene.ui.toast("Only host can restart the game.");
  });

  scene.gameOverContainer.add(restartBtn);

  scene.input.enabled = true;
}

export function resetGame(scene) {
  setState("resetGame", Date.now(), true);

  setState("gameOver", null, true);
  setState("logs", [], true);
  setState("turnPlayerId", null, true);
  setState("firstPlayerId", null, true);
  setState("gameSnapshot", null, true);
  setState("seatAssignments", null, true);

  getParticipants().forEach((p) => {
    p.setState("hand", [], true);
    p.setState("board", [], true);
    p.setState("boardState", {}, true);
    p.setState("hp", HEALTH_POINTS, true);
    p.setState("mana", 0, true);
    p.setState("maxMana", 0, true);
    p.setState("turnCount", 0, true);
    p.setState("hasAttacked", {}, true);
    p.setState("handReady", false, true);
    p.setState("deckEmpty", false, true);
  });

  scene.deckMap.clear();
  if (isHost()) {
    getParticipants().forEach((p) => {
      const deck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle();
      scene.deckMap.set(p.id, deck);
      p.setState("deckSize", deck.size(), true);
    });
    scene._dealOpeningHands();
  }

  if (scene.gameOverContainer) {
    scene.gameOverContainer.destroy(true);
    scene.gameOverContainer = null;
  }

  scene.gameOverShown = false;
}
