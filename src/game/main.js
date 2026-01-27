import { Boot } from "./scenes/Boot";
import { Game as MainGame } from "./scenes/Game";
import { GameOver } from "./scenes/GameOver";
import { LobbyScene } from "./scenes/LobbyScene";
import { LobbyWin98Scene } from "./scenes/LobbyWin98Scene";
import { Preloader } from "./scenes/Preloader";

import { Multiplayer } from "./scenes/Multiplayer";

import { AUTO, Game } from "phaser";

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const gameWidth = window.innerWidth;
const gameHeight = window.innerHeight;
const config = {
  type: AUTO,
  width: 1920,
  height: 1080,
  parent: "game-container",
  backgroundColor: "#0f2f49ff",
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
    Preloader,
    LobbyScene,
    LobbyWin98Scene,
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

export default StartGame;
