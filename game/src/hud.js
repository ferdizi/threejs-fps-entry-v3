// The DOM HUD: crosshair, hit marker, health/armor, ammo, money, round score, timer,
// alive counts, kill feed, minimap, buy menu, banners and the overlays.
// It never touches the simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, ARMOR_PRICE, ARMOR_POINTS, HELMET_PRICE } from './weapon.js';
import { GRENADES, GRENADE_MAX } from './grenade.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playBtn = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoEl = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorFill = $('armor-fill');
  const moneyEl = $('money');
  const scoreEl = $('score-line');
  const timerEl = $('timer');
  const aliveEl = $('alive');
  const killfeed = $('killfeed');
  const radioFeed = $('radio');
  const grenFlash = $('gren-flash');
  const helmTag = $('helm-tag');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const channelWrap = $('channel');
  const channelFill = $('channel-fill');
  const channelLabel = $('channel-label');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyGrid = $('buy-grid');
  const squadEl = $('buy-squad');
  const minimap = $('minimap');
  const mmCtx = minimap.getContext('2d');
  const vignette = $('vignette');
  const promptEl = $('prompt');
  const grenHe = $('gren-he');
  const grenSmoke = $('gren-smoke');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastAmmo = '';
  let buyOpen = false;
  let onBuy = null;
  let onPlay = null;

  // ---- buy menu rows ----
  // Stat bars (DMG/RATE/AIM/MOVE) from the weapon defs, like the top entries'.
  function statBars(def) {
    const bar = (label, v) => `<span class="stat"><em>${label}</em><i><b style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></b></i></span>`;
    return `<div class="buy-stats">${bar('DMG', (def.damage * (def.pellets ?? 1)) / 115)}${bar('RATE', (1 / def.fireGap) / 13.4)}${bar('AIM', (1 / def.spreadStill) / 2500)}${bar('MOVE', (def.moveSpeed - 0.85) / 0.25)}</div>`;
  }
  function buyRow(def, stats) {
    const row = document.createElement('button');
    row.className = 'buy-row';
    row.type = 'button';
    row.innerHTML = `<span class="buy-key"></span><div class="buy-body"><div class="buy-top"><span class="buy-name">${def.name}</span><span class="buy-price">$${def.price}</span></div><span class="buy-desc">${def.desc}</span>${stats ? statBars(def) : ''}</div>`;
    row.addEventListener('click', () => onBuy && onBuy(def.id));
    buyGrid.appendChild(row);
    rows.push({ def, row });
    return row;
  }
  const rows = [];
  for (const def of Object.values(WEAPONS)) buyRow(def, true);
  buyRow({ id: 'armor', name: 'KEVLAR VEST', price: ARMOR_PRICE, desc: `+${ARMOR_POINTS} armor. Absorbs half of every hit.` });
  buyRow({ id: 'helmet', name: 'HELMET', price: HELMET_PRICE, desc: 'Halves headshot damage. Your skull will thank you.' });
  // grenades: HE + smoke + flash, max 2 each
  for (const def of Object.values(GRENADES)) {
    buyRow({ ...def, desc: `${def.desc} Max ${GRENADE_MAX}.` });
  }
  const keyLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  rows.forEach((r, i) => { r.row.querySelector('.buy-key').textContent = keyLabels[i] || ''; });

  function setOwned(id, owned) {
    const r = rows.find((x) => x.def.id === id);
    if (!r) return;
    r.row.classList.toggle('owned', owned);
    r.row.querySelector('.buy-price').textContent = owned ? 'OWNED' : `$${r.def.price}`;
  }

  function clearOwned() {
    for (const r of rows) setOwned(r.def.id, false);
  }

  function setSquad(list) {
    squadEl.innerHTML = `<span class="squad-title">SQUAD</span>` + list.map((s) => `<span><b>${s.name}</b> · ${s.role.toUpperCase()} · ${s.weapon}</span>`).join('');
  }

  function setAmmo(mag, reserve, name) {
    const key = `${mag}/${reserve}/${name}`;
    if (key === lastAmmo) return;
    lastAmmo = key;
    ammoMag.textContent = String(mag);
    ammoReserve.textContent = `/ ${reserve}`;
    weaponName.textContent = name;
    ammoEl.classList.toggle('empty', mag === 0);
  }

  function setHealth(hp, armor, helmet = false) {
    healthFill.style.width = `${Math.max(0, hp)}%`;
    healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
    armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
    healthFill.classList.toggle('low', hp <= 30);
    helmTag.classList.toggle('hidden', !helmet);
  }

  function setMoney(value) {
    moneyEl.textContent = `$${value.toLocaleString('en-US')}`;
    for (const { def, row } of rows) {
      row.classList.toggle('cant', value < def.price);
    }
  }

  function setScore(atk, def, round) {
    scoreEl.innerHTML = `TIDE <b>${atk}</b> — <b>${def}</b> HARBOR &nbsp;·&nbsp; ROUND ${round}`;
  }

  function setTimer(seconds, planted) {
    const s = Math.max(0, Math.ceil(seconds));
    timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    timerEl.classList.toggle('urgent', s <= 15 || planted);
  }

  function setAlive(atkAlive, defAlive) {
    aliveEl.innerHTML = `<span class="dot atk"></span>${atkAlive} &nbsp;·&nbsp; <span class="dot def"></span>${defAlive}`;
  }

  function hitMarker(killed) {
    hitmarker.classList.add('on');
    hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => {
      hitmarker.classList.remove('on');
      hitmarker.style.transform = '';
    }, 110);
  }

  function setCrosshairSpread(spreadPx) {
    crosshair.style.setProperty('--gap', `${spreadPx}px`);
  }

  function setGrenades(he, smoke, flash, selected) {
    grenHe.textContent = `HE ×${he}`;
    grenSmoke.textContent = `SMOKE ×${smoke}`;
    grenFlash.textContent = `FLASH ×${flash}`;
    grenHe.classList.toggle('sel', selected === 'he');
    grenSmoke.classList.toggle('sel', selected === 'smoke');
    grenFlash.classList.toggle('sel', selected === 'flash');
    grenHe.classList.toggle('empty', he === 0);
    grenSmoke.classList.toggle('empty', smoke === 0);
    grenFlash.classList.toggle('empty', flash === 0);
  }

  function damageFlash() {
    vignette.classList.remove('hit');
    void vignette.offsetWidth;
    vignette.classList.add('hit');
  }

  function feed(killer, victim, killerTeam, headshot) {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.innerHTML = `<span class="${killerTeam === 'attack' ? 'atk' : 'def'}">${killer}</span> ${headshot ? '◉' : '✕'} <span>${victim}</span>`;
    killfeed.prepend(line);
    while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
    setTimeout(() => line.classList.add('fade'), 4200);
  }

  // Squad radio: teammate callouts, newest first, max 3 lines, fading.
  function radio(name, text, team) {
    const line = document.createElement('div');
    line.className = 'radio-line';
    line.innerHTML = `<span class="${team === 'attack' ? 'atk' : 'def'}">${name}</span> ${text}`;
    radioFeed.prepend(line);
    while (radioFeed.children.length > 3) radioFeed.removeChild(radioFeed.lastChild);
    setTimeout(() => line.classList.add('fade'), 12000);
    setTimeout(() => line.remove(), 14000);
  }

  function flashPop() {
    const f = $('flash');
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  function showBanner(title, sub, ms = 2600) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub;
    banner.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
  }

  function hideBanner() {
    banner.classList.add('hidden');
  }

  function setChannel(label, progress) {
    if (label == null) {
      channelWrap.classList.add('hidden');
      return;
    }
    channelWrap.classList.remove('hidden');
    channelLabel.textContent = label;
    channelFill.style.width = `${Math.round(progress * 100)}%`;
  }

  function setPrompt(text) {
    if (text) {
      promptEl.textContent = text;
      promptEl.classList.remove('hidden');
    } else {
      promptEl.classList.add('hidden');
    }
  }

  function showOverlay(mode, data = {}) {
    const copy = {
      start: ['TIDEWATER', 'Dawn at the container harbor. Plant the pulse charge at Site A or B — or wipe the Harbor Watch. First to 5 rounds.', 'Click to play'],
      paused: ['TIDEWATER', 'Paused. Click to resume.', 'Click to resume'],
      dead: ['You are down', `Round ${data.round ?? ''} continues without you. Your squad fights on.`, 'Spectate'],
      matchwin: ['HARBOR TAKEN', `Tide Runners win the match ${data.atk} — ${data.def}. The charge did its work.`, 'Play again'],
      matchlose: ['HARBOR HELD', `Harbor Watch win the match ${data.def} — ${data.atk}. The tide goes out.`, 'Play again'],
    }[mode];
    overlayTitle.textContent = copy[0];
    overlayCopy.textContent = copy[1];
    playBtn.textContent = copy[2];
    overlay.hidden = false;
    playBtn.focus();
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function openBuy(money, squad) {
    buyOpen = true;
    buyMenu.classList.remove('hidden');
    buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
    if (squad) setSquad(squad);
  }

  function closeBuy() {
    buyOpen = false;
    buyMenu.classList.add('hidden');
  }

  function isBuyOpen() {
    return buyOpen;
  }

  // ---- minimap: top-down yard, sites, players as dots ----
  function drawMinimap(playerPos, playerYaw, bots, plantedSite) {
    const W = minimap.width;
    const H = minimap.height;
    mmCtx.clearRect(0, 0, W, H);
    mmCtx.fillStyle = 'rgba(10,18,24,0.82)';
    mmCtx.fillRect(0, 0, W, H);
    const sx = (x) => ((x + 23) / 46) * W;
    const sz = (z) => ((z + 19) / 38) * H;
    // yard outline + water strip
    mmCtx.fillStyle = '#1d4a63';
    mmCtx.fillRect(0, 0, W, 6);
    mmCtx.strokeStyle = 'rgba(255,255,255,0.25)';
    mmCtx.strokeRect(1, 1, W - 2, H - 2);
    // sites
    for (const [key, pos] of [['A', [-15, -10]], ['B', [14, -11]]]) {
      mmCtx.fillStyle = plantedSite === key ? '#ff4d4d' : '#ff8c2e';
      mmCtx.beginPath();
      mmCtx.arc(sx(pos[0]), sz(pos[1]), plantedSite === key ? 6 : 4.5, 0, Math.PI * 2);
      mmCtx.fill();
      mmCtx.fillStyle = '#eef2f0';
      mmCtx.font = 'bold 10px monospace';
      mmCtx.fillText(key, sx(pos[0]) - 3, sz(pos[1]) - 8);
    }
    // bots
    for (const bot of bots) {
      if (!bot.alive) continue;
      mmCtx.fillStyle = bot.team === 'attack' ? '#ff8c2e' : '#3fa7ff';
      mmCtx.beginPath();
      mmCtx.arc(sx(bot.mover.state.position.x), sz(bot.mover.state.position.z), 3, 0, Math.PI * 2);
      mmCtx.fill();
    }
    // player arrow
    const px = sx(playerPos.x);
    const pz = sz(playerPos.z);
    mmCtx.save();
    mmCtx.translate(px, pz);
    mmCtx.rotate(Math.atan2(-Math.sin(playerYaw), -Math.cos(playerYaw)) + Math.PI);
    mmCtx.fillStyle = '#ffffff';
    mmCtx.beginPath();
    mmCtx.moveTo(0, -6);
    mmCtx.lineTo(4.5, 5);
    mmCtx.lineTo(-4.5, 5);
    mmCtx.closePath();
    mmCtx.fill();
    mmCtx.restore();
  }

  playBtn.addEventListener('click', () => onPlay && onPlay());

  return {
    setAmmo, setHealth, setMoney, setScore, setTimer, setAlive,
    hitMarker, setCrosshairSpread, setGrenades, damageFlash, feed, radio, flashPop,
    setOwned, clearOwned,
    showBanner, hideBanner, setChannel, setPrompt,
    showOverlay, hideOverlay, onPlay: (fn) => { onPlay = fn; },
    openBuy, closeBuy, isBuyOpen, onBuy: (fn) => { onBuy = fn; },
    drawMinimap,
  };
}
