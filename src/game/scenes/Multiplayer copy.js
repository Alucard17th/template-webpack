import nipplejs from "nipplejs";
import Phaser from "phaser";
import { onPlayerJoin, isHost, myPlayer } from "playroomkit";

export class Multiplayer extends Phaser.Scene {
  controls = {};
  players = [];

  create() {
    // 1. Handle players joining and quitting.
    onPlayerJoin((playerState) => this.addPlayer(playerState));

    // 2. Pass player input to Playroom.
    this.input.on("pointerdown", (pointer) => {
      const dir = pointer.x < this.scale.width / 2 ? "left" : "right";
      myPlayer().setState("dir", { x: dir });
    });
    this.input.on("pointerup", () => myPlayer().setState("dir", undefined));
  }

  addPlayer(playerState) {
    const hex = playerState.getProfile().color?.hex || '#ffffff';
    const sprite = this.add.rectangle(
      Phaser.Math.Between(100, 500),
      200,
      50,
      50,
      hex
    );
    this.physics.add.existing(sprite, false);
    sprite.body.setCollideWorldBounds(true);
    this.players.push({
      sprite,
      state: playerState,
    });
    playerState.onQuit(() => {
      sprite.destroy();
      this.players = this.players.filter((p) => p.state !== playerState);
    });
  }

  update() {
    // 3. Pass your game state to Playroom.
    if (isHost()) {
      for (const player of this.players) {
        const controls = player.state.getState("dir") || {};
        if (controls.x == "left") {
          player.sprite.body.setVelocityX(-160);
        } else if (controls.x == "right") {
          player.sprite.body.setVelocityX(160);
        } else {
          player.sprite.body.setVelocityX(0);
        }

        if (controls.y == "up" && player.sprite.body.onFloor()) {
          player.sprite.body.setVelocityY(-330);
        }
        player.state.setState("pos", {
          x: player.sprite.body.x,
          y: player.sprite.body.y,
        });
      }
    } else {
      for (const player of this.players) {
        const pos = player.state.getState("pos");
        if (pos) {
          player.sprite.body.x = pos.x;
          player.sprite.body.y = pos.y;
        }
      }
    }
  }
}
