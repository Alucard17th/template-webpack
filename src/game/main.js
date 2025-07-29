import { Boot } from "./scenes/Boot";
import { Game as MainGame } from "./scenes/Game";
import { GameOver } from "./scenes/GameOver";
import { MainMenu } from "./scenes/MainMenu";
import { Preloader } from "./scenes/Preloader";

import { Multiplayer } from "./scenes/Multiplayer";

import { AUTO, Game } from "phaser";
import { insertCoin } from "playroomkit";

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const gameWidth = window.innerWidth;
const gameHeight = window.innerHeight;
const config = {
  type: AUTO,
  width: 1920,
  height: 1080,
  parent: "game-container",
  backgroundColor: "#028af8",
  min: { width: 800, height: 600 }, // clamps for FIT/ENVELOP/ZOOM
  max: { width: 1920, height: 1080 },
  scale: {
    mode: Phaser.Scale.FIT, // NONE | FIT | ENVELOP | RESIZE | ZOOM
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1,
    fullscreenTarget: null,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scene: [
    Multiplayer,
    // Boot,
    // Preloader,
    // MainMenu,
    // MainGame,
    // GameOver
  ],
  fps: { forceSetTimeOut: true },
  disableVisibilityChange: true,
};

const StartGame = (parent) => {
  return new Game({ ...config, parent });
};

(async () => {
  // show the Playroom lobby UI & wait for host to press “Launch”
  await insertCoin({ gameId: "YOUR_GAME_ID", maxPlayersPerRoom: 2 });
  StartGame("game-container"); // now spin up Phaser
})();

export default StartGame;
