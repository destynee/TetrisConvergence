// Base methods.
function get(id) { return document.getElementById(id); }
function hide(id) { get(id).style.visibility = 'hidden'; }
function show(id) { get(id).style.visibility = null; }
function html(id, html) { get(id).innerHTML = html; }

function timestamp() { return new Date().getTime(); }
function random(min, max) { return (min + (Math.random() * (max - min))); }
function randomChoice(choices) { return choices[Math.round(random(0, choices.length - 1))]; }

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback, element) {
      window.setTimeout(callback, 40); // 24 fps
    }
}

// Constants.
const KEY_CODES = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
const DIRECTIONS = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3 };

const gameCanvas = get('canvas');
const gameContext = gameCanvas.getContext('2d');
const upcomingPieceCanvas = get('upcoming');
const upcomingPieceContext = upcomingPieceCanvas.getContext('2d');

// Seconds before piece drops by 1 row.
const gameSpeed = { start: 0.6, decrement: 0.005, min: 0.1 };
// Width (in blocks) of Tetris grid.
const boardWidth = 10;
// Height (in blocks) of Tetris grid.
const boardHeight = 20;
// Width/height (in blocks) of upcoming piece preview.
const upcomingPreviewSize = 5;

// Variables. Initialized at runtime.
var dx, dy,       // Size of a single Tetris block.
  blocks,        // 2D array (boardWidth*boardHeight) representing the grid.
  actions,       // Queue of user inputs.
  playing,       // true|false - Whether game is in progress.
  dt,            // Time since game initiation.
  current,       // Current instance piece.
  next,          // Next instance piece.
  score,         // Current instance score.
  vscore,        // Current instance score displayed.
  rows,          // Number of rows cleared in current instance.
  step;          // Seconds before current piece drops by 1 row.

// Game pieces.
var invisibleRight = "#ff0000";
var invisibleLeft = "#FF0000";

function hexFromRGB(r, g, b) {
  var hex = [
    r.toString(16),
    g.toString(16),
    b.toString(16)
  ];
  $.each(hex, function (nr, val) {
    if (val.length === 1) {
      hex[nr] = "0" + val;
    }
  });
  return hex.join("").toUpperCase();
}

function refreshSwatch() {
  var red = $("#red").slider("value"),
    green = $("#green").slider("value"),
    blue = $("#blue").slider("value"),
    hex = hexFromRGB(red, green, blue);
  $("#canvas").css("background-color", "#" + hex);
}

$(function () {
  $("#red, #green, #blue").slider({
    orientation: "horizontal",
    range: "min",
    max: 255,
    value: 127,
    slide: refreshSwatch,
    change: refreshSwatch
  });
  $("#red").slider("value", 255);
  $("#green").slider("value", 140);
  $("#blue").slider("value", 60);
});

// Assign Tetris shapes to variable names that represent their shape.
var i = { id: 'i', size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: invisibleLeft, color2: invisibleRight };
var j = { id: 'j', size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: invisibleLeft, color2: invisibleRight };
var l = { id: 'l', size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: invisibleLeft, color2: invisibleRight };
var o = { id: 'o', size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: invisibleLeft, color2: invisibleRight };
var s = { id: 's', size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: invisibleLeft, color2: invisibleRight };
var t = { id: 't', size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: invisibleLeft, color2: invisibleRight };
var z = { id: 'z', size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: invisibleLeft, color2: invisibleRight };

// Piece manipulation.
function eachblock(type, x, y, dir, fn) {
  var bit, result, row = 0, col = 0, blocks = type.blocks[dir];
  for (bit = 0x8000; bit > 0; bit = bit >> 1) {
    if (blocks & bit) {
      fn(x + col, y + row);
    }
    if (++col === 4) {
      col = 0;
      ++row;
    }
  }
}

function occupied(type, x, y, dir) {
  var result = false
  eachblock(type, x, y, dir, function (x, y) 
  {
    if ((x < 0) || (x >= boardWidth) 
        || (y < 0) || (y >= boardHeight) 
      || getBlock(x, y))
      result = true;
  }
);
  return result;
}

function unoccupied(type, x, y, dir) {return !occupied(type, x, y, dir);}

// Random Piece Generator (RPG).
var pieces = [];
function randomPiece() {
  if (pieces.length == 0)
    pieces = [i, i, i, i, j, j, j, j, l, l, l, l, o, o, o, o, s, s, s, s, t, t, t, t, z, z, z, z];
  var type = pieces.splice(random(0, pieces.length - 1), 1)[0];
  return { type: type, dir: DIRECTIONS.UP, x: Math.round(random(0, boardWidth - type.size)), y: 0 }
}

// Loop the game.
function run() {
  addEvents();
  var last = now = timestamp();
  function frame() {
    now = timestamp();
    update(Math.min(1, (now - last) / 1000.0));
    draw();
    last = now;
    requestAnimationFrame(frame, gameCanvas);
  }
  resize();
  reset();
  frame();
}

function addEvents() {
  document.addEventListener('keydown', keydown, false);
  window.addEventListener('resize', resize, false);
}

function resize(event) {
  gameCanvas.width = gameCanvas.clientWidth;
  gameCanvas.height = gameCanvas.clientHeight;
  upcomingPieceCanvas.width = upcomingPieceCanvas.clientWidth;
  upcomingPieceCanvas.height = upcomingPieceCanvas.clientHeight;
  dx = gameCanvas.width / boardWidth;
  dy = gameCanvas.height / boardHeight;
  invalidate();
  invalidateNext();
}

function keydown(ev) {
  var handled = false;
  if (playing) {
    switch (ev.keyCode) {
      case KEY_CODES.LEFT: actions.push(DIRECTIONS.LEFT); handled = true; break;
      case KEY_CODES.RIGHT: actions.push(DIRECTIONS.RIGHT); handled = true; break;
      case KEY_CODES.UP: actions.push(DIRECTIONS.UP); handled = true; break;
      case KEY_CODES.DOWN: actions.push(DIRECTIONS.DOWN); handled = true; break;
      case KEY_CODES.ESC: lose(); handled = true; break;
    }
  }
  else if (ev.keyCode == KEY_CODES.SPACE) {
    play();
    handled = true;
  }
  if (handled)
    ev.preventDefault();
}

// Game logic.
function play() { hide('start'); reset(); playing = true; }
function lose() { show('start'); setVisualScore(); playing = false; }

function setVisualScore(n) { vscore = n || score; invalidateScore(); }
function setScore(n) { score = n; setVisualScore(n); }
function addScore(n) { score = score + n; }
function clearScore() { setScore(0); }
function clearRows() { setRows(0); }
function setRows(n) 
  { 
    rows = n; step = Math.max(gameSpeed.min, gameSpeed.start - (gameSpeed.decrement * rows)); 
    invalidateRows(); 
  }
function addRows(n) { setRows(rows + n); }
function getBlock(x, y) { return (blocks && blocks[x] ? blocks[x][y] : null); }
function setBlock(x, y, type) {
  blocks[x] = blocks[x] || [];
  blocks[x][y] = type;
  invalidate();
}
function clearBlocks() { blocks = []; invalidate(); }
function clearActions() { actions = []; }
function setCurrentPiece(piece) { current = piece || randomPiece(); invalidate(); }
function setNextPiece(piece) { next = piece || randomPiece(); invalidateNext(); }

function reset() {
  dt = 0;
  clearActions();
  clearBlocks();
  clearRows();
  clearScore();
  setCurrentPiece(next);
  setNextPiece();
}

function update(idt) {
  if (playing) {
    if (vscore < score)
      setVisualScore(vscore + 1);
    handle(actions.shift());
    dt = dt + idt;
    if (dt > step) {
      dt = dt - step;
      drop();
    }
  }
}

function handle(action) {
  switch (action) {
    case DIRECTIONS.LEFT: move(DIRECTIONS.LEFT); break;
    case DIRECTIONS.RIGHT: move(DIRECTIONS.RIGHT); break;
    case DIRECTIONS.UP: rotate(); break;
    case DIRECTIONS.DOWN: drop(); break;
  }
}

function move(dir) {
  var x = current.x, y = current.y;
  switch (dir) {
    case DIRECTIONS.RIGHT: x = x + 1; break;
    case DIRECTIONS.LEFT: x = x - 1; break;
    case DIRECTIONS.DOWN: y = y + 1; break;
  }
  if (unoccupied(current.type, x, y, current.dir)) {
    current.x = x;
    current.y = y;
    invalidate();
    return true;
  }
  else {
    return false;
  }
}

function rotate() {
  var newdir = (current.dir == DIRECTIONS.MAX ? DIRECTIONS.MIN : current.dir + 1);
  if (unoccupied(current.type, current.x, current.y, newdir)) {
    current.dir = newdir;
    invalidate();
  }
}

function drop() {
  if (!move(DIRECTIONS.DOWN)) {
    addScore(10);
    dropPiece();
    removeLines();
    setCurrentPiece(next);
    setNextPiece(randomPiece());
    clearActions();
    if (occupied(current.type, current.x, current.y, current.dir)) {
      lose();
    }
  }
}

function dropPiece() {
  eachblock(current.type, current.x, current.y, current.dir, function (x, y) {
    setBlock(x, y, current.type);
  });
}

function removeLines() {
  var x, y, complete, n = 0;
  for (y = boardHeight; y > 0; --y) {
    complete = true;
    for (x = 0; x < boardWidth; ++x) {
      if (!getBlock(x, y))
        complete = false;
    }
    if (complete) {
      removeLine(y);
      // Check the same line again.
      y = y + 1;
      n++;
    }
  }
  if (n > 0) {
    addRows(n);
    // 1: 100, 2: 200, 3: 400, 4: 800
    addScore(100 * Math.pow(2, n - 1));
  }
}

function removeLine(n) {
  var x, y;
  for (y = n; y >= 0; --y) {
    for (x = 0; x < boardWidth; ++x)
      setBlock(x, y, (y == 0) ? null : getBlock(x, y - 1));
  }
}

// Render the game.
var invalid = {}

function invalidate() { invalid.court = true; }
function invalidateNext() { invalid.next = true; }
function invalidateScore() { invalid.score = true; }
function invalidateRows() { invalid.rows = true; }

function draw() {
  gameContext.save();
  gameContext.lineWidth = 1;
  // Black outlines in game pieces.
  gameContext.translate(0.5, 0.5);
  drawCourt();
  drawNext();
  drawScore();
  drawRows();
  gameContext.restore();
}

function drawCourt() {
  if (invalid.court) {
    gameContext.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    if (playing)
      drawPiece(gameContext, current.type, current.x, current.y, current.dir);
    var x, y, block;
    for (y = 0; y < boardHeight; y++) {
      for (x = 0; x < boardWidth; x++) {
        if (block = getBlock(x, y))
          drawBlock(gameContext, x, y, block.color);
      }
    }
    // Game boundary.
    gameContext.strokeRect(0, 0, boardWidth * dx - 1, boardHeight * dy - 1);
    invalid.court = false;
  }
}

function drawNext() {
  if (invalid.next) {
    var padding = (upcomingPreviewSize - next.type.size) / 2;
    upcomingPieceContext.save();
    upcomingPieceContext.translate(0.5, 0.5);
    upcomingPieceContext.clearRect(0, 0, upcomingPreviewSize * dx, upcomingPreviewSize * dy);
    drawPiece(upcomingPieceContext, next.type, padding, padding, next.dir);
    upcomingPieceContext.strokeStyle = 'black';
    upcomingPieceContext.strokeRect(0, 0, upcomingPreviewSize * dx - 1, upcomingPreviewSize * dy - 1);
    upcomingPieceContext.restore();
    invalid.next = false;
  }
}

function drawScore() {
  if (invalid.score) {
    html('score', ("00000" + Math.floor(vscore)).slice(-5));
    invalid.score = false;
  }
}

function drawRows() {
  if (invalid.rows) {
    html('rows', rows);
    invalid.rows = false;
  }
}

function drawPiece(ctx, type, x, y, dir) {
  eachblock(type, x, y, dir, function (x, y) {
    drawBlock(ctx, x, y, type.color2);
  });
}

function drawBlock(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * dx, y * dy, dx, dy);
  ctx.strokeRect(x * dx, y * dy, dx, dy)
}

// Execute game.
run();