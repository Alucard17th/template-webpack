import Phaser from "phaser";
import {
  insertCoin,
  myPlayer,
  getRoomCode,
  onPlayerJoin,
  getParticipants,
  isHost,
  getState,
  setState,
} from "playroomkit";
import multiavatar from "@multiavatar/multiavatar/esm";

function generateRandomAvatar() {
  const seed = Math.random().toString(36).substring(2);
  const svg = multiavatar(seed);
  const dataURL = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return { seed, dataURL };
}

export class LobbyScene extends Phaser.Scene {
  players = [];

  constructor() {
    super("Lobby");
  }

  async create() {
    const urlRoom = new URLSearchParams(window.location.hash.slice(1)).get(
      "room"
    );
    await insertCoin({ skipLobby: true, roomCode: urlRoom || undefined });

    this.players = [...getParticipants()];
    this.roomCode = getRoomCode();

    /* ✅ Main container */
    this.container = document.createElement("div");
    this.container.classList.add("lobby-container");
    document.body.appendChild(this.container);

    /* ✅ Sections */
    this._buildRoomCodeSection();
    this._buildLogoSection();
    this._buildInputForm();
    this._buildRosterList();

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

    this.events.once("shutdown", () => this._cleanupDOM());
  }

  /* ✅ Top Column: Room Code */
  _buildRoomCodeSection() {
    /* ✅ Room Code Banner */
    const roomCodeDiv = document.createElement("div");
    roomCodeDiv.classList.add("room-code");

    const codeText = document.createElement("span");
    codeText.textContent = `Room Code: ${this.roomCode}`;
    roomCodeDiv.appendChild(codeText);

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy Link";
    copyBtn.classList.add("copy-btn");
    copyBtn.onclick = () => {
      const inviteUrl = `${window.location.origin}${window.location.pathname}#room=${this.roomCode}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        copyBtn.textContent = "✔ Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy Link"), 1500);
      });
    };
    roomCodeDiv.appendChild(copyBtn);

    this.container.appendChild(roomCodeDiv);
  }

  /* ✅ Left Column: Logo */
  _buildLogoSection() {
    const wrap = document.createElement("div");
    wrap.classList.add("lobby-logo");

    const logoImg = document.createElement("img");
    logoImg.src = "./assets/logo-1.png";
    logoImg.classList.add("lobby-logo-img");
    wrap.appendChild(logoImg);

    const gameTitle = document.createElement("h1");
    gameTitle.textContent = "Mystic Sigils";
    gameTitle.classList.add("lobby-logo-title");
    wrap.appendChild(gameTitle);

    const tagline = document.createElement("p");
    tagline.textContent = "Assemble your deck. Conquer the arena!";
    tagline.classList.add("lobby-logo-tagline");
    wrap.appendChild(tagline);

    this.container.appendChild(wrap);
  }

  /* ✅ Middle Column: Input Form */
  _buildInputForm() {
    const wrap = document.createElement("div");
    wrap.classList.add("lobby-form");

    const name = document.createElement("input");
    name.placeholder = "Enter your name";
    name.maxLength = 12;
    name.classList.add("lobby-input");
    wrap.appendChild(name);

    let currentAvatar = generateRandomAvatar();

    const avatarImg = document.createElement("img");
    avatarImg.src = currentAvatar.dataURL;
    avatarImg.classList.add("avatar-img-large");
    wrap.appendChild(avatarImg);

    const randomBtn = document.createElement("button");
    randomBtn.textContent = "🎲 Randomize Avatar";
    randomBtn.classList.add("lobby-btn", "secondary");
    randomBtn.onclick = () => {
      currentAvatar = generateRandomAvatar();
      avatarImg.src = currentAvatar.dataURL;
    };
    wrap.appendChild(randomBtn);

    const readyBtn = document.createElement("button");
    readyBtn.textContent = "✔ Ready";
    readyBtn.classList.add("lobby-btn", "primary");
    readyBtn.onclick = async () => {
      let chosenName = name.value.trim();

      // ✅ If input is empty, use the player's default profile name or generate one
      if (!chosenName) {
        const defaultName = myPlayer().getProfile()?.name; // PlayroomKit auto name
        chosenName = defaultName || `Player${Math.floor(Math.random() * 1000)}`;
      }

      // 🔍 Check for duplicates
      const participants = getParticipants();
      const nameTaken = participants.some((p) => {
        if (p.id === myPlayer().id) return false;
        const prof = p.getState("profile") || {};
        return (
          prof.name && prof.name.toLowerCase() === chosenName.toLowerCase()
        );
      });

      if (nameTaken) {
        alert(
          `⚠️ The name "${chosenName}" is already taken. Please choose another.`
        );
        return;
      }

      myPlayer().setState(
        "profile",
        {
          name: chosenName,
          color: "#000",
          avatar: currentAvatar.dataURL,
        },
        true
      );
      myPlayer().setState("ready", true, true);
      readyBtn.disabled = true;
      readyBtn.textContent = "✔ Waiting...";
    };
    wrap.appendChild(readyBtn);

    this.container.appendChild(wrap);
  }

  /* ✅ Right Column: Roster */
  _buildRosterList() {
    this.rosterDiv = document.createElement("div");
    this.rosterDiv.classList.add("roster-list");

    const title = document.createElement("h3");
    title.textContent = "Players";
    title.classList.add("roster-title");
    this.rosterDiv.appendChild(title);

    this.listDiv = document.createElement("div");
    this.listDiv.classList.add("roster-players");
    this.rosterDiv.appendChild(this.listDiv);

    if (isHost()) {
      const startBtn = document.createElement("button");
      startBtn.textContent = "Start Game";
      startBtn.classList.add("lobby-btn", "start-btn");
      startBtn.onclick = () => {
        const allReady =
          this.players.length >= 2 &&
          this.players.every((p) => p.getState("ready"));
        if (!allReady) {
          alert("Need 2+ ready players");
          return;
        }
        this.scene.start("Multiplayer");
      };
      this.rosterDiv.appendChild(startBtn);
    }

    this.container.appendChild(this.rosterDiv);
  }

  _refreshRoster() {
    this.players = [...getParticipants()];
    this.listDiv.innerHTML = this.players
      .map((p) => {
        const prof = p.getState("profile") || {};
        const ready = p.getState("ready") ? "✅ Ready" : "⌛ Waiting";
        const name = prof.name || "Player";
        const avatar = prof.avatar
          ? `<img src="${prof.avatar}" class="avatar-img-small">`
          : "👤";
        return `<div class="roster-player">${avatar}<span>${name}</span><span class="player-status">${ready}</span></div>`;
      })
      .join("");
  }

  _checkIfReadyAndStart() {
    const allReady =
      this.players.length >= 2 &&
      this.players.every((p) => p.getState("ready"));
    if (allReady && isHost()) setState("startGame", true, true);
  }

  _cleanupDOM() {
    document.querySelectorAll(".lobby-container").forEach((el) => el.remove());
  }
}
