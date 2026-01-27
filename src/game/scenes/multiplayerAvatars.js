import { me, getParticipants, getState } from "playroomkit";
import { hexToInt, loadBase64Texture, makeFaceZone } from "./multiplayerSceneUtils.js";
import { CHARACTERS_BY_ID } from "../../data/characters.js";

export function addAvatar(scene, playerState, opts) {
  const {
    leftX,
    rightX,
    bottomY,
    topY,
    avatarW,
    avatarH,
    faceZoneScale,
  } = opts;

  const isMe = playerState.id === me().id;
  const startX = isMe ? leftX : rightX;
  const startY = isMe ? bottomY : topY;

  const profile = playerState.getProfile() ?? {};
  const name = profile.name || (isMe ? "You" : "Opponent");
  const ringColor = hexToInt(profile.color || "#ffffff");
  const characterId = profile.characterId;
  const characterKey = characterId ? CHARACTERS_BY_ID[characterId]?.imageKey : null;

  const photo = profile.photo || profile.avatar;
  const texKey = `avatar_${playerState.id}`;

  const THEME = {
    ink: 0x2a1b12,
    parchment: 0xf2e3c6,
    parchmentDark: 0xd8c39a,
    gold: 0xd0a84d,
    goldDark: 0x7a5a18,
  };

  const DEFAULT_QUOTES = {
    idle: ["…", "Let’s begin."],
    myTurn: ["My move.", "Time to strike."],
    oppTurn: ["I’m watching.", "Interesting."],
    manaLow: ["I need mana…", "Not enough power."],
  };

  const makeMangaBubble = (x, y, { tail = "down" } = {}) => {
    const bubbleW = 210;
    const bubbleH = 64;

    const g = scene.add.graphics();
    const t = scene.add
      .text(x, y, "", {
        fontFamily: "Constantia, serif",
        fontSize: 18,
        fontStyle: "bold",
        color: "#111111",
        wordWrap: { width: bubbleW - 22 },
        align: "center",
      })
      .setOrigin(0.5);

    const c = scene.add.container(0, 0, [g, t]);
    c.setDepth(9999);
    c.setVisible(false);

    const redraw = () => {
      g.clear();
      g.fillStyle(0xffffff, 0.96);
      g.lineStyle(3, 0x000000, 0.9);

      const left = x - bubbleW / 2;
      const top = y - bubbleH / 2;
      g.fillRoundedRect(left, top, bubbleW, bubbleH, 14);
      g.strokeRoundedRect(left, top, bubbleW, bubbleH, 14);

      const tailW = 18;
      const tailH = 14;
      const tailX = x + bubbleW * 0.18;

      if (tail === "down") {
        g.fillTriangle(tailX - tailW / 2, top + bubbleH, tailX + tailW / 2, top + bubbleH, tailX, top + bubbleH + tailH);
        g.strokeTriangle(tailX - tailW / 2, top + bubbleH, tailX + tailW / 2, top + bubbleH, tailX, top + bubbleH + tailH);
      } else {
        g.fillTriangle(tailX - tailW / 2, top, tailX + tailW / 2, top, tailX, top - tailH);
        g.strokeTriangle(tailX - tailW / 2, top, tailX + tailW / 2, top, tailX, top - tailH);
      }
    };

    redraw();

    return {
      container: c,
      setText: (msg) => {
        t.setText(msg);
        t.setPosition(x, y);
        redraw();
      },
      show: () => {
        c.setVisible(true);
        c.setScale(0.96);
        scene.tweens?.add({ targets: c, scale: 1, duration: 120, ease: "Back.Out" });
      },
      hide: () => c.setVisible(false),
      destroy: () => {
        c.destroy();
        g.destroy();
        t.destroy();
      },
    };
  };

  // parchment "plate" behind the avatar (purely visual)
  const plateW = Math.round(avatarW * 1.65);
  const plateH = Math.round(avatarH * 1.15);
  const plate = scene.add.graphics();
  plate
    // soft shadow
    .fillStyle(THEME.ink, 0.18)
    .fillRoundedRect(
      startX - plateW / 2 + 2,
      startY - plateH / 2 + 4,
      plateW,
      plateH,
      14
    )
    // parchment body
    .fillStyle(THEME.parchment, 0.94)
    .fillRoundedRect(startX - plateW / 2, startY - plateH / 2, plateW, plateH, 14)
    // trim
    .lineStyle(3, THEME.goldDark, 0.75)
    .strokeRoundedRect(startX - plateW / 2, startY - plateH / 2, plateW, plateH, 14)
    .lineStyle(1, THEME.gold, 0.55)
    .strokeRoundedRect(
      startX - plateW / 2 + 3,
      startY - plateH / 2 + 3,
      plateW - 6,
      plateH - 6,
      12
    );

  // --- placeholder circle we will swap later ---
  // soft shadow + parchment frame (behind avatar)
  const shadow = scene.add.graphics();
  shadow
    .fillStyle(THEME.ink, 0.18)
    .fillCircle(startX + 2, startY + 4, avatarW / 2 + 6);

  const frame = scene.add.graphics();
  frame
    .fillStyle(THEME.parchmentDark, 0.95)
    .fillCircle(startX, startY, avatarW / 2 + 6)
    .lineStyle(4, THEME.goldDark, 0.8)
    .strokeCircle(startX, startY, avatarW / 2 + 6)
    .lineStyle(2, THEME.gold, 0.7)
    .strokeCircle(startX, startY, avatarW / 2 + 4);

  let sprite = scene.add
    .circle(startX, startY, avatarW / 2, THEME.parchment)
    .setOrigin(0.5);

  // circular mask geometry (reused after swap)
  const maskG = scene.add.graphics();
  maskG.fillStyle(0xffffff, 1).fillCircle(startX, startY, avatarW / 2);
  const mask = maskG.createGeometryMask();
  sprite.setMask(mask);

  // rings
  const ring = scene.add.graphics();
  const accentRing = scene.add.graphics();
  const hoverRing = scene.add.graphics();
  ring
    .lineStyle(4, THEME.goldDark, 0.75)
    .strokeCircle(startX, startY, avatarW / 2 + 1);
  accentRing
    .lineStyle(3, ringColor, 0.95)
    .strokeCircle(startX, startY, avatarW / 2 - 2);

  const hoverColor = isMe ? 0x36d36a : 0xff8a00;
  hoverRing
    .lineStyle(6, hoverColor, 0.9)
    .strokeCircle(startX, startY, avatarW / 2 + 8);
  hoverRing.setVisible(false);

  const bubbleOffsetY = isMe ? -(avatarH / 2 + 54) : avatarH / 2 + 54;
  const bubble = makeMangaBubble(startX, startY + bubbleOffsetY, { tail: isMe ? "down" : "up" });

  const pickQuote = () => {
    const prof = playerState.getProfile() ?? {};
    const ch = prof.characterId ? CHARACTERS_BY_ID[prof.characterId] : null;
    const pools = ch?.quotes || DEFAULT_QUOTES;

    const mana = playerState.getState("mana") ?? 0;
    const curTurn = getState("turnPlayerId");
    const isTurnPlayer = curTurn && curTurn === playerState.id;

    let key = "idle";
    if (mana <= 1) key = "manaLow";
    else if (isMe && isTurnPlayer) key = "myTurn";
    else if (isMe && !isTurnPlayer) key = "oppTurn";
    else if (!isMe && isTurnPlayer) key = "myTurn";
    else if (!isMe && !isTurnPlayer) key = "oppTurn";

    const list = pools[key] && pools[key].length ? pools[key] : pools.idle || DEFAULT_QUOTES.idle;
    return list[Math.floor(Math.random() * list.length)];
  };

  // name
  const labelY = isMe ? startY + avatarH / 2 + 12 : startY - avatarH / 2 - 12;
  const nameText = scene.add
    .text(startX, labelY, name, {
      fontSize: 22,
      color: "#2a1b12",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 0,
    })
    .setOrigin(0.5, isMe ? 0 : 1);

  const bgPadX = 10,
    bgPadY = 6;
  const bounds = nameText.getBounds();
  const nameBg = scene.add
    .rectangle(
      bounds.centerX,
      bounds.centerY,
      bounds.width + bgPadX * 2,
      bounds.height + bgPadY * 2,
      THEME.parchment,
      0.92
    )
    .setOrigin(0.5)
    .setStrokeStyle(2, THEME.goldDark, 0.7);
  scene.children.moveBelow(nameBg, nameText);

  // physics (optional)
  scene.physics.add.existing(sprite);
  sprite.body.setCircle((avatarW / 2) * (sprite.scaleX || 1));
  sprite.body.setCollideWorldBounds(true);

  const zone = makeFaceZone(scene, sprite, isMe ? "me" : "opponent", {
    avatarW,
    faceZoneScale,
  });

  zone.on("pointerover", () => {
    hoverRing.setVisible(true);
    const msg = pickQuote();
    bubble.setText(msg);
    bubble.show();
  });
  zone.on("pointerout", () => {
    hoverRing.setVisible(false);
    bubble.hide();
  });

  const refreshFromProfile = (prof = {}) => {
    nameText.setText(prof.name || (isMe ? "You" : "Opponent"));
    const b = nameText.getBounds();
    nameBg
      .setPosition(b.centerX, b.centerY)
      .setSize(b.width + bgPadX * 2, b.height + bgPadY * 2);

    const col = hexToInt(prof.color || "#ffffff");
    accentRing.clear().lineStyle(3, col, 0.95).strokeCircle(startX, startY, avatarW / 2 - 2);

    const nextCharacterId = prof.characterId;
    const nextChar = nextCharacterId ? CHARACTERS_BY_ID[nextCharacterId] : null;
    const nextKey = nextChar?.imageKey;

    if (nextKey && nextKey !== entry.currentCharacterKey && scene.textures.exists(nextKey)) {
      entry.currentCharacterKey = nextKey;
      const img = scene.add.image(startX, startY, nextKey).setOrigin(0.5);
      const src = scene.textures.get(nextKey).getSourceImage();
      const scale = Math.min(avatarW / src.width, avatarH / src.height);
      img.setScale(scale);
      img.setMask(mask);

      img.setDepth(entry.sprite.depth);
      entry.sprite.destroy();
      entry.sprite = img;
      sprite = img;

      scene.physics.add.existing(img);
      img.body.setCircle((avatarW / 2) * (img.scaleX || 1));
      img.body.setCollideWorldBounds(true);
    } else if (prof.photo && prof.photo !== sprite.currentPhoto) {
      sprite.currentPhoto = prof.photo;
      loadBase64Texture(scene, texKey, prof.photo)
        .then(() => sprite.setTexture(texKey))
        .catch(console.warn);
    }
  };

  // keep references
  const entry = {
    sprite,
    plate,
    shadow,
    frame,
    ring,
    accentRing,
    hoverRing,
    bubble,
    maskG,
    mask,
    nameText,
    nameBg,
    state: playerState,
    mirror: !isMe,
    lastProfile: { ...profile },
    currentCharacterKey: characterKey,
    refresh: refreshFromProfile,
    destroy() {
      entry.sprite?.destroy();
      plate.destroy();
      shadow.destroy();
      frame.destroy();
      ring.destroy();
      accentRing.destroy();
      hoverRing.destroy();
      bubble.destroy();
      maskG.destroy();
      nameText.destroy();
      nameBg.destroy();
    },
  };
  scene.players.push(entry);

  // --- Load and swap in the real image asynchronously ---
  if (characterKey && scene.textures.exists(characterKey)) {
    const img = scene.add.image(startX, startY, characterKey).setOrigin(0.5);
    const src = scene.textures.get(characterKey).getSourceImage();
    const scale = Math.min(avatarW / src.width, avatarH / src.height);
    img.setScale(scale);
    img.setMask(mask);

    img.setDepth(entry.sprite.depth);
    entry.sprite.destroy();
    entry.sprite = img;
    sprite = img;

    scene.physics.add.existing(img);
    img.body.setCircle((avatarW / 2) * (img.scaleX || 1));
    img.body.setCollideWorldBounds(true);
  } else if (photo) {
    loadBase64Texture(scene, texKey, photo)
      .then((texture) => {
        const img = scene.add.image(startX, startY, texKey).setOrigin(0.5);
        const src = texture.getSourceImage();
        const scale = Math.min(avatarW / src.width, avatarH / src.height);
        img.setScale(scale);
        img.setMask(mask);

        img.setDepth(entry.sprite.depth);
        entry.sprite.destroy();
        entry.sprite = img;
        sprite = img;

        scene.physics.add.existing(img);
        img.body.setCircle((avatarW / 2) * (img.scaleX || 1));
        img.body.setCollideWorldBounds(true);
      })
      .catch((err) => {
        console.warn("[Multiplayer] avatar load failed:", err);
      });
  } else {
    // no photo provided; keep placeholder
  }

  // cleanup on quit
  playerState.onQuit(() => {
    entry.destroy?.();
    scene.players = scene.players.filter((p) => p.state !== playerState);
    if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
  });

  return { sprite, zone };
}

export function createAllAvatars(scene, opts) {
  scene.players.forEach((pEntry) => pEntry.destroy?.());
  scene.players = [];
  const playersList = getParticipants();
  playersList.forEach((ps) => addAvatar(scene, ps, opts));
}
