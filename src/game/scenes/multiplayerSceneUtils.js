import Phaser from "phaser";

export function hexToInt(hex) {
  try {
    return Phaser.Display.Color.HexStringToColor(hex).color;
  } catch {
    return 0xffffff;
  }
}

export function loadBase64Texture(scene, key, dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) return reject(new Error("No dataUrl"));
    if (scene.textures.exists(key)) return resolve(scene.textures.get(key));

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        scene.textures.addImage(key, img);
        resolve(scene.textures.get(key));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

export function makeFaceZone(
  scene,
  sprite,
  owner,
  { avatarW = 50, faceZoneScale = 1.8 } = {}
) {
  const r = (avatarW / 2) * faceZoneScale;
  const z = scene.add
    .zone(sprite.x, sprite.y, r * 2, r * 2)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  z.isFace = true;
  z.owner = owner;

  if (scene?.showDebugFaceZones) {
    scene.add
      .graphics()
      .lineStyle(1, 0xff00ff, 0.35)
      .strokeRectShape(z.getBounds());
  }

  return z;
}
