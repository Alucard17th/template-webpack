import Phaser from "phaser";
import {
  myPlayer,
  getRoomCode,
  onPlayerJoin,
  getParticipants,
  isHost,
  getState,
  setState,
} from "playroomkit";
import { ensureInsertCoin } from "./lobbySession";
import { CHARACTERS, CHARACTERS_BY_ID } from "../../data/characters.js";

export class LobbyWin98Scene extends Phaser.Scene {
  players = [];

  constructor() {
    super("LobbyWin98");
  }

  async create() {
    const urlRoom = new URLSearchParams(window.location.hash.slice(1)).get("room");
    await ensureInsertCoin({ skipLobby: true, roomCode: urlRoom || undefined });

    this.players = [...getParticipants()];
    this.roomCode = getRoomCode();

    this._attachWin98Styles();

    this.container = document.createElement("div");
    this.container.classList.add("win98-lobby");
    document.body.appendChild(this.container);

    const switchBtn = document.createElement("button");
    switchBtn.classList.add("win98-switch-fantasy", "win98-btn");
    switchBtn.textContent = "Switch to Fantasy";
    switchBtn.onclick = () => this.scene.start("Lobby");
    this.container.appendChild(switchBtn);

    this._buildTitleBar();
    this._buildLayout();

    onPlayerJoin((p) => {
      if (!this.players.find((x) => x.id === p.id)) this.players.push(p);
      this._refreshRoster();
      this._checkIfReadyAndStart();
    });

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this._refreshRoster(),
    });

    this.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => {
        if (isHost()) this._checkIfReadyAndStart();
        if (getState("startGame")) this.scene.start("Multiplayer");
      },
    });

    this.events.once("shutdown", () => {
      this._cleanupDOM();
      this._detachWin98Styles();
    });
  }

  _attachWin98Styles() {
    if (document.getElementById("lobby-win98-css")) return;
    const link = document.createElement("link");
    link.id = "lobby-win98-css";
    link.rel = "stylesheet";
    link.href = "./styles/lobby-win98.css";
    document.head.appendChild(link);
  }

  _detachWin98Styles() {
    document.getElementById("lobby-win98-css")?.remove();
  }

  _buildTitleBar() {
    const bar = document.createElement("div");
    bar.classList.add("win98-titlebar");

    const title = document.createElement("div");
    title.classList.add("win98-titlebar-title");
    title.textContent = "Mystic Sigils Lobby";

    const actions = document.createElement("div");
    actions.classList.add("win98-titlebar-actions");

    bar.appendChild(title);
    bar.appendChild(actions);
    this.container.appendChild(bar);
  }

  _buildLayout() {
    const main = document.createElement("div");
    main.classList.add("win98-main");

    const left = document.createElement("div");
    left.classList.add("win98-panel");

    const room = document.createElement("div");
    room.classList.add("win98-group");

    const roomLabel = document.createElement("div");
    roomLabel.classList.add("win98-label");
    roomLabel.textContent = `Room Code: ${this.roomCode}`;

    const copyBtn = document.createElement("button");
    copyBtn.classList.add("win98-btn");
    copyBtn.textContent = "Copy Link";
    copyBtn.onclick = () => {
      const inviteUrl = `${window.location.origin}${window.location.pathname}#room=${this.roomCode}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy Link"), 1200);
      });
    };

    room.appendChild(roomLabel);
    room.appendChild(copyBtn);

    const profile = document.createElement("div");
    profile.classList.add("win98-group");

    const nameInput = document.createElement("input");
    nameInput.classList.add("win98-input");
    nameInput.placeholder = "Your name";
    nameInput.maxLength = 12;

    const initialCharacterId =
      myPlayer()?.getState("profile")?.characterId || CHARACTERS[0]?.id;
    this.selectedCharacterId =
      (initialCharacterId && CHARACTERS_BY_ID[initialCharacterId]
        ? initialCharacterId
        : CHARACTERS[0]?.id) || "char-1";

    const pickerLabel = document.createElement("div");
    pickerLabel.classList.add("win98-label");
    pickerLabel.textContent = "Character";

    const picker = document.createElement("div");
    picker.classList.add("win98-character-picker");

    const renderPicker = () => {
      picker.innerHTML = CHARACTERS.map((c) => {
        const selected = c.id === this.selectedCharacterId ? "selected" : "";
        const src = `./assets/${c.imagePath}`;
        return `
          <button class="win98-char ${selected}" data-char="${c.id}">
            <img class="win98-char-img" src="${src}" alt="${c.name}">
            <span class="win98-char-name">${c.name}</span>
          </button>
        `;
      }).join("");
    };

    renderPicker();
    picker.addEventListener("click", (e) => {
      const btn = e.target.closest(".win98-char");
      if (!btn) return;
      const id = btn.getAttribute("data-char");
      if (!id || !CHARACTERS_BY_ID[id]) return;
      this.selectedCharacterId = id;
      renderPicker();
    });

    const readyBtn = document.createElement("button");
    readyBtn.classList.add("win98-btn", "win98-btn-primary");
    readyBtn.textContent = "Ready";
    readyBtn.onclick = async () => {
      let chosenName = nameInput.value.trim();
      if (!chosenName) {
        const defaultName = myPlayer().getProfile()?.name;
        chosenName = defaultName || `Player${Math.floor(Math.random() * 1000)}`;
      }

      const participants = getParticipants();
      const nameTaken = participants.some((p) => {
        if (p.id === myPlayer().id) return false;
        const prof = p.getState("profile") || {};
        return prof.name && prof.name.toLowerCase() === chosenName.toLowerCase();
      });

      if (nameTaken) {
        alert(`The name \"${chosenName}\" is already taken.`);
        return;
      }

      myPlayer().setState(
        "profile",
        {
          name: chosenName,
          color: "#000",
          characterId: this.selectedCharacterId,
        },
        true
      );
      myPlayer().setState("ready", true, true);
      readyBtn.disabled = true;
      readyBtn.textContent = "Waiting";
    };

    profile.appendChild(nameInput);
    profile.appendChild(pickerLabel);
    profile.appendChild(picker);
    profile.appendChild(readyBtn);

    left.appendChild(room);
    left.appendChild(profile);

    const right = document.createElement("div");
    right.classList.add("win98-panel");

    const rosterHeader = document.createElement("div");
    rosterHeader.classList.add("win98-label");
    rosterHeader.textContent = "Players";

    this.listDiv = document.createElement("div");
    this.listDiv.classList.add("win98-list");

    right.appendChild(rosterHeader);
    right.appendChild(this.listDiv);

    if (isHost()) {
      const startBtn = document.createElement("button");
      startBtn.classList.add("win98-btn", "win98-btn-primary");
      startBtn.textContent = "Start Game";
      startBtn.onclick = () => {
        const allReady = this.players.length >= 2 && this.players.every((p) => p.getState("ready"));
        if (!allReady) {
          alert("Need 2+ ready players");
          return;
        }
        this.scene.start("Multiplayer");
      };
      right.appendChild(startBtn);
    }

    main.appendChild(left);
    main.appendChild(right);
    this.container.appendChild(main);

    this._refreshRoster();
  }

  _refreshRoster() {
    this.players = [...getParticipants()];
    this.listDiv.innerHTML = this.players
      .map((p) => {
        const prof = p.getState("profile") || {};
        const ready = p.getState("ready") ? "Ready" : "Waiting";
        const name = prof.name || "Player";
        const avatar = prof.avatar ? `<img src="${prof.avatar}" class="win98-avatar-small">` : "";
        return `<div class="win98-row">${avatar}<span class="win98-row-name">${name}</span><span class="win98-row-status">${ready}</span></div>`;
      })
      .join("");
  }

  _checkIfReadyAndStart() {
    const allReady = this.players.length >= 2 && this.players.every((p) => p.getState("ready"));
    if (allReady && isHost()) setState("startGame", true, true);
  }

  _cleanupDOM() {
    document.querySelectorAll(".win98-lobby").forEach((el) => el.remove());
  }
}
