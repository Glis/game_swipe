(function(){
  const STORAGE_KEY = 'gameswipe.catalog';
  let catalog = [];
  let storageOk = true;
  let cleanupVoting = null; // remueve los listeners de swipe de la carta anterior

  let state = {
    tab: 'catalog',
    session: null // {players, playerIndex, phase, order, cardIndex, votes, dragged}
  };

  const seed = [
    {id:'g1', name:'Catan', description:'Comercia recursos y construye asentamientos para dominar la isla. Ideal para noches largas de negociación.', duration:90, minP:3, maxP:4},
    {id:'g2', name:'Carcassonne', description:'Coloca losetas para armar ciudades, caminos y campos. Fácil de aprender, tenso al final.', duration:40, minP:2, maxP:5},
    {id:'g3', name:'Bang!', description:'Duelo de roles ocultos con revólveres y traiciones. Ideal para grupos ruidosos.', duration:30, minP:4, maxP:7},
  ];

  function loadCatalog(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        catalog = JSON.parse(raw);
      } else {
        catalog = seed.slice();
        saveCatalog();
      }
    }catch(e){
      catalog = seed.slice();
      storageOk = false;
    }
    render();
  }

  function saveCatalog(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    }catch(e){ storageOk = false; }
  }

  function uid(){ return 'g' + Date.now() + Math.floor(Math.random()*1000); }
  function esc(s){ const d=document.createElement('div'); d.innerText=s; return d.innerHTML; }

  function normName(n){ return (n||'').trim().toLowerCase(); }

  // "2 jugadores" cuando min y max coinciden; "2-4 jugadores" si no.
  function playersLabel(g){
    return g.minP === g.maxP ? `${g.minP} jugadores` : `${g.minP}-${g.maxP} jugadores`;
  }

  // Agrega el juego, o si ya existe uno con el mismo nombre, fusiona sus datos
  // (los campos con valor nuevo pisan al anterior). Devuelve 'added' o 'merged'.
  function upsertGame(data){
    const existing = catalog.find(g => normName(g.name) === normName(data.name));
    if(existing){
      if(data.description) existing.description = data.description;
      if(data.duration != null) existing.duration = data.duration;
      if(data.minP != null) existing.minP = data.minP;
      if(data.maxP != null) existing.maxP = data.maxP;
      return 'merged';
    }
    catalog.push({ id: data.id || uid(), name: data.name, description: data.description||'',
      duration: data.duration ?? null, minP: data.minP ?? 1, maxP: data.maxP ?? 1 });
    return 'added';
  }

  // ---------------- CSV EXPORT / IMPORT ----------------
  const CSV_HEADERS = ['name','description','duration','minP','maxP'];

  function csvCell(v){
    const s = (v===null || v===undefined) ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  }

  function exportCSV(){
    const rows = [CSV_HEADERS].concat(
      catalog.map(g => [g.name, g.description||'', g.duration, g.minP, g.maxP])
    );
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    // BOM para que Excel respete los acentos (UTF-8)
    const blob = new Blob(['﻿' + csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'gameswipe-catalogo.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Parser CSV que respeta comillas, comas y saltos de línea dentro de un campo.
  function parseCSV(text){
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for(let i=0; i<text.length; i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field = ''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else if(c !== '\r'){ field += c; }
    }
    if(field !== '' || row.length){ row.push(field); rows.push(row); }
    return rows;
  }

  function importCSV(text, opts = {}){
    if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // quita BOM
    const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
    if(rows.length < 2){ alert('El CSV no tiene filas de juegos.'); return; }

    const header = rows[0].map(h => h.trim().toLowerCase());
    const col = name => header.indexOf(name.toLowerCase());
    const iName = col('name'), iDesc = col('description'),
          iDur = col('duration'), iMin = col('minP'), iMax = col('maxP');
    if(iName === -1){ alert('El CSV debe tener una columna "name".'); return; }

    const parsed = [];
    for(let i=1; i<rows.length; i++){
      const r = rows[i];
      const name = (r[iName]||'').trim();
      if(!name) continue;
      const durRaw = iDur>=0 ? (r[iDur]||'').trim() : '';
      parsed.push({
        name,
        description: iDesc>=0 ? (r[iDesc]||'').trim() : '',
        duration: durRaw ? parseInt(durRaw) : null,
        minP: (iMin>=0 && parseInt(r[iMin])) || 1,
        maxP: (iMax>=0 && parseInt(r[iMax])) || 1,
      });
    }
    if(!parsed.length){ alert('No se encontraron juegos válidos en el CSV.'); return; }

    const replace = opts.mode === 'add' ? false
      : opts.mode === 'replace' ? true
      : confirm(
          `Se leyeron ${parsed.length} juego(s).\n\n` +
          `Aceptar = REEMPLAZAR tu colección actual.\n` +
          `Cancelar = AGREGAR a la colección existente (se fusionan los repetidos por nombre).`
        );
    if(replace) catalog = [];

    // upsertGame también fusiona filas repetidas dentro del propio CSV
    const addedNames = [], mergedNames = [];
    parsed.forEach(g => {
      if(upsertGame(g) === 'merged') mergedNames.push(g.name);
      else addedNames.push(g.name);
    });

    saveCatalog();
    render();

    let msg = `Importación lista: ${addedNames.length} agregado(s), ${mergedNames.length} fusionado(s).`;
    if(mergedNames.length){
      msg += `\n\nEstos juegos ya existían (se actualizaron sus datos):\n• ` + mergedNames.join('\n• ');
    }
    alert(msg);
  }

  // ---------------- RENDER DISPATCH ----------------
  function render(){
    if(cleanupVoting){ cleanupVoting(); cleanupVoting = null; }
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });
    const view = document.getElementById('view');
    if(state.tab === 'catalog'){ view.innerHTML = catalogViewHTML(); attachCatalogEvents(); }
    else { renderSession(); }
  }

  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click', ()=>{ state.tab = b.dataset.tab; render(); });
  });

  // ---------------- CATALOG VIEW ----------------
  function catalogViewHTML(){
    let list;
    if(catalog.length === 0){
      list = `<div class="empty-shelf"><span class="dice">📦</span>Tu estante está vacío.<br>Agrega el primer juego de la colección.</div>`;
    } else {
      list = `<div class="catalog-grid">` + catalog.map(g => `
        <div class="boxcard">
          <div class="corner-fold"></div>
          <div class="inner">
            <div class="txt">
              <h3>${esc(g.name)}</h3>
              <p class="desc">${esc(g.description||'')}</p>
              <div class="badges">
                ${g.duration ? `<span class="badge mono">⏱ ${g.duration} min</span>` : ''}
                <span class="badge mono">👥 ${playersLabel(g)}</span>
              </div>
            </div>
            <button class="del-btn" data-id="${g.id}" title="Eliminar">✕</button>
          </div>
        </div>`).join('') + `</div>`;
    }

    return `
      <div class="section-head"><h2>Tu colección <a href="#" class="base-link" id="baseLink" title="Agregar la colección base">(base)</a></h2><span>${catalog.length} juego${catalog.length===1?'':'s'}</span></div>
      <div class="catalog-toolbar">
        <button class="btn btn-ghost btn-sm" id="exportBtn" ${catalog.length===0?'disabled':''}>⬇ Exportar CSV</button>
        <button class="btn btn-ghost btn-sm" id="importBtn">⬆ Importar CSV</button>
        <input type="file" id="importInput" accept=".csv,text/csv" hidden>
      </div>
      ${list}
      <form class="addform" id="addGameForm">
        <h3>+ Agregar juego</h3>
        <div class="field-row">
          <div class="field"><label>Nombre</label><input name="name" id="nameInput" required placeholder="Ej: Wingspan"><small class="dupe-hint" id="dupeHint" hidden></small></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Descripción</label><textarea name="description" rows="2" placeholder="De qué se trata, en una línea"></textarea></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Duración (min) — opcional</label><input name="duration" type="number" min="5" placeholder="45"></div>
          <div class="field"><label>Mín. jugadores</label><input name="minP" type="number" min="1" required placeholder="2"></div>
          <div class="field"><label>Máx. jugadores</label><input name="maxP" type="number" min="1" required placeholder="4"></div>
        </div>
        <button type="submit" class="btn btn-primary">Agregar a la colección</button>
        ${!storageOk ? '<p class="warn">⚠ No se pudo guardar de forma persistente en este navegador — tu catálogo vivirá solo mientras dure esta pestaña.</p>' : ''}
      </form>
    `;
  }

  function attachCatalogEvents(){
    document.querySelectorAll('.del-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        catalog = catalog.filter(g=>g.id!==btn.dataset.id);
        saveCatalog(); render();
      });
    });

    const baseLink = document.getElementById('baseLink');
    if(baseLink) baseLink.addEventListener('click', (e)=>{ e.preventDefault(); addBaseCollection(); });

    const exportBtn = document.getElementById('exportBtn');
    if(exportBtn) exportBtn.addEventListener('click', exportCSV);

    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importInput');
    if(importBtn && importInput){
      importBtn.addEventListener('click', ()=> importInput.click());
      importInput.addEventListener('change', ()=>{
        const file = importInput.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = ()=>{ importCSV(reader.result); importInput.value=''; };
        reader.readAsText(file);
      });
    }

    const form = document.getElementById('addGameForm');
    if(!form) return;

    const nameInput = document.getElementById('nameInput');
    const dupeHint = document.getElementById('dupeHint');
    if(nameInput && dupeHint){
      nameInput.addEventListener('input', ()=>{
        const match = nameInput.value.trim() &&
          catalog.find(g => normName(g.name) === normName(nameInput.value));
        if(match){
          dupeHint.textContent = `Ya existe "${match.name}" — al agregar se actualizarán sus datos.`;
          dupeHint.hidden = false;
        } else {
          dupeHint.textContent = '';
          dupeHint.hidden = true;
        }
      });
    }

    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const name = fd.get('name').trim();
      if(!name) return;
      const durationRaw = fd.get('duration').trim();
      const result = upsertGame({
        name,
        description: fd.get('description').trim(),
        duration: durationRaw ? parseInt(durationRaw) : null,
        minP: parseInt(fd.get('minP'))||1,
        maxP: parseInt(fd.get('maxP'))||1,
      });
      if(result === 'merged') alert(`Ya tenías "${name}" en la colección — se actualizaron sus datos.`);
      saveCatalog();
      render();
    });
  }

  function addBaseCollection(){
    if(!confirm('¿Agregar la colección base de juegos a tu catálogo?\nLos que ya tengas se fusionan (no se duplican).')) return;
    fetch('base.csv')
      .then(res => { if(!res.ok) throw new Error(res.status); return res.text(); })
      .then(text => importCSV(text, {mode:'add'}))
      .catch(() => alert(
        'No se pudo cargar la colección base (base.csv).\n\n' +
        'Si abriste el archivo directamente (file://), el navegador bloquea la lectura. ' +
        'Probá con un servidor local o en la versión publicada.'
      ));
  }

  // ---------------- SESSION FLOW ----------------
  function renderSession(){
    if(cleanupVoting){ cleanupVoting(); cleanupVoting = null; }
    const view = document.getElementById('view');
    if(!state.session){
      view.innerHTML = sessionSetupHTML();
      attachSetupEvents();
      return;
    }
    const s = state.session;
    if(s.phase === 'pass'){ view.innerHTML = passScreenHTML(); attachPassEvents(); return; }
    if(s.phase === 'voting'){ view.innerHTML = votingHTML(); attachVotingEvents(); return; }
    if(s.phase === 'results'){ view.innerHTML = resultsHTML(); attachResultsEvents(); return; }
  }

  function sessionSetupHTML(){
    const players = state._tempPlayers || [];
    return `
      <div class="section-head"><h2>Nueva sesión de decisión</h2><span>${catalog.length} juegos en catálogo</span></div>
      ${catalog.length < 2 ? '<p class="warn">Necesitas al menos 2 juegos en tu catálogo para que el swipe tenga sentido. Ve a la pestaña Catálogo.</p>' : ''}
      <div class="players-list">
        ${players.map((p,i)=>`<div class="player-row"><span><span class="num">#${i+1}</span>${esc(p)}</span></div>`).join('')}
      </div>
      <div class="add-player-row">
        <input id="playerNameInput" placeholder="Nombre del jugador" maxlength="20">
        <button class="btn btn-ghost" id="addPlayerBtn">+ Agregar</button>
      </div>
      ${players.length === 0 ? '<p class="warn">Agrega al menos 1 jugador para empezar.</p>' : ''}
      <div class="actions-row">
        <button class="btn btn-primary" id="startSessionBtn" ${players.length===0 || catalog.length===0 ? 'disabled':''}>Comenzar votación</button>
      </div>
    `;
  }

  function attachSetupEvents(){
    if(!state._tempPlayers) state._tempPlayers = [];
    const input = document.getElementById('playerNameInput');
    const addBtn = document.getElementById('addPlayerBtn');
    function addPlayer(){
      const v = input.value.trim();
      if(!v) return;
      state._tempPlayers.push(v);
      input.value='';
      renderSession();
    }
    addBtn.addEventListener('click', addPlayer);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addPlayer(); } });

    document.getElementById('startSessionBtn').addEventListener('click', ()=>{
      // Incluye un nombre tipeado que no se llegó a "Agregar" con el botón.
      const pending = input.value.trim();
      if(pending){ state._tempPlayers.push(pending); input.value=''; }
      const players = state._tempPlayers;
      if(players.length===0 || catalog.length===0) return;
      state.session = {
        players,
        playerIndex: 0,
        phase: 'pass',
        cardIndex: 0,
        votes: Object.fromEntries(catalog.map(g=>[g.id, 0])),
        history: [] // for undo, per current player: list of {gameId}
      };
      state._tempPlayers = [];
      renderSession();
    });
  }

  function passScreenHTML(){
    const s = state.session;
    const name = s.players[s.playerIndex];
    return `
      <div class="pass-screen">
        <span class="dice">🎲</span>
        <h2>Pásale el celular a</h2>
        <h2 style="color:#fff; font-style:normal; font-weight:700;">${esc(name)}</h2>
        <p>Ronda ${s.playerIndex+1} de ${s.players.length} — vas a swipear ${catalog.length} juegos</p>
        <button class="btn btn-primary" id="readyBtn">Estoy list@, empezar</button>
      </div>
    `;
  }
  function attachPassEvents(){
    document.getElementById('readyBtn').addEventListener('click', ()=>{
      state.session.phase = 'voting';
      state.session.cardIndex = 0;
      state.session.history = [];
      renderSession();
    });
  }

  function votingHTML(){
    const s = state.session;
    if(s.cardIndex >= catalog.length){
      return `<div class="done-catalog-warn">Cargando siguiente paso…</div>`;
    }
    const remaining = catalog.slice(s.cardIndex, s.cardIndex+3);
    const cardsHTML = remaining.map((g,i)=>{
      const depth = i;
      const scale = 1 - depth*0.04;
      const yOff = depth*10;
      const isTop = depth===0;
      return `
        <div class="boxcard swipe-card" style="z-index:${10-depth}; transform:translateY(${yOff}px) scale(${scale});" data-top="${isTop}" data-id="${g.id}">
          <div class="corner-fold"></div>
          <div class="stamp like">¡SÍ!</div>
          <div class="stamp nope">NO</div>
          <div class="inner">
            <h3>${esc(g.name)}</h3>
            <p class="desc">${esc(g.description||'')}</p>
            <div class="badges">
              ${g.duration ? `<span class="badge mono">⏱ ${g.duration} min</span>` : ''}
              <span class="badge mono">👥 ${playersLabel(g)}</span>
            </div>
          </div>
        </div>`;
    }).reverse().join('');

    return `
      <div class="voting-wrap">
        <div class="progress-line mono">${esc(s.players[s.playerIndex])} · juego <b>${s.cardIndex+1}</b> de ${catalog.length}</div>
        <div class="stack" id="stack">${cardsHTML}</div>
        <div class="swipe-actions">
          <button class="round-btn nope" id="nopeBtn">✕</button>
          <button class="round-btn undo" id="undoBtn" ${s.history.length===0?'disabled style="opacity:.3"':''}>↺</button>
          <button class="round-btn like" id="likeBtn">❤</button>
        </div>
      </div>
    `;
  }

  function attachVotingEvents(){
    const s = state.session;
    const topCard = document.querySelector('.swipe-card[data-top="true"]');
    if(!topCard) return;

    let resolved = false; // evita contar la misma carta dos veces (swipes rápidos / handlers duplicados)
    function resolveVote(direction){
      if(resolved) return;
      resolved = true;
      const gameId = topCard.dataset.id;
      if(direction === 'like') s.votes[gameId] = (s.votes[gameId]||0) + 1;
      s.history.push({gameId, direction});
      s.cardIndex += 1;
      advanceAfterVote();
    }

    function advanceAfterVote(){
      if(s.cardIndex >= catalog.length){
        if(s.playerIndex < s.players.length - 1){
          s.playerIndex += 1;
          s.phase = 'pass';
        } else {
          s.phase = 'results';
        }
      }
      renderSession();
    }

    function animateOut(direction, cb){
      topCard.classList.add('dragging');
      const x = direction === 'like' ? 500 : -500;
      const rot = direction === 'like' ? 24 : -24;
      topCard.style.transition = 'transform .35s ease, opacity .35s ease';
      topCard.style.transform = `translate(${x}px, -30px) rotate(${rot}deg)`;
      topCard.style.opacity = '0';
      setTimeout(cb, 260);
    }

    document.getElementById('likeBtn').addEventListener('click', ()=> animateOut('like', ()=>resolveVote('like')));
    document.getElementById('nopeBtn').addEventListener('click', ()=> animateOut('nope', ()=>resolveVote('nope')));
    const undoBtn = document.getElementById('undoBtn');
    if(undoBtn && !undoBtn.disabled){
      undoBtn.addEventListener('click', ()=>{
        const last = s.history.pop();
        if(!last) return;
        if(last.direction === 'like') s.votes[last.gameId] = Math.max(0,(s.votes[last.gameId]||0)-1);
        s.cardIndex -= 1;
        renderSession();
      });
    }

    // drag
    let startX=0, startY=0, dragging=false, curX=0;
    function onDown(e){
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      startX = p.clientX; startY = p.clientY;
      topCard.classList.add('dragging');
    }
    function onMove(e){
      if(!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      curX = p.clientX - startX;
      const curY = p.clientY - startY;
      const rot = curX/18;
      topCard.style.transform = `translate(${curX}px, ${curY*0.2}px) rotate(${rot}deg)`;
      const likeStamp = topCard.querySelector('.stamp.like');
      const nopeStamp = topCard.querySelector('.stamp.nope');
      likeStamp.style.opacity = Math.max(0, Math.min(1, curX/80));
      nopeStamp.style.opacity = Math.max(0, Math.min(1, -curX/80));
    }
    function onUp(){
      if(!dragging) return;
      dragging = false;
      topCard.classList.remove('dragging');
      if(Math.abs(curX) > 90){
        animateOut(curX > 0 ? 'like':'nope', ()=>resolveVote(curX>0?'like':'nope'));
      } else {
        topCard.style.transform = '';
        topCard.querySelectorAll('.stamp').forEach(s=>s.style.opacity=0);
      }
      curX = 0;
    }
    function keyHandler(e){
      if(e.key === 'ArrowRight') animateOut('like', ()=>resolveVote('like'));
      if(e.key === 'ArrowLeft') animateOut('nope', ()=>resolveVote('nope'));
    }

    topCard.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.addEventListener('keydown', keyHandler);

    // Se llama en el próximo render (ver renderSession/render): quita estos listeners
    // para que no se acumulen carta a carta ni disparen votos fantasma.
    cleanupVoting = ()=>{
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', keyHandler);
    };
  }

  // Standard competition ranking (1-1-3): ties share a rank, next distinct value skips ahead.
  function rankGames(){
    const s = state.session;
    const sorted = catalog.map(g=>({...g, votes:s.votes[g.id]||0}))
      .sort((a,b)=> b.votes - a.votes);
    let rank = 1;
    return sorted.map((g,i)=>{
      if(i > 0 && g.votes === sorted[i-1].votes){ /* keep same rank */ }
      else { rank = i + 1; }
      return {...g, rank};
    });
  }

  function resultsHTML(){
    const s = state.session;
    const ranked = rankGames();

    // group games by rank, keep only tiers whose rank is 1, 2 or 3
    const tierMap = {};
    ranked.forEach(g=>{ if(g.rank<=3){ (tierMap[g.rank] = tierMap[g.rank]||[]).push(g); } });
    const tierRanks = Object.keys(tierMap).map(Number).sort((a,b)=>a-b);

    // classic 2-1-3 visual arch only when exactly ranks 1,2,3 are all present; otherwise ascending
    let visualOrder;
    if(tierRanks.length === 3 && tierRanks[0]===1 && tierRanks[1]===2 && tierRanks[2]===3){
      visualOrder = [2,1,3];
    } else {
      visualOrder = tierRanks;
    }
    const heightCls = {1:'p-1', 2:'p-2', 3:'p-3'};
    const medal = {1:'🥇', 2:'🥈', 3:'🥉'};

    const podiumHTML = visualOrder.map(rankNum=>{
      const games = tierMap[rankNum];
      if(!games) return `<div class="podium-col"></div>`;
      const votes = games[0].votes;
      const namesHTML = games.map(g=>`<h4 class="tie-name">${esc(g.name)}</h4>`).join('');
      return `
        <div class="podium-col">
          <div class="podium-card ${heightCls[rankNum]}">
            <span class="rank mono">${medal[rankNum]} #${rankNum}</span>
            ${namesHTML}
            ${games.length>1 ? `<span class="tie-tag">Empate · ${games.length} juegos</span>` : ''}
            <span class="votes">${votes} voto${votes===1?'':'s'}</span>
          </div>
          <div class="podium-base"></div>
        </div>`;
    }).join('');

    const fullList = ranked.map(g=>`
      <div class="fr-row">
        <span class="fr-rank">#${g.rank}</span>
        <span class="fr-name">${esc(g.name)}</span>
        <span class="fr-votes">${g.votes} ❤</span>
      </div>`).join('');

    return `
      <div class="results-head">
        <h2>¡Ya está decidido!</h2>
        <p>${s.players.length} jugador${s.players.length===1?'':'es'} votaron por ${catalog.length} juegos</p>
      </div>
      <div class="podium">${podiumHTML}</div>
      <div class="full-results">${fullList}</div>
      <div class="actions-row">
        <button class="btn btn-primary" id="newSessionBtn">Nueva sesión</button>
      </div>
    `;
  }

  function attachResultsEvents(){
    document.getElementById('newSessionBtn').addEventListener('click', ()=>{
      state.session = null;
      state._tempPlayers = [];
      renderSession();
    });
  }

  loadCatalog();
})();
