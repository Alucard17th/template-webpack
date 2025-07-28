import { Boot } from './scenes/Boot';
import { Game as MainGame } from './scenes/Game';
import { GameOver } from './scenes/GameOver';
import { MainMenu } from './scenes/MainMenu';
import { Preloader } from './scenes/Preloader';

import {Multiplayer} from './scenes/Multiplayer';

import { AUTO, Game } from 'phaser';
import { insertCoin } from "playroomkit";

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#028af8',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
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
    disableVisibilityChange: true
};

const StartGame = (parent) => {

    return new Game({ ...config, parent });

}

(async () => {
  // show the Playroom lobby UI & wait for host to press “Launch”
  await insertCoin({ gameId: 'YOUR_GAME_ID', maxPlayersPerRoom: 8 });
  StartGame('game-container');          // now spin up Phaser
})();

export default StartGame;
