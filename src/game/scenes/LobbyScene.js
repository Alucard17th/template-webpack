/*********************************************************************
 *  LobbyScene.js  –  custom lobby for Playroom (skipLobby:true)
 *********************************************************************/

import Phaser from "phaser";
// import QRCode from 'qrcode';            // npm i qrcode  (tiny pure‑js lib)

import {
  insertCoin,
  me,
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

  /* -------------------------------------------------------------- */
  async create() {
    /* 1️⃣  create / join room ----------------------------------- */
    const urlRoom = new URLSearchParams(window.location.hash.slice(1)).get(
      "room"
    );
    await insertCoin({
      skipLobby: true,
      roomCode: urlRoom || undefined,
    });

    console.log("[Lobby] am I host?", isHost());

    this.players = [...getParticipants()];

    const roomCode = getRoomCode();

    /* 2️⃣  basic text + QR code -------------------------------- */
    this.add
      .text(960, 80, `Room Code: ${roomCode}`, {
        fontSize: 32,
        color: "#fff",
        fontFamily: "Constantia",
      })
      .setOrigin(0.5);

    // tiny canvas for QR
    // const qrCanvas = document.createElement('canvas');
    // qrCanvas.style.position = 'absolute';
    // qrCanvas.style.left = '50%'; qrCanvas.style.top = '140px'; qrCanvas.style.transform='translateX(-50%)';
    // document.body.appendChild(qrCanvas);
    // QRCode.toCanvas(qrCanvas, roomCode, { width:180 });

    // ✅ Add copy invitation button
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy Invitation Link";
    copyBtn.classList.add("lobby-btn");
    copyBtn.style.position = "absolute";
    copyBtn.style.top = "150px";
    copyBtn.style.left = "50%";
    copyBtn.style.transform = "translateX(-50%)";
    copyBtn.onclick = () => {
      const inviteUrl = `${window.location.origin}${window.location.pathname}#room=${roomCode}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        copyBtn.textContent = "✔ Link Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy Invitation Link"), 1500);
      });
    };
    document.body.appendChild(copyBtn);

    // Cleanup button on scene shutdown
    this.events.once("shutdown", () => {
      if (copyBtn && copyBtn.parentElement)
        copyBtn.parentElement.removeChild(copyBtn);
    });

    /* 3️⃣  UI elements ----------------------------------------- */
    this.container = document.createElement("div");
    document.body.appendChild(this.container);

    this._buildInputForm();
    this._buildRosterList();

    /* 4️⃣  react to new players -------------------------------- */
    /* track others */
    onPlayerJoin((p) => {
      // called for others (and MAYBE host)
      if (!this.players.find((x) => x.id === p.id))
        // guard against duplicate push
        this.players.push(p);
      this._refreshRoster();
      this._checkIfReadyAndStart(); // re‑evaluate readiness
    });
    // onPlayerQuit((p) => {
    //   this.players = this.players.filter((x) => x.id !== p.id);
    //   this._refreshRoster();
    // });
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this._refreshRoster(),
    });

    /* Poll for the 'startGame' flag and switch scenes */
    this.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => {
        if (isHost()) this._checkIfReadyAndStart(); // host keeps checking
        if (getState("startGame")) this.scene.start("Multiplayer");
      },
    });

    this.events.once("shutdown", () => this._cleanupDOM());
  }

  /* ----------- DOM helpers (pure JavaScript, no Phaser DOM) ---- */
  /* UI elements ----------------------------------------- */
  _buildInputForm() {
    const wrap = document.createElement("div");
    wrap.classList.add("lobby-form");
    document.body.appendChild(wrap);

    // Name input
    const name = document.createElement("input");
    name.placeholder = "Your name";
    name.maxLength = 12;
    name.classList.add("lobby-input");
    wrap.appendChild(name);

    // // Color picker
    // const color = document.createElement("input");
    // color.type = "color";
    // color.value =
    //   "#" +
    //   Math.floor(Math.random() * 0xffffff)
    //     .toString(16)
    //     .padStart(6, "0");
    // wrap.appendChild(color);

    let currentAvatar = generateRandomAvatar();

    const avatarImg = document.createElement("img");
    avatarImg.src = currentAvatar.dataURL;
    avatarImg.width = 80;
    avatarImg.height = 80;
    avatarImg.classList.add("avatar-img");
    wrap.appendChild(avatarImg);

    const randomBtn = document.createElement("button");
    randomBtn.textContent = "🎲 Randomize Avatar";
    randomBtn.classList.add("lobby-btn", "secondary");
    randomBtn.onclick = () => {
      currentAvatar = generateRandomAvatar();
      avatarImg.src = currentAvatar.dataURL;
    };
    wrap.appendChild(randomBtn);

    // Ready button
    const btn = document.createElement("button");
    btn.textContent = "Ready ✔";
    btn.classList.add("lobby-btn");
    wrap.appendChild(btn);

    btn.onclick = async () => {
      myPlayer().setState(
        "profile",
        {
          name: name.value || "Player",
          // color: color?.value || "#000",
          color: "#000",
          avatar: currentAvatar.dataURL, // Store SVG as data URL
        },
        true
      );
      myPlayer().setState("ready", true, true);
      btn.disabled = true;
      btn.textContent = "✔ Ready";
    };

    this.container.appendChild(wrap);
  }

  _buildRosterList() {
    this.rosterDiv = document.createElement("div");
    this.rosterDiv.classList.add("roster-list");
    document.body.appendChild(this.rosterDiv);

    this.listDiv = document.createElement("div");
    this.rosterDiv.appendChild(this.listDiv);

    /* host-only start button */
    if (isHost()) {
      const startBtn = document.createElement("button");
      startBtn.textContent = "Start Game";
      startBtn.style.marginTop = "16px";
      startBtn.classList.add("lobby-btn");
      startBtn.onclick = () => {
        // only allow if all ready & at least 2 players
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
        const ready = p.getState("ready") ? "✅" : "⌛";
        const name = prof.name || "Player";
        const avatar = prof.avatar
          ? `<img src="${
              prof.avatar
            }" width="40" height="40" class="avatar-img" style="border-radius:50%;border:2px solid ${
              prof.color || "#fff"
            }">`
          : "👤";
        return `<div class="roster-player">
                ${ready} ${avatar} <span>${name}</span>
            </div>`;
      })
      .join("");
  }

  _checkIfReadyAndStart() {
    const everybodyReady =
      this.players.length >= 2 &&
      this.players.every((p) => p.getState("ready"));

    if (everybodyReady && isHost()) {
      // write once; Playroom replicates to everyone
      setState("startGame", true, true);
    }
  }

  /* ------------ cleanup when scene shuts down ---------------- */
  _cleanupDOM() {
    // Remove all elements with the "lobby-form" class (input, avatar, randomize, ready button container)
    document.querySelectorAll(".lobby-form").forEach((el) => el.remove());

    // Remove the roster list container
    document.querySelectorAll(".roster-list").forEach((el) => el.remove());

    // Remove any QR canvas if it exists
    const qrCanvas = document.querySelector('canvas[style*="top: 140px"]');
    if (qrCanvas) qrCanvas.remove();
  }
}
