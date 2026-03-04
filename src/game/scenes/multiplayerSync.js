import { getState, myPlayer } from "playroomkit";
import { CARDS_BY_ID } from "../../data/cards.js";
import { PlaceholderCard } from "../objects/PlaceholderCard.js";
import { HEALTH_POINTS, MAX_MANA, MY_HAND_Y, OPP_HAND_Y } from "../core/constants.js";

export function syncLogs(scene) {
  const logs = getState("logs") || [];
  if (scene._lastLogKey === JSON.stringify(logs)) return;
  scene._lastLogKey = JSON.stringify(logs);

  scene.logTexts.forEach((t) => t.destroy());
  scene.logTexts = [];

  logs.slice(-scene.logMaxLines).forEach((msg) => scene.addLog(msg));
}

export function syncHand(scene) {
  const hand = myPlayer()?.getState("hand") || [];
  const key = hand.join(",");
  const canvas = scene.game.canvas;
  if (key === scene._lastHandKey) return;
  scene._lastHandKey = key;

  scene.myHand.clear(true, true);
  hand.forEach((uid, idx) => {
    const base = uid.split("#")[0];
    const card = new PlaceholderCard(
      scene,
      base,
      scene.screenMidX + idx * 110,
      MY_HAND_Y,
      uid
    );
    scene.myHand.add(card);

    card.on("pointerover", () => {
      const baseId = card.uid.split("#")[0];
      const cardData = CARDS_BY_ID[baseId];
      if (cardData) scene._updateCardDetails(cardData);
      canvas.classList.add("card-hover");
    });
    card.on("pointerup", () => {
      if (getState("turnPlayerId") !== myPlayer().id) {
        scene.ui.toast("⏳ Wait for your turn!");
        scene.ui.flashManaBar();
        return;
      }
      myPlayer().setState("request", { play: uid });
    });
    card.on("pointerout", () => {
      scene.cardDetailText.setText("Hover a card to see details");
      canvas.classList.remove("card-hover");
    });
  });

  const deckEmpty = myPlayer()?.getState("deckEmpty");
  if (deckEmpty) {
    scene.ui.toast("⚠️ Your deck is empty!");
  }
}

export function syncBoards(scene) {
  /* ---------- My Board ---------- */
  const meBoard = myPlayer()?.getState("board") || [];
  if (meBoard.join() !== scene._lastMeBoardKey) {
    scene._lastMeBoardKey = meBoard.join();
    scene.myBoard.render(meBoard);
    scene.myBoard.updateHpTexts(myPlayer().getState("boardState") || {});
    const canvas = scene.game.canvas;
    scene.myBoard.group.getChildren().forEach((card) => {
      if (!card || !card.isCard) return;
      const baseId = (card.uid || "").split("#")[0];
      card.setInteractive({ useHandCursor: false });
      card.on("pointerover", () => {
        const cardData = CARDS_BY_ID[baseId];
        if (cardData) scene._updateCardDetails(cardData);
        canvas.classList.add("card-hover");
      });
      card.on("pointerout", () => {
        scene.cardDetailText.setText("Hover a card to see details");
        canvas.classList.remove("card-hover");
      });
    });
  }

  /* ---------- Opponent Board ---------- */
  if (scene.oppState) {
    const oppBoard = scene.oppState.getState("board") || [];
    if (oppBoard.join() !== scene._lastOppBoardKey) {
      scene._lastOppBoardKey = oppBoard.join();
      scene.oppBoard.render(oppBoard);
      scene.oppBoard.updateHpTexts(scene.oppState.getState("boardState") || {});

      scene.oppBoard.group.getChildren().forEach((card) => {
        if (!card || !card.isCard) return;
        const baseId = (card.uid || "").split("#")[0];
        card.setInteractive({ useHandCursor: false });
        card.on("pointerover", () => {
          const cardData = CARDS_BY_ID[baseId];
          if (cardData) scene._updateCardDetails(cardData);
        });
        card.on("pointerout", () =>
          scene.cardDetailText.setText("Hover a card to see details")
        );
      });
    }

    /* ---------- Opponent Hand ---------- */
    const oppHand = scene.oppState.getState("hand") || [];
    if (oppHand.length !== scene._oppHandSize) {
      scene._oppHandSize = oppHand.length;
      scene.oppHand.clear(true, true);
      oppHand.forEach((_, i) => {
        const back = new PlaceholderCard(
          scene,
          "CARD_BACK",
          scene.screenMidX + i * 85,
          OPP_HAND_Y
        );
        scene.oppHand.add(back);
      });
    }
  }
}

export function syncBars(scene, { barShiftX = 240 } = {}) {
  /* ---------- my bars ---------- */
  const hp = myPlayer()?.getState("hp") ?? 0;
  const mp = myPlayer()?.getState("mana") ?? 0;

  if (hp !== scene._lastHp || mp !== scene._lastMp) {
    scene._lastHp = hp;
    scene._lastMp = mp;

    const hpPos = scene.ui.drawHpBar(
      scene.screenMidX - barShiftX,
      scene.scale.height - 60,
      hp,
      HEALTH_POINTS,
      true
    );
    const mpPos = scene.ui.drawManaBar(
      scene.screenMidX - barShiftX,
      scene.scale.height - 40,
      mp,
      MAX_MANA,
      true
    );

    scene.myHpTxt.setText(`HP ${hp}`).setPosition(hpPos.left - 8, hpPos.cy);
    scene.myManaTxt
      .setText(`MANA ${mp} / ${MAX_MANA}`)
      .setPosition(mpPos.left - 8, mpPos.cy);
  }

  /* ---------- opponent bars ---------- */
  if (scene.oppState) {
    const oh = scene.oppState.getState("hp") ?? 0;
    const om = scene.oppState.getState("mana") ?? 0;

    if (oh !== scene._lastOppHp || om !== scene._lastOppMp) {
      scene._lastOppHp = oh;
      scene._lastOppMp = om;

      const hpPos = scene.ui.drawHpBar(
        scene.screenMidX - barShiftX,
        10,
        oh,
        HEALTH_POINTS,
        false
      );
      const mpPos = scene.ui.drawManaBar(
        scene.screenMidX - barShiftX,
        30,
        om,
        MAX_MANA,
        false
      );

      scene.oppHpTxt.setText(`HP ${oh}`).setPosition(hpPos.left - 8, hpPos.cy);
      scene.oppManaTxt
        .setText(`MANA ${om} / ${MAX_MANA}`)
        .setPosition(mpPos.left - 8, mpPos.cy);
    }
  }
}

export function syncBoardState(scene) {
  /* ---------- mine ---------- */
  const myBS = myPlayer()?.getState("boardState") || {};
  const myStr = JSON.stringify(myBS);
  if (myStr !== scene._lastMyBS) {
    scene._lastMyBS = myStr;
    scene.myBoard.updateHpTexts(myBS);
  }

  /* ---------- opponent ---------- */
  if (scene.oppState) {
    const oppBS = scene.oppState.getState("boardState") || {};
    const oppStr = JSON.stringify(oppBS);
    if (oppStr !== scene._lastOppBS) {
      scene._lastOppBS = oppStr;
      scene.oppBoard.updateHpTexts(oppBS);
    }
  }
}

export function syncToasts(scene) {
  const toastMsg = myPlayer()?.getState("toast");
  if (toastMsg) {
    scene.ui.toast(toastMsg);
    myPlayer().setState("toast", null, true);
  }
}

export function syncRejects(scene) {
  const rej = myPlayer()?.getState("reject");
  if (!rej) return;

  if (rej.reason === "mana") {
    scene.ui.toast("❌ Not enough mana to play that card!");
  }

  if (rej.reason === "firstTurn") {
    scene.ui.toast("❌ You cannot attack on the first turn!");
  }

  if (rej.reason === "protectedFace") {
    scene.ui.toast("❌ You cannot attack a protected face!");
  }

  if (rej.reason === "badTarget") {
    scene.ui.toast("❌ You cannot attack this card!");
  }

  if (rej.reason === "mustHitTaunt") {
    scene.ui.toast("❌ A minion with Taunt is protecting its allies.");
  }

  myPlayer()?.setState("reject", null);
}
