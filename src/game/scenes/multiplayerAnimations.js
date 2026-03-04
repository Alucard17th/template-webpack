import { getState, setState, myPlayer } from "playroomkit";

export function playCardAnimation(scene) {
  const anim = getState("animEvent");
  if (anim && anim !== scene._lastAnimEvent) {
    scene._lastAnimEvent = anim;

    if (anim.type === "cardPlayed") animateCardPlayed(scene, anim);
    if (anim.type === "cardAttack") animateCardAttack(scene, anim);

    setState("animEvent", null, true);
  }
}

export function animateCardPlayed(scene, { playerId, uid }) {
  const isMe = playerId === myPlayer().id;
  const board = isMe ? scene.myBoard : scene.oppBoard;
  const card = board?.group?.getChildren()?.find((c) => c.uid === uid);
  if (!card) return;

  scene.tweens.add({
    targets: card,
    scale: { from: 0.2, to: 1 },
    alpha: { from: 0, to: 1 },
    duration: 300,
    ease: "Back.Out",
  });
}

export function animateCardAttack(scene, { src, dst }) {
  const findCard = (uid) => {
    return (
      scene.myBoard.group.getChildren().find((c) => c.uid === uid) ||
      scene.oppBoard?.group.getChildren().find((c) => c.uid === uid)
    );
  };

  const attacker = findCard(src);
  const defender = dst !== "player" ? findCard(dst) : null;
  if (!attacker) return;

  const attackTween = {
    targets: attacker,
    x: defender ? defender.x : attacker.x,
    y: defender ? defender.y : attacker.y - 40,
    yoyo: true,
    duration: 250,
    ease: "Quad.Out",
  };
  scene.tweens.add(attackTween);
}
