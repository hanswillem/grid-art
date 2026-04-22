// ---- Animation constants ----
const BTN_H    = 45;
const GRID_H   = 1080;
const BTN_PAD  = 10;
const ANIM_FONT = "'Roboto Mono', monospace";

// ---- State ----
let grid, gridSize, gridRows, cs, gridOffX, gridOffY;
let eraserDown, eraserMode, shiftDown, sKeyDown, hKeyDown;
let lineStartI, lineStartJ, lineAxis; // straight-line constraint (Shift)
let panAccX, panAccY, panMoved;
let brush, brushes, ns;
let undoStack, sizes;
let selectionMode;

// Animation
let frames, currentFrame, frameUndoStacks;
let isPlaying, fps, playElapsed;
let showOnionSkin, onionJustToggled;
let showGuides, guidesJustToggled;

// Top bar
let fileInput, opacitySlider;
let refImages, hasImages, imgOpacity;
let hitClearFrame, hitShowGuides, hitUpload;

// Bottom bar hit areas
let hitOnion, hitFPS, hitPlay, hitPlus, hitExport;
let hitFramesBtns, hitFrameDeleteBtns;

// FPS HTML overlay
let fpsOverlay, fpsInput, fpsFocused;

// ---- Setup ----
function setup() {
  sizes    = [8, 16, 32, 64, 128];
  gridSize = sizes[3];
  cs       = 1920 / gridSize;
  gridOffX = 2 * cs;
  gridOffY = BTN_H + floor(cs / 2);

  createCanvas(1920 + gridOffX, gridOffY + GRID_H + floor(cs / 2) + BTN_H);

  document.addEventListener('keydown', e => {
    if (fpsFocused) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); applyUndo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault(); duplicateFrame(currentFrame); return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (!isPlaying) {
        frames[currentFrame] = captureGrid();
        frameUndoStacks[currentFrame] = undoStack;
      }
      isPlaying = !isPlaying;
      playElapsed = 0;
      return;
    }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); switchFrame(currentFrame - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); switchFrame(currentFrame + 1); return; }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (!isPlaying) {
        if (frames.length > 1) deleteFrame(currentFrame);
        else { clearGrid(); pushUndo(); refImages = []; hasImages = false; }
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

  // Animation init
  frames          = [captureGrid()];
  currentFrame    = 0;
  frameUndoStacks = [undoStack];
  isPlaying       = false;
  fps             = 6;
  playElapsed     = 0;
  showOnionSkin   = false;
  onionJustToggled = false;
  showGuides       = false;
  guidesJustToggled = false;
  fpsFocused      = false;

  refImages = []; hasImages = false; imgOpacity = 255;
  hitClearFrame = hitShowGuides = hitUpload = null;
  hitOnion = hitFPS = hitPlay = hitPlus = hitExport = null;
  hitFramesBtns       = [];
  hitFrameDeleteBtns  = [];

  _createFPSOverlay();
  _createTopBarElements();
}

function _createFPSOverlay() {
  fpsOverlay = document.createElement('div');
  fpsOverlay.style.cssText = [
    'display:none',
    'position:absolute',
    'z-index:10',
    'background:#000000',
    'border:1px solid #ffffff',
    'box-sizing:border-box',
    'align-items:center',
    'justify-content:center',
    'gap:0'
  ].join(';');
  document.body.appendChild(fpsOverlay);

  fpsInput = document.createElement('input');
  fpsInput.type = 'text';
  fpsInput.maxLength = 2;
  fpsInput.style.cssText = [
    'background:transparent',
    'color:#ffffff',
    'caret-color:#ffffff',
    "font-family:'Roboto Mono',monospace",
    'font-size:12px',
    'border:none',
    'outline:none',
    'padding:0',
    'margin:0',
    'width:2ch',
    'text-align:right',
    'min-width:0'
  ].join(';');
  fpsOverlay.appendChild(fpsInput);

  let fpsSuffix = document.createElement('span');
  fpsSuffix.textContent = '\u2009FPS';
  fpsSuffix.style.cssText = [
    'color:#ffffff',
    "font-family:'Roboto Mono',monospace",
    'font-size:12px',
    'pointer-events:none',
    'user-select:none',
    'white-space:pre'
  ].join(';');
  fpsOverlay.appendChild(fpsSuffix);

  fpsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); commitFPS(); return; }
    if (!/^[0-9]$/.test(e.key) &&
        !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key) &&
        !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
  });
  fpsInput.addEventListener('blur', commitFPS);
}

// Returns the canvas element's top-left position in viewport/page space.
// Needed because the canvas is CSS-centered, so p5 canvas coords ≠ viewport coords.
function canvasScreenOffset() {
  let el = document.querySelector('canvas');
  let r  = el.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY };
}

function _createTopBarElements() {
  // Hidden file input
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', _onFilesSelected);

  // Inject CSS for the opacity range slider — thin white track, round white thumb
  let sliderStyle = document.createElement('style');
  sliderStyle.textContent = [
    'input[type="range"].opacity-slider {',
    '  -webkit-appearance: none;',
    '  appearance: none;',
    '  background: transparent;',
    '  cursor: pointer;',
    '  outline: none;',
    '  padding: 0;',
    '  margin: 0;',
    '}',
    'input[type="range"].opacity-slider::-webkit-slider-runnable-track {',
    '  height: 1px;',
    '  background: #ffffff;',
    '  border: none;',
    '}',
    'input[type="range"].opacity-slider::-webkit-slider-thumb {',
    '  -webkit-appearance: none;',
    '  width: 10px;',
    '  height: 10px;',
    '  border-radius: 50%;',
    '  background: #ffffff;',
    '  margin-top: -4.5px;',
    '}',
    'input[type="range"].opacity-slider::-moz-range-track {',
    '  height: 1px;',
    '  background: #ffffff;',
    '  border: none;',
    '}',
    'input[type="range"].opacity-slider::-moz-range-thumb {',
    '  width: 10px;',
    '  height: 10px;',
    '  border-radius: 50%;',
    '  background: #ffffff;',
    '  border: none;',
    '}'
  ].join('\n');
  document.head.appendChild(sliderStyle);

  // Opacity slider — shown to the right of Upload IMG when images are loaded
  opacitySlider = document.createElement('input');
  opacitySlider.type = 'range';
  opacitySlider.min = '0';
  opacitySlider.max = '100';
  opacitySlider.value = '100';
  opacitySlider.className = 'opacity-slider';
  opacitySlider.style.cssText = 'display:none;position:absolute;z-index:10;width:100px;';
  document.body.appendChild(opacitySlider);
  opacitySlider.addEventListener('input', () => {
    imgOpacity = map(parseInt(opacitySlider.value), 0, 100, 0, 255);
  });

  // Drag-and-drop
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    let imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length) _loadImageFiles(imageFiles);
  });

  // Paste
  document.addEventListener('paste', e => {
    if (fpsFocused) return;
    let imageFiles = Array.from(e.clipboardData.items)
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean);
    if (imageFiles.length) _loadImageFiles(imageFiles);
  });
}

function _onFilesSelected() {
  let files = fileInput.files;
  if (!files || !files.length) return;
  _loadImageFiles(Array.from(files));
  fileInput.value = '';
}

function _loadImageFiles(fileList) {
  let count = fileList.length, imgs = new Array(count), loaded = 0;
  for (let i = 0; i < count; i++) {
    ((idx) => loadImage(URL.createObjectURL(fileList[idx]), img => {
      imgs[idx] = img;
      if (++loaded === count) {
        refImages = imgs;
        hasImages = true;
        imgOpacity = 255;
        opacitySlider.value = '100';
        // Ensure enough frames exist for each image, then go to frame 0
        let need = min(count, 24);
        while (frames.length < need) addFrame();
        switchFrame(0);
      }
    }))(i);
  }
}

// ---- Top bar ----
function drawTopBar() {
  textFont(ANIM_FONT);
  textSize(12);
  let barY = 0;
  let x    = gridOffX;

  let clearW  = ceil(textWidth('Clear Frame')  + BTN_PAD * 2);
  let guidesW = ceil(textWidth('Show Guides')  + BTN_PAD * 2);
  let uploadW = ceil(max(textWidth('Upload IMG'), textWidth('Remove IMG')) + BTN_PAD * 2);

  let uploadLabel = hasImages ? 'Remove IMG' : 'Upload IMG';

  let btns = [
    { label: 'Clear Frame', x,                      w: clearW,  active: false,      ref: 'clear'  },
    { label: 'Show Guides', x: x + clearW,           w: guidesW, active: showGuides, ref: 'guides' },
    { label: uploadLabel,   x: x + clearW + guidesW, w: uploadW, active: false,      ref: 'upload' },
  ];
  for (let b of btns) { b.y = barY; }

  for (let b of btns) {
    let inB = mouseX >= b.x && mouseX < b.x + b.w && mouseY >= barY && mouseY < barY + BTN_H;
    if (b.ref === 'guides') {
      if (!inB) guidesJustToggled = false;
      b.hov = inB && !guidesJustToggled;
    } else {
      b.hov = inB;
    }
  }

  hitClearFrame = { x: btns[0].x, y: barY, w: btns[0].w, h: BTN_H };
  hitShowGuides = { x: btns[1].x, y: barY, w: btns[1].w, h: BTN_H };
  hitUpload     = { x: btns[2].x, y: barY, w: btns[2].w, h: BTN_H };

  for (let b of btns) {
    textBtn_BW(b.x, b.y, b.w, BTN_H, b.label, b.active, b.hov && !b.active);
  }

  // Opacity area — flush to the right of Upload IMG, only when images are loaded
  if (hasImages) {
    let areaX    = btns[2].x + uploadW;
    let sliderW  = 120;
    let labelTxt = 'Opacity';
    let labelW   = ceil(textWidth(labelTxt));
    let rightPad = BTN_PAD + 8;
    let areaW    = BTN_PAD + labelW + 8 + sliderW + rightPad;

    // Black background
    noStroke(); fill(0);
    rect(areaX, barY, areaW, BTN_H);

    // White outline rect — matches inactive button style
    noFill(); stroke(255); strokeWeight(1);
    rect(areaX + 0.5, barY + 0.5, areaW - 1, BTN_H - 1);
    noStroke();

    // "Opacity" label
    fill(255); noStroke();
    textFont(ANIM_FONT); textSize(12);
    textAlign(LEFT, CENTER);
    text(labelTxt, areaX + BTN_PAD, barY + BTN_H / 2);
    textAlign(LEFT, BASELINE);

    // HTML slider
    let off      = canvasScreenOffset();
    let sliderX  = areaX + BTN_PAD + labelW + 8;
    let thumbR   = 5;
    opacitySlider.style.display = 'block';
    opacitySlider.style.width   = sliderW + 'px';
    opacitySlider.style.left    = (sliderX + off.x) + 'px';
    opacitySlider.style.top     = (barY + BTN_H / 2 - thumbR + off.y) + 'px';
    opacitySlider.style.height  = (thumbR * 2) + 'px';
  } else {
    opacitySlider.style.display = 'none';
  }
}

function commitFPS() {
  let v = parseInt(fpsInput.value);
  if (!isNaN(v) && v >= 1 && v <= 99) fps = v;
  fpsOverlay.style.display = 'none';
  fpsFocused = false;
}

// ---- Main draw ----
function draw() {
  background(0);

  // Advance playback
  if (isPlaying) {
    playElapsed += deltaTime;
    if (playElapsed >= 1000 / fps) {
      currentFrame = (currentFrame + 1) % frames.length;
      undoStack = frameUndoStacks[currentFrame];
      restoreGrid(frames[currentFrame]);
      playElapsed -= 1000 / fps;
    }
  }

  drawGrid();
  if (showGuides) drawGuides();

  if (mouseIsPressed && !hKeyDown && !isPlaying &&
      getToolbarIndex() < 0 && !inBottomBar(mouseX, mouseY) && !inTopBar(mouseX, mouseY)) {
    drawCell();
  }

  drawBrushBar();
  drawTopBar();
  drawBottomBar();

  if (hKeyDown) {
    cursor(mouseIsPressed ? 'grabbing' : 'grab');
  } else if (getToolbarIndex() >= 0) {
    cursor(ARROW);
  } else if (inBottomBar(mouseX, mouseY) || inTopBar(mouseX, mouseY)) {
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
  gridOffY = BTN_H + floor(cs / 2);
  gridRows = floor(GRID_H / cs);
  resizeCanvas(1920 + gridOffX, gridOffY + GRID_H + floor(cs / 2) + BTN_H);
  grid = createGridArray(gridSize, gridRows);
  ns   = createNoise();
  undoStack = [];
  pushUndo();
  // Reset animation to single blank frame
  frames          = [captureGrid()];
  currentFrame    = 0;
  frameUndoStacks = [undoStack];
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
  // Vertical — dot at midY: (midY) mod 9 must = 0; offset set accordingly
  drawingContext.lineDashOffset = (9 - (midY % 9)) % 9;
  line(midX, gridOffY, midX, gridOffY + GRID_H);
  // Horizontal — dot at midX: distance from gridOffX is 960, 960 mod 9 = 6, offset = 3
  drawingContext.lineDashOffset = 3;
  line(gridOffX, midY, width, midY);
  drawingContext.setLineDash([]);
  drawingContext.lineDashOffset = 0;
  noStroke();
}

function drawGrid() {
  // Reference image(s) behind the grid
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

  // Onion skin: ghost previous frame at low opacity
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
  // S held or persistent selection mode — mark hovered cell as selected
  if (sKeyDown || selectionMode) {
    let cell = getCellUnderMouse();
    if (cell && cell.on) cell.selected = true;
    return;
  }

  // Shift held — constrain drawing to a straight horizontal or vertical line
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

  // Normal drawing
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
  // Compute raw grid coords from mouse
  let rawCi = floor((mouseX - gridOffX) / cs);
  let rawCj = floor((mouseY - gridOffY) / cs);
  if (rawCi < 0 || rawCi >= gridSize || rawCj < 0 || rawCj >= gridRows) return;

  // Apply straight-line constraint when Shift is held and axis is locked
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
}

// --------------------------------------------------------------
// BOTTOM BAR
// --------------------------------------------------------------

function inTopBar(mx, my) {
  return my >= 0 && my < BTN_H;
}

function inBottomBar(mx, my) {
  let barY = gridOffY + GRID_H + floor(cs / 2);
  return my >= barY && my < barY + BTN_H;
}

function _hitTest(r, mx, my) {
  return r && mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h;
}

// B&W button: black bg + white inner stroke when off; white bg, no stroke when on.
function drawBtn_BW(x, y, w, h, active, hovered, drawContent) {
  let on = active || hovered;
  noStroke();
  fill(on ? 255 : 0);
  rect(x, y, w, h);
  if (!on) {
    noFill(); stroke(255); strokeWeight(1);
    rect(x + 0.5, y + 0.5, w - 1, h - 1);
    noStroke();
  }
  if (drawContent) drawContent(on);
}

function textBtn_BW(x, y, w, h, label, active, hovered) {
  drawBtn_BW(x, y, w, h, active, hovered, (on) => {
    fill(on ? 0 : 255);
    noStroke();
    textFont(ANIM_FONT);
    textSize(12);
    textAlign(CENTER, CENTER);
    text(label, x + w / 2, y + h / 2);
  });
}

function drawBottomBar() {
  textFont(ANIM_FONT);
  textSize(12);

  let barY = gridOffY + GRID_H + floor(cs / 2);
  let x    = gridOffX;

  // Widths
  let onionW  = ceil(textWidth("Onion Skinning") + BTN_PAD * 2);
  let fpsW    = ceil(textWidth("00 FPS") + BTN_PAD * 2);
  let playW   = BTN_H;
  let frameW  = BTN_H;
  let plusW   = BTN_H;
  let exportW = ceil(textWidth("Export") + BTN_PAD * 2);

  // Build ordered button list
  let btns = [];

  btns.push({ label: "Onion Skinning", x, y: barY, w: onionW, active: showOnionSkin, ref: "onion" });
  x += onionW;

  btns.push({ label: str(fps) + " FPS", x, y: barY, w: fpsW, active: false, ref: "fps" });
  x += fpsW;

  btns.push({ label: "", x, y: barY, w: playW, active: false, ref: "play" });
  x += playW;

  for (let i = 0; i < frames.length; i++) {
    btns.push({ label: str(i + 1), x, y: barY, w: frameW, active: i === currentFrame, ref: "frame_" + i });
    x += frameW;
  }

  btns.push({ label: "+", x, y: barY, w: plusW, active: false, ref: "plus" });
  x += plusW;

  btns.push({ label: "Export", x, y: barY, w: exportW, active: false, ref: "export" });

  // Hover states
  for (let b of btns) {
    let inB = mouseX >= b.x && mouseX < b.x + b.w && mouseY >= barY && mouseY < barY + BTN_H;
    if (b.ref === "onion") {
      if (!inB) onionJustToggled = false;
      b.hov = inB && !onionJustToggled;
    } else {
      b.hov = inB;
    }
  }

  // Update hit areas
  hitOnion = hitFPS = hitPlay = hitPlus = hitExport = null;
  hitFramesBtns      = new Array(frames.length).fill(null);
  hitFrameDeleteBtns = new Array(frames.length).fill(null);

  for (let b of btns) {
    let hr = { x: b.x, y: barY, w: b.w, h: BTN_H };
    if      (b.ref === "onion")  hitOnion  = hr;
    else if (b.ref === "fps") {
      hitFPS = hr;
      if (fpsFocused) {
        let off = canvasScreenOffset();
        fpsOverlay.style.left   = (hitFPS.x + off.x) + "px";
        fpsOverlay.style.top    = (hitFPS.y + off.y) + "px";
        fpsOverlay.style.width  = hitFPS.w + "px";
        fpsOverlay.style.height = hitFPS.h + "px";
      }
    }
    else if (b.ref === "play")   hitPlay   = hr;
    else if (b.ref === "plus")   hitPlus   = hr;
    else if (b.ref === "export") hitExport = hr;
    else if (b.ref.startsWith("frame_")) {
      let fi = parseInt(b.ref.split("_")[1]);
      hitFramesBtns[fi] = hr;
      if (frames.length > 1) {
        hitFrameDeleteBtns[fi] = { x: b.x + b.w - 14, y: barY + 4, w: 12, h: 12 };
      }
    }
  }

  // Draw buttons
  for (let b of btns) {
    if (b.ref === "play") {
      drawBtn_BW(b.x, b.y, b.w, BTN_H, false, b.hov, (on) => {
        fill(on ? 0 : 255);
        noStroke();
        if (isPlaying) {
          rect(b.x + 14, b.y + 12.5, 6, 20);
          rect(b.x + 24, b.y + 12.5, 6, 20);
        } else {
          triangle(b.x + 14, b.y + 12.1, b.x + 14, b.y + 32.9, b.x + 32, b.y + 22.5);
        }
      });
    } else {
      textBtn_BW(b.x, b.y, b.w, BTN_H, b.label, b.active, b.hov && !b.active);
    }
  }

  // Frame delete × — shown when hovering the frame button
  textFont(ANIM_FONT);
  textSize(9);
  textAlign(RIGHT, TOP);
  for (let i = 0; i < frames.length; i++) {
    let fb = hitFramesBtns[i];
    if (!fb) continue;
    let zoneHov = mouseX >= fb.x && mouseX < fb.x + fb.w &&
                  mouseY >= barY && mouseY < barY + BTN_H;
    if (frames.length > 1 && zoneHov) {
      let isOn = (i === currentFrame) || zoneHov;
      fill(isOn ? 0 : 255);
      noStroke();
      text("×", fb.x + fb.w - 4, barY + 4);
    }
  }
  textAlign(LEFT, BASELINE); // reset
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
// MOUSE
// --------------------------------------------------------------

function mousePressed() {
  // Commit any open FPS edit when clicking outside the FPS button
  if (fpsFocused && !_hitTest(hitFPS, mouseX, mouseY)) commitFPS();

  // Top bar
  if (inTopBar(mouseX, mouseY)) {
    if (_hitTest(hitClearFrame, mouseX, mouseY)) {
      clearGrid(); pushUndo(); return;
    }
    if (_hitTest(hitShowGuides, mouseX, mouseY)) {
      if (showGuides) guidesJustToggled = true;
      showGuides = !showGuides; return;
    }
    if (_hitTest(hitUpload, mouseX, mouseY)) {
      if (hasImages) {
        refImages = []; hasImages = false;
      } else {
        fileInput.click();
      }
      return;
    }
    return;
  }

  // Bottom bar
  if (inBottomBar(mouseX, mouseY)) {
    // Frame delete × — check before frame select so small target wins
    for (let i = 0; i < hitFrameDeleteBtns.length; i++) {
      if (_hitTest(hitFrameDeleteBtns[i], mouseX, mouseY)) {
        deleteFrame(i); return;
      }
    }
    if (_hitTest(hitFPS, mouseX, mouseY)) {
      fpsFocused = true;
      fpsInput.value = str(fps);
      let off = canvasScreenOffset();
      fpsOverlay.style.display = "flex";
      fpsOverlay.style.left    = (hitFPS.x + off.x) + "px";
      fpsOverlay.style.top     = (hitFPS.y + off.y) + "px";
      fpsOverlay.style.width   = hitFPS.w + "px";
      fpsOverlay.style.height  = hitFPS.h + "px";
      setTimeout(() => { fpsInput.focus(); fpsInput.select(); }, 0);
      return;
    }
    if (_hitTest(hitOnion, mouseX, mouseY)) {
      if (showOnionSkin) onionJustToggled = true;
      showOnionSkin = !showOnionSkin;
      return;
    }
    if (_hitTest(hitPlay, mouseX, mouseY)) {
      if (!isPlaying) {
        frames[currentFrame]          = captureGrid();
        frameUndoStacks[currentFrame] = undoStack;
      }
      isPlaying    = !isPlaying;
      playElapsed  = 0;
      return;
    }
    if (_hitTest(hitPlus, mouseX, mouseY)) {
      addFrame(); return;
    }
    if (_hitTest(hitExport, mouseX, mouseY)) {
      exportFrames(); return;
    }
    for (let i = 0; i < hitFramesBtns.length; i++) {
      if (_hitTest(hitFramesBtns[i], mouseX, mouseY)) {
        switchFrame(i); return;
      }
    }
    return;
  }

  // Toolbar
  let ti = getToolbarIndex();
  if (ti >= 0) {
    setTool([...brushes, "ERASER", "SELECTION"][ti]);
    return;
  }

  if (!sKeyDown && !selectionMode) clearSelection();

  // Initialise straight-line start cell when Shift is held
  if (shiftDown) {
    let ci = floor((mouseX - gridOffX) / cs);
    let cj = floor(mouseY / cs);
    if (ci >= 0 && ci < gridSize && cj >= 0 && cj < gridRows) {
      lineStartI = ci; lineStartJ = cj; lineAxis = null;
    }
  }
}

function mouseReleased() {
  lineStartI = -1; lineStartJ = -1; lineAxis = null;
  if (hKeyDown) return;
  if (inTopBar(mouseX, mouseY)) return;
  if (inBottomBar(mouseX, mouseY)) return;
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
  if (fpsFocused) return;

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
      if (showOnionSkin) onionJustToggled = true;
      showOnionSkin = !showOnionSkin;
      break;
    case 'g': case 'G': showGuides = !showGuides; break;
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
