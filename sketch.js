// ---- Animation constants ----
const GRID_H   = 1080;
const ANIM_FONT = "'Roboto Mono', monospace";

// ---- State ----
let grid, gridSize, gridRows, cs, gridOffX, gridOffY;
let eraserDown, eraserMode, shiftDown, sKeyDown, hKeyDown;
let lineStartI, lineStartJ, lineAxis;
let panAccX, panAccY, panMoved;
let brush, brushes, ns;
let undoStack, sizes;
let selectionMode;

// Animation
let frames, currentFrame, frameUndoStacks;
let isPlaying, fps, playElapsed;
let showOnionSkin;
let showGuides;

// Image refs
let refImages, hasImages, imgOpacity;

// ---- Setup ----
function setup() {
  sizes    = [8, 16, 32, 64, 128];
  gridSize = sizes[3];
  cs       = 1920 / gridSize;
  gridOffX = 2 * cs;
  gridOffY = floor(cs / 2);

  let cnv = createCanvas(1920 + gridOffX, gridOffY + GRID_H + floor(cs / 2));
  // Move p5 canvas into #app, between top-bar and bottom-bar
  document.getElementById('app').insertBefore(cnv.elt, document.getElementById('bottom-bar'));
  _applyCanvasCSS();

  document.addEventListener('keydown', e => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); applyUndo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault(); duplicateFrame(currentFrame); return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); switchFrameWrapped(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); switchFrameWrapped( 1); return; }
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); switchFrameWrapped(-1); return; }
    if (e.key.toLowerCase() === 'd') { e.preventDefault(); switchFrameWrapped( 1); return; }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (!isPlaying) {
        if (frames.length > 1) deleteFrame(currentFrame);
        else { clearGrid(); pushUndo(); refImages = []; hasImages = false; _updateImageToolbar(); }
      }
      return;
    }
  });

  gridRows = floor(GRID_H / cs);
  grid     = createGridArray(gridSize, gridRows);
  ns       = createNoise();
  undoStack = [];
  pushUndo();

  eraserDown = false; eraserMode = false; shiftDown = false; sKeyDown = false; hKeyDown = false;
  lineStartI = -1; lineStartJ = -1; lineAxis = null;
  panAccX = panAccY = 0; panMoved = false;

  brushes = ["RECTANGLE","RECTANGLE_OUTLINE","DIAMOND","DIAMOND_OUTLINE",
             "ELLIPSE_FILLED","ELLIPSE","HATCHED","CROSS","NOISE"];
  brush = "RECTANGLE";
  selectionMode = false;

  frames          = [captureGrid()];
  currentFrame    = 0;
  frameUndoStacks = [undoStack];
  isPlaying       = false;
  fps             = 6;
  playElapsed     = 0;
  showOnionSkin   = false;
  showGuides      = false;

  refImages = []; hasImages = false; imgOpacity = 255;

  _setupHTML();
  buildStrip();
}

// ---- HTML glue ----
function _setupHTML() {
  let fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', () => {
    if (!fileInput.files || !fileInput.files.length) return;
    _loadImageFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    clearGrid(); pushUndo();
  });
  document.getElementById('guides-btn').addEventListener('click', () => {
    showGuides = !showGuides;
    let btn = document.getElementById('guides-btn');
    btn.classList.toggle('active', showGuides);
    if (!showGuides) _deactivateBtn(btn);
    else btn.classList.remove('just-deactivated');
  });
  document.getElementById('upload-btn').addEventListener('click', () => {
    if (hasImages) {
      refImages = []; hasImages = false; _updateImageToolbar();
    } else {
      document.getElementById('file-input').click();
    }
  });
  document.getElementById('opacity-slider').addEventListener('input', e => {
    imgOpacity = map(parseInt(e.target.value), 0, 100, 0, 255);
  });
  document.getElementById('onion-btn').addEventListener('click', () => {
    showOnionSkin = !showOnionSkin;
    let btn = document.getElementById('onion-btn');
    btn.classList.toggle('active', showOnionSkin);
    if (!showOnionSkin) _deactivateBtn(btn);
    else btn.classList.remove('just-deactivated');
  });

  let fpsInput = document.getElementById('fps-input');
  fpsInput.addEventListener('change', () => {
    let v = parseInt(fpsInput.value);
    if (!isNaN(v) && v >= 1 && v <= 99) fps = v;
    fpsInput.value = fps;
  });
  fpsInput.addEventListener('focus', () => fpsInput.select());
  document.getElementById('fps-group').addEventListener('click', () => fpsInput.focus());

  document.getElementById('play-btn').addEventListener('click', togglePlay);
  document.getElementById('add-frame-btn').addEventListener('click', addFrame);
  document.getElementById('export-btn').addEventListener('click', exportFrames);

  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    let imgs = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (imgs.length) _loadImageFiles(imgs);
  });
  document.addEventListener('paste', e => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    let imgs = Array.from(e.clipboardData.items)
      .filter(i => i.type.startsWith('image/'))
      .map(i => i.getAsFile())
      .filter(Boolean);
    if (imgs.length) _loadImageFiles(imgs);
  });
}

function _updateImageToolbar() {
  document.getElementById('upload-btn').textContent = hasImages ? 'Remove IMG' : 'Upload IMG';
  let grp = document.getElementById('opacity-group');
  let sl  = document.getElementById('opacity-slider');
  grp.style.display = hasImages ? 'flex' : 'none';
  if (hasImages) sl.value = Math.round(imgOpacity / 255 * 100);
}

function buildStrip() {
  let strip = document.getElementById('frame-strip');
  strip.innerHTML = '';
  for (let i = 0; i < frames.length; i++) {
    let tab = document.createElement('button');
    tab.className = 'frame-tab' + (i === currentFrame ? ' active' : '');
    tab.dataset.idx = i;
    tab.title = 'Frame ' + (i + 1);
    let num = document.createElement('span');
    num.textContent = i + 1;
    tab.appendChild(num);
    if (frames.length > 1) {
      let del = document.createElement('span');
      del.className = 'tab-del';
      del.textContent = '×';
      del.title = 'Delete frame';
      del.addEventListener('click', ev => { ev.stopPropagation(); deleteFrame(i); });
      tab.appendChild(del);
    }
    tab.addEventListener('click', () => { if (!isPlaying) switchFrame(i); });
    strip.appendChild(tab);
  }
  document.getElementById('add-frame-btn').disabled = frames.length >= 24;
}

function _highlightActiveFrame() {
  document.querySelectorAll('.frame-tab').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.idx) === currentFrame);
  });
}

function togglePlay() {
  if (!isPlaying) {
    frames[currentFrame]          = captureGrid();
    frameUndoStacks[currentFrame] = undoStack;
  }
  isPlaying = !isPlaying;
  playElapsed = 0;
  document.getElementById('play-btn').classList.toggle('playing', isPlaying);
}

// ---- CSS scaling (canvas only, bars are fixed HTML) ----
function _applyCanvasCSS() {
  let el = document.querySelector('canvas');
  let ar = width / height;
  let availW = window.innerWidth - 48; // 24px left + 24px right body padding
  let availH = window.innerHeight - 12 - 45 - 45 - 24; // body padding-top + top-bar + bottom-bar + padding-bottom
  let targetW = Math.min(width, availW, availH * ar);
  let targetH = Math.round(targetW / ar);
  el.style.width  = Math.round(targetW) + 'px';
  el.style.height = targetH + 'px';
  // Align bar content with the grid (offset past the brush panel)
  let pl = Math.round(gridOffX * (targetW / width)) + 'px';
  document.getElementById('top-bar').style.paddingLeft    = pl;
  document.getElementById('bottom-bar').style.paddingLeft = pl;
}

function _deactivateBtn(btn) {
  btn.classList.add('just-deactivated');
  btn.addEventListener('mouseleave', () => btn.classList.remove('just-deactivated'), { once: true });
}

function windowResized() {
  _applyCanvasCSS();
}

// ---- Main draw ----
function draw() {
  background(0);

  if (isPlaying) {
    playElapsed += deltaTime;
    if (playElapsed >= 1000 / fps) {
      currentFrame = (currentFrame + 1) % frames.length;
      undoStack    = frameUndoStacks[currentFrame];
      restoreGrid(frames[currentFrame]);
      playElapsed -= 1000 / fps;
      _highlightActiveFrame();
    }
  }

  drawGrid();
  if (showGuides) drawGuides();

  if (mouseIsPressed && !hKeyDown && !isPlaying && getToolbarIndex() < 0) {
    drawCell();
  }

  drawBrushBar();

  if (hKeyDown) {
    cursor(mouseIsPressed ? 'grabbing' : 'grab');
  } else if (getToolbarIndex() >= 0) {
    cursor(ARROW);
  } else if (mouseX >= gridOffX && mouseX < width && mouseY >= gridOffY && mouseY < gridOffY + GRID_H) {
    noCursor();
    drawCursor();
  } else {
    cursor(ARROW);
  }
}

// ---- Scale grid ----
function scaleGrid(n) {
  let i = (sizes.indexOf(gridSize) + n + sizes.length) % sizes.length;
  gridSize = sizes[i];
  cs       = 1920 / gridSize;
  gridOffX = 2 * cs;
  gridOffY = floor(cs / 2);
  gridRows = floor(GRID_H / cs);
  resizeCanvas(1920 + gridOffX, gridOffY + GRID_H + floor(cs / 2));
  _applyCanvasCSS();
  grid = createGridArray(gridSize, gridRows);
  ns   = createNoise();
  undoStack = [];
  pushUndo();
  frames          = [captureGrid()];
  currentFrame    = 0;
  frameUndoStacks = [undoStack];
  buildStrip();
}

// --------------------------------------------------------------
// DRAWING
// --------------------------------------------------------------

function createNoise() {
  let n = createGraphics(cs, cs);
  n.noStroke();
  for (let x = 0; x < cs; x++) {
    for (let y = 0; y < cs; y++) {
      if (random(100) < 5) {
        n.fill(random(255));
        n.rect(x, y, 1, 1);
      }
    }
  }
  return n;
}

function createGridArray(cols, rows) {
  let g = [];
  for (let i = 0; i < cols; i++) {
    g[i] = [];
    for (let j = 0; j < rows; j++) {
      g[i][j] = new Particle(gridOffX + i * cs, gridOffY + j * cs);
    }
  }
  return g;
}

function randomiseLiveCells() {
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridRows; y++) {
      if (grid[x][y].on) {
        grid[x][y].b = random(brushes);
        if (grid[x][y].b === "NOISE") grid[x][y].ns = createNoise();
      }
    }
  }
}

function createRandomGridArray() {
  let g = createGridArray(gridSize, gridRows);
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridRows; j++) {
      g[i][j].on = random([true, false]);
      g[i][j].b  = random(brushes);
      if (g[i][j].b === "NOISE") g[i][j].ns = createNoise();
    }
  }
  return g;
}

function drawGuides() {
  let midX = gridOffX + 960;
  let midY = gridOffY + GRID_H / 2;
  drawingContext.setLineDash([1, 8]);
  stroke(255);
  strokeWeight(1);
  drawingContext.lineDashOffset = (9 - (midY % 9)) % 9;
  line(midX, gridOffY, midX, gridOffY + GRID_H);
  drawingContext.lineDashOffset = 3;
  line(gridOffX, midY, width, midY);
  drawingContext.setLineDash([]);
  drawingContext.lineDashOffset = 0;
  noStroke();
}

function drawGrid() {
  if (hasImages && refImages.length > 0) {
    let img = refImages[min(currentFrame, refImages.length - 1)];
    if (img) {
      push();
      tint(255, imgOpacity);
      let ix = gridOffX + (1920 - img.width)  / 2;
      let iy = gridOffY + (GRID_H - img.height) / 2;
      image(img, ix, iy);
      noTint();
      pop();
    }
  }

  if (showOnionSkin && !isPlaying && currentFrame > 0) {
    let prevSnap = frames[currentFrame - 1];
    push();
    noStroke();
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridRows; y++) {
        if (prevSnap[x] && prevSnap[x][y] && prevSnap[x][y].on) {
          fill(255, 255, 255, 50);
          rect(gridOffX + x * cs, gridOffY + y * cs, cs, cs);
        }
      }
    }
    pop();
  }

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridRows; y++) {
      grid[x][y].show();
    }
  }
}

function getCellUnderMouse() {
  if (mouseX >= gridOffX && mouseX < width && mouseY >= gridOffY && mouseY < gridOffY + GRID_H) {
    let ci = floor((mouseX - gridOffX) / cs);
    let cj = floor((mouseY - gridOffY) / cs);
    if (ci >= 0 && ci < gridSize && cj >= 0 && cj < gridRows) {
      return grid[ci][cj];
    }
  }
  return null;
}

function drawCell() {
  if (sKeyDown || selectionMode) {
    let cell = getCellUnderMouse();
    if (cell && cell.on) cell.selected = true;
    return;
  }

  if (shiftDown) {
    let rawCi = floor((mouseX - gridOffX) / cs);
    let rawCj = floor((mouseY - gridOffY) / cs);
    if (rawCi < 0 || rawCi >= gridSize || rawCj < 0 || rawCj >= gridRows) return;
    if (lineStartI < 0) { lineStartI = rawCi; lineStartJ = rawCj; lineAxis = null; }
    if (lineAxis === null) {
      let di = abs(rawCi - lineStartI), dj = abs(rawCj - lineStartJ);
      if (di > 0 || dj > 0) lineAxis = di >= dj ? "H" : "V";
    }
    let ci = lineAxis === "V" ? lineStartI : rawCi;
    let cj = lineAxis === "H" ? lineStartJ : rawCj;
    let cell = grid[ci][cj];
    if (eraserDown || eraserMode) { cell.on = false; return; }
    let wasNoise = cell.on && cell.b === "NOISE";
    cell.b = brush; cell.on = true;
    if (brush === "NOISE" && !wasNoise) cell.ns = createNoise();
    return;
  }

  let cell = getCellUnderMouse();
  if (!cell) return;
  if (eraserDown || eraserMode) { cell.on = false; return; }
  let wasNoise = cell.on && cell.b === "NOISE";
  cell.b  = brush;
  cell.on = true;
  if (brush === "NOISE" && !wasNoise) cell.ns = createNoise();
}

function clearGrid() {
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridRows; y++) {
      grid[x][y].on = false;
    }
  }
}

function moveCells(dx, dy) {
  let newGrid = createGridArray(gridSize, gridRows);
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridRows; j++) {
      let cell = grid[i][j];
      if (cell.on) {
        let ni = (i + dx + gridSize) % gridSize;
        let nj = (j + dy + gridRows) % gridRows;
        newGrid[ni][nj].on = true;
        newGrid[ni][nj].b  = cell.b;
        newGrid[ni][nj].ns = cell.ns;
      }
    }
  }
  grid = newGrid;
}

function getCopyGrid() {
  let cp = createGridArray(gridSize, gridRows);
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridRows; j++) {
      cp[i][j].on       = grid[i][j].on;
      cp[i][j].b        = grid[i][j].b;
      cp[i][j].ns       = grid[i][j].ns;
      cp[i][j].selected = grid[i][j].selected;
    }
  }
  return cp;
}

function moveSelectedCells(dx, dy) {
  let moving = [];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridRows; j++) {
      if (grid[i][j].selected) {
        moving.push({
          b:  grid[i][j].b,
          ns: grid[i][j].ns,
          ni: (i + dx + gridSize) % gridSize,
          nj: (j + dy + gridRows) % gridRows,
        });
        grid[i][j].on       = false;
        grid[i][j].selected = false;
      }
    }
  }
  for (let m of moving) {
    grid[m.ni][m.nj].on       = true;
    grid[m.ni][m.nj].b        = m.b;
    grid[m.ni][m.nj].ns       = m.ns;
    grid[m.ni][m.nj].selected = true;
  }
}

function clearSelection() {
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridRows; y++) {
      grid[x][y].selected = false;
    }
  }
}

function selectionExists() {
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridRows; j++) {
      if (grid[i][j].selected) return true;
    }
  }
  return false;
}

// --------------------------------------------------------------
// TOOLBAR
// --------------------------------------------------------------

function setTool(t) {
  let current = selectionMode ? "SELECTION" : (eraserMode ? "ERASER" : brush);
  if (t === current) return;
  selectionMode = false;
  eraserMode    = false;
  if (t === "SELECTION") {
    selectionMode = true;
  } else if (t === "ERASER") {
    eraserMode = true;
  } else {
    brush = t;
  }
}

function getToolbarIndex() {
  let margin = cs / 2;
  let gap    = 0;
  let allTools = [...brushes, "ERASER", "SELECTION"];
  if (mouseX < margin || mouseX > margin + cs) return -1;
  for (let i = 0; i < allTools.length; i++) {
    let y = gridOffY + i * (cs + gap);
    if (mouseY >= y && mouseY <= y + cs) return i;
  }
  return -1;
}

function drawBrushBar() {
  let margin   = cs / 2;
  let gap      = 0;
  let allTools = [...brushes, "ERASER", "SELECTION"];
  let active   = selectionMode ? "SELECTION" : (eraserMode ? "ERASER" : brush);

  for (let i = 0; i < allTools.length; i++) {
    let tool = allTools[i];
    let x    = margin;
    let y    = gridOffY + i * (cs + gap);
    let cx   = x + cs / 2;
    let cy   = y + cs / 2;
    let a    = tool === active ? 255 : 128;

    push();
    noFill(); stroke(255, 255, 255, a); strokeWeight(1);

    switch (tool) {
      case "RECTANGLE":
        fill(255, 255, 255, a); noStroke();
        rect(x, y, cs, cs);
        break;
      case "RECTANGLE_OUTLINE":
        rect(x + 0.5, y + 0.5, cs - 1, cs - 1);
        break;
      case "DIAMOND":
        fill(255, 255, 255, a); noStroke();
        quad(x, cy, cx, y, x + cs, cy, cx, y + cs);
        break;
      case "DIAMOND_OUTLINE":
        quad(x + 1, cy, cx, y + 1, x + cs - 1, cy, cx, y + cs - 1);
        break;
      case "ELLIPSE_FILLED":
        fill(255, 255, 255, a); noStroke();
        ellipse(cx, cy, cs, cs);
        break;
      case "ELLIPSE":
        ellipse(cx, cy, cs, cs);
        break;
      case "HATCHED": {
        let d = cs / 10;
        for (let off = 0; off < cs; off += d) {
          line(x + off, y,      x,      y + off);
          line(x + off, y + cs, x + cs, y + off);
        }
        break;
      }
      case "CROSS":
        line(x, y, x + cs, y + cs);
        line(x + cs, y, x, y + cs);
        break;
      case "NOISE":
        tint(255, a);
        image(ns, x, y);
        noTint();
        break;
      case "ERASER":
        rect(x + 0.5, y + 0.5, cs - 1, cs - 1);
        line(x, y, x + cs, y + cs);
        line(x + cs, y, x, y + cs);
        break;
      case "SELECTION": {
        let half = cs * 0.15;
        ellipse(cx, cy, cs, cs);
        line(cx - half, cy, cx + half, cy);
        line(cx, cy - half, cx, cy + half);
        break;
      }
    }
    pop();
  }
}

// --------------------------------------------------------------
// CURSOR
// --------------------------------------------------------------

function drawCursor() {
  let rawCi = floor((mouseX - gridOffX) / cs);
  let rawCj = floor((mouseY - gridOffY) / cs);
  if (rawCi < 0 || rawCi >= gridSize || rawCj < 0 || rawCj >= gridRows) return;

  let ci = rawCi, cj = rawCj;
  if (shiftDown && lineAxis !== null && lineStartI >= 0) {
    ci = lineAxis === "V" ? lineStartI : rawCi;
    cj = lineAxis === "H" ? lineStartJ : rawCj;
  }

  let snapX = gridOffX + ci * cs;
  let snapY = gridOffY + cj * cs;
  let cx    = snapX + cs / 2;
  let cy    = snapY + cs / 2;

  push();
  noStroke(); fill(0);
  rect(snapX, snapY, cs, cs);

  noFill(); stroke(255); strokeWeight(1);

  if (sKeyDown || selectionMode) {
    let half = cs * 0.15;
    ellipse(cx, cy, cs, cs);
    line(cx - half, cy, cx + half, cy);
    line(cx, cy - half, cx, cy + half);
    pop(); return;
  }

  if (eraserDown || eraserMode) {
    rect(snapX + 0.5, snapY + 0.5, cs - 1, cs - 1);
    line(snapX, snapY, snapX + cs, snapY + cs);
    line(snapX + cs, snapY, snapX, snapY + cs);
    pop(); return;
  }

  switch (brush) {
    case "RECTANGLE":
      fill(255);
      rect(snapX, snapY, cs, cs);
      break;
    case "ELLIPSE_FILLED":
      fill(255);
      ellipse(cx, cy, cs, cs);
      break;
    case "DIAMOND":
      fill(255);
      quad(snapX, cy, cx, snapY, snapX + cs, cy, cx, snapY + cs);
      break;
    case "RECTANGLE_OUTLINE":
      rect(snapX + 0.5, snapY + 0.5, cs - 1, cs - 1);
      break;
    case "DIAMOND_OUTLINE":
      quad(snapX + 1, cy, cx, snapY + 1, snapX + cs - 1, cy, cx, snapY + cs - 1);
      break;
    case "ELLIPSE":
      ellipse(cx, cy, cs, cs);
      break;
    case "CROSS":
      line(snapX, snapY, snapX + cs, snapY + cs);
      line(snapX + cs, snapY, snapX, snapY + cs);
      break;
    case "NOISE":
      image(ns, snapX, snapY);
      break;
    case "HATCHED": {
      let d = cs / 10;
      for (let off = 0; off < cs; off += d) {
        line(snapX + off, snapY,      snapX,      snapY + off);
        line(snapX + off, snapY + cs, snapX + cs, snapY + off);
      }
      break;
    }
  }

  pop();
}

// --------------------------------------------------------------
// UNDO
// --------------------------------------------------------------

function pushUndo() {
  let snapshot = [];
  for (let i = 0; i < gridSize; i++) {
    snapshot[i] = [];
    for (let j = 0; j < gridRows; j++) {
      snapshot[i][j] = { on: grid[i][j].on, b: grid[i][j].b };
    }
  }
  undoStack.push(snapshot);
  if (undoStack.length > 50) undoStack.shift();
}

function applyUndo() {
  if (undoStack.length <= 1) return;
  undoStack.pop();
  let snapshot = undoStack[undoStack.length - 1];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridRows; j++) {
      grid[i][j].on = snapshot[i][j].on;
      grid[i][j].b  = snapshot[i][j].b;
      if (grid[i][j].on && grid[i][j].b === "NOISE") grid[i][j].ns = createNoise();
    }
  }
}

// --------------------------------------------------------------
// FRAME MANAGEMENT
// --------------------------------------------------------------

function captureGrid() {
  let snap = [];
  for (let i = 0; i < gridSize; i++) {
    snap[i] = [];
    for (let j = 0; j < gridRows; j++) {
      snap[i][j] = { on: grid[i][j].on, b: grid[i][j].b, ns: grid[i][j].ns };
    }
  }
  return snap;
}

function restoreGrid(snap) {
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridRows; j++) {
      grid[i][j].on       = snap[i][j].on;
      grid[i][j].b        = snap[i][j].b;
      grid[i][j].ns       = snap[i][j].ns;
      grid[i][j].selected = false;
    }
  }
}

function createBlankSnapshot() {
  let snap = [];
  for (let i = 0; i < gridSize; i++) {
    snap[i] = [];
    for (let j = 0; j < gridRows; j++) {
      snap[i][j] = { on: false, b: 0, ns: null };
    }
  }
  return snap;
}

function deepCopySnapshot(snap) {
  let copy = [];
  for (let i = 0; i < snap.length; i++) {
    copy[i] = [];
    for (let j = 0; j < snap[i].length; j++) {
      copy[i][j] = { on: snap[i][j].on, b: snap[i][j].b, ns: snap[i][j].ns };
    }
  }
  return copy;
}

function switchFrame(newIdx) {
  if (newIdx === currentFrame || newIdx < 0 || newIdx >= frames.length) return;
  frames[currentFrame]          = captureGrid();
  frameUndoStacks[currentFrame] = undoStack;
  currentFrame = newIdx;
  undoStack    = frameUndoStacks[currentFrame];
  restoreGrid(frames[currentFrame]);
  clearSelection();
  _highlightActiveFrame();
}

function switchFrameWrapped(delta) {
  if (frames.length <= 1) return;
  switchFrame((currentFrame + delta + frames.length) % frames.length);
}

function addFrame() {
  if (frames.length >= 24) return;
  frames[currentFrame]          = captureGrid();
  frameUndoStacks[currentFrame] = undoStack;
  let newSnap  = createBlankSnapshot();
  let newStack = [];
  frames.push(newSnap);
  frameUndoStacks.push(newStack);
  currentFrame = frames.length - 1;
  undoStack    = frameUndoStacks[currentFrame];
  restoreGrid(frames[currentFrame]);
  pushUndo();
  buildStrip();
}

function deleteFrame(idx) {
  if (frames.length <= 1) return;
  frames.splice(idx, 1);
  frameUndoStacks.splice(idx, 1);
  let newIdx   = min(currentFrame, frames.length - 1);
  currentFrame = newIdx;
  undoStack    = frameUndoStacks[currentFrame];
  restoreGrid(frames[currentFrame]);
  clearSelection();
  buildStrip();
}

function duplicateFrame(idx) {
  if (frames.length >= 24) return;
  frames[currentFrame]          = captureGrid();
  frameUndoStacks[currentFrame] = undoStack;
  let copy     = deepCopySnapshot(frames[idx]);
  let newStack = [];
  frames.splice(idx + 1, 0, copy);
  frameUndoStacks.splice(idx + 1, 0, newStack);
  currentFrame = idx + 1;
  undoStack    = frameUndoStacks[currentFrame];
  restoreGrid(frames[currentFrame]);
  pushUndo();
  buildStrip();
}

// --------------------------------------------------------------
// EXPORT
// --------------------------------------------------------------

function renderSnapshotToGraphics(snap) {
  let g = createGraphics(1920, GRID_H);
  g.noSmooth();
  g.background(0);

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridRows; y++) {
      let cell = snap[x][y];
      let px   = x * cs;
      let py   = y * cs;
      let pcx  = px + cs / 2;
      let pcy  = py + cs / 2;

      if (!cell.on) {
        g.noStroke(); g.fill(255);
        g.rect(px + cs / 2, py + cs / 2, 1, 1);
        continue;
      }

      switch (cell.b) {
        case "RECTANGLE":
          g.noStroke(); g.fill(255); g.rect(px, py, cs, cs); break;
        case "RECTANGLE_OUTLINE":
          g.noFill(); g.stroke(255); g.strokeWeight(1);
          g.rect(px + 0.5, py + 0.5, cs - 1, cs - 1); g.noStroke(); break;
        case "ELLIPSE":
          g.noFill(); g.stroke(255); g.strokeWeight(1);
          g.ellipse(pcx, pcy, cs, cs); g.noStroke(); break;
        case "ELLIPSE_FILLED":
          g.noStroke(); g.fill(255); g.ellipse(pcx, pcy, cs, cs); break;
        case "CROSS":
          g.noFill(); g.stroke(255); g.strokeWeight(1);
          g.line(px, py, px + cs, py + cs);
          g.line(px + cs, py, px, py + cs);
          g.noStroke(); break;
        case "NOISE":
          if (cell.ns) g.image(cell.ns, px, py); break;
        case "HATCHED": {
          g.noFill(); g.stroke(255); g.strokeWeight(1);
          let d = cs / 10;
          for (let off = 0; off < cs; off += d) {
            g.line(px + off, py,      px,      py + off);
            g.line(px + off, py + cs, px + cs, py + off);
          }
          g.noStroke(); break;
        }
        case "DIAMOND":
          g.noStroke(); g.fill(255);
          g.quad(px, pcy, pcx, py, px + cs, pcy, pcx, py + cs); break;
        case "DIAMOND_OUTLINE":
          g.noFill(); g.stroke(255); g.strokeWeight(1);
          g.quad(px + 1, pcy, pcx, py + 1, px + cs - 1, pcy, pcx, py + cs - 1);
          g.noStroke(); break;
      }
    }
  }
  return g;
}

async function exportFrames() {
  isPlaying = false;
  frames[currentFrame] = captureGrid();

  let zip = new JSZip();
  for (let i = 0; i < frames.length; i++) {
    let g = renderSnapshotToGraphics(frames[i]);
    zip.file(
      "frame-" + String(i + 1).padStart(3, "0") + ".png",
      g.elt.toDataURL("image/png").split(",")[1],
      { base64: true }
    );
    g.remove();
  }
  let blob = await zip.generateAsync({ type: "blob" });
  let a    = document.createElement("a");
  a.href   = URL.createObjectURL(blob);
  a.download = "animation-export.zip";
  a.click();
}

// --------------------------------------------------------------
// FILE LOADING
// --------------------------------------------------------------

function _loadImageFiles(fileList) {
  let count = fileList.length, imgs = new Array(count), loaded = 0;
  for (let i = 0; i < count; i++) {
    ((idx) => loadImage(URL.createObjectURL(fileList[idx]), img => {
      imgs[idx] = img;
      if (++loaded === count) {
        refImages = imgs;
        hasImages = true;
        imgOpacity = 255;
        document.getElementById('opacity-slider').value = '100';
        _updateImageToolbar();
        let need = min(count, 24);
        while (frames.length < need) addFrame();
        switchFrame(0);
      }
    }))(i);
  }
}

// --------------------------------------------------------------
// MOUSE
// --------------------------------------------------------------

function mousePressed() {
  let ti = getToolbarIndex();
  if (ti >= 0) {
    setTool([...brushes, "ERASER", "SELECTION"][ti]);
    return;
  }

  if (!sKeyDown && !selectionMode) clearSelection();

  if (shiftDown) {
    let ci = floor((mouseX - gridOffX) / cs);
    let cj = floor((mouseY - gridOffY) / cs);
    if (ci >= 0 && ci < gridSize && cj >= 0 && cj < gridRows) {
      lineStartI = ci; lineStartJ = cj; lineAxis = null;
    }
  }
}

function mouseReleased() {
  lineStartI = -1; lineStartJ = -1; lineAxis = null;
  if (hKeyDown) return;
  if (getToolbarIndex() >= 0) return;
  if (mouseX >= 0 && mouseX < width && mouseY >= gridOffY && mouseY < gridOffY + GRID_H) {
    pushUndo();
  }
}

function mouseDragged() { _applyPan(); }
function mouseMoved()   { _applyPan(); }

function _applyPan() {
  if (!hKeyDown) return;
  let move = selectionExists() ? moveSelectedCells : moveCells;
  panAccX += mouseX - pmouseX;
  panAccY += mouseY - pmouseY;
  while (panAccX >=  cs) { move( 1, 0); panAccX -= cs; panMoved = true; }
  while (panAccX <= -cs) { move(-1, 0); panAccX += cs; panMoved = true; }
  while (panAccY >=  cs) { move( 0, 1); panAccY -= cs; panMoved = true; }
  while (panAccY <= -cs) { move( 0,-1); panAccY += cs; panMoved = true; }
}

// --------------------------------------------------------------
// KEYBOARD
// --------------------------------------------------------------

function keyPressed() {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

  switch (key) {
    case '1': setTool("RECTANGLE");         break;
    case '2': setTool("RECTANGLE_OUTLINE"); break;
    case '3': setTool("DIAMOND");           break;
    case '4': setTool("DIAMOND_OUTLINE");   break;
    case '5': setTool("ELLIPSE_FILLED");    break;
    case '6': setTool("ELLIPSE");           break;
    case '7': setTool("HATCHED");           break;
    case '8': setTool("CROSS");             break;
    case '9': setTool("NOISE");             break;
    case 'e': case 'E': eraserDown = true;  break;
    case 's': case 'S': sKeyDown   = true;  break;
    case 'h': case 'H': hKeyDown   = true;  break;
    case 'x': case 'X': clearGrid(); pushUndo();                     break;
    case 'r': case 'R': grid = createRandomGridArray(); pushUndo();  break;
    case 'q': case 'Q': randomiseLiveCells(); pushUndo();            break;
    case '.': scaleGrid(1); break;
    case 'f': case 'F': addFrame(); break;
    case 'o': case 'O':
      showOnionSkin = !showOnionSkin;
      document.getElementById('onion-btn').classList.toggle('active', showOnionSkin);
      break;
    case 'g': case 'G':
      showGuides = !showGuides;
      document.getElementById('guides-btn').classList.toggle('active', showGuides);
      break;
  }
  if (keyCode === 16) shiftDown = true;
  if (keyCode === 27) { clearSelection(); selectionMode = false; }
}

function keyReleased() {
  if (key === 'e' || key === 'E') eraserDown = false;
  if (key === 's' || key === 'S') sKeyDown = false;
  if (keyCode === 16) shiftDown = false;
  if (key === 'h' || key === 'H') {
    hKeyDown = false;
    panAccX = panAccY = 0;
    if (panMoved) { pushUndo(); panMoved = false; }
  }
}
