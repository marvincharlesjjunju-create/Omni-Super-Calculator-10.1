(function(){
  "use strict";

  // ===== State =====
  const STORE = {
    read(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    },
    write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (_) { return false; }
    },
    readText(key, fallback = '') {
      try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
    },
    writeText(key, value) {
      try { localStorage.setItem(key, String(value)); return true; } catch (_) { return false; }
    }
  };

  let expression = '', currentToken = '0', isEvaluated = false;
  let memory = Number(STORE.readText('calcMemory', '0')) || 0;
  let lastAnswer = Number(STORE.readText('calcLastAnswer', '0')) || 0;
  let isDegree = STORE.readText('calcAngleMode', 'deg') !== 'rad';
  let isSecondFunc = false;
  let lastOperator = null, lastOperand = null, lastFullExpr = '';
  let history = STORE.read('calcHistoryPro', []);
  if (!Array.isArray(history)) history = [];
  let currencyRates = STORE.read('calcCurrencyRates', null);
  let lastRateUpdate = STORE.readText('calcRateUpdate', '');
  let hapticsEnabled = STORE.readText('calcHaptics', 'true') !== 'false';

    // Audio
  let audioCtx;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  function playClick() { if (!audioCtx) return; if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(800, audioCtx.currentTime); g.gain.setValueAtTime(0.05, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05); o.start(); o.stop(audioCtx.currentTime + 0.05); }
  
  function haptic() { if (hapticsEnabled && navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} } }
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); }

  // ===== Safe Math Engine =====
  // A small recursive-descent parser keeps calculator input data-only; user text is never executed as JavaScript.
  function evaluateMath(input, vars = {}) {
    if (typeof input !== 'string' || input.trim() === '' || input.length > 240) return null;
    const normalized = input
      .replace(/sin⁻¹/gi, 'asin').replace(/cos⁻¹/gi, 'acos').replace(/tan⁻¹/gi, 'atan')
      .replace(/log₂/gi, 'log2').replace(/×/g, '*').replace(/[÷]/g, '/')
      .replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt')
      .replace(/x²/g, '^2').replace(/x³/g, '^3').replace(/xʸ/g, '^').replace(/\s+/g, '');
    const tokens = [];
    const tokenPattern = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|mod(?=\d|[()+\-*/^!,%])|[a-zA-Z_][a-zA-Z_0-9]*|[(),+\-*/^!,%]/iy;
    let offset = 0;
    while (offset < normalized.length) {
      tokenPattern.lastIndex = offset;
      const match = tokenPattern.exec(normalized);
      if (!match) return null;
      tokens.push(match[0]);
      offset = tokenPattern.lastIndex;
    }
    if (!tokens.length) return null;

    const variables = Object.assign({ x: 0, ans: lastAnswer }, vars || {});
    let cursor = 0;
    const peek = () => tokens[cursor];
    const take = () => tokens[cursor++];
    const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const factorial = n => {
      if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
      let value = 1;
      for (let i = 2; i <= n; i++) value *= i;
      return value;
    };
    const combination = (n, r, permutation = false) => {
      if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n || n > 170) return NaN;
      let value = 1;
      for (let i = 0; i < r; i++) value *= permutation ? (n - i) : (n - i) / (i + 1);
      return value;
    };
    const applyFunction = (name, args) => {
      const a = args[0];
      const angle = v => isDegree ? v * Math.PI / 180 : v;
      const inverseAngle = v => isDegree ? v * 180 / Math.PI : v;
      const f = {
        sin: () => Math.sin(angle(a)), cos: () => Math.cos(angle(a)), tan: () => Math.tan(angle(a)),
        asin: () => inverseAngle(Math.asin(a)), acos: () => inverseAngle(Math.acos(a)), atan: () => inverseAngle(Math.atan(a)),
        sinh: () => Math.sinh(a), cosh: () => Math.cosh(a), tanh: () => Math.tanh(a),
        log: () => Math.log10(a), log10: () => Math.log10(a), ln: () => Math.log(a), log2: () => Math.log2(a),
        sqrt: () => Math.sqrt(a), cbrt: () => Math.cbrt(a), exp: () => Math.exp(a), abs: () => Math.abs(a),
        floor: () => Math.floor(a), ceil: () => Math.ceil(a), round: () => Math.round(a),
        root: () => a === 0 ? NaN : (args[1] < 0 ? (Number.isInteger(a) && Math.abs(a) % 2 === 1 ? -Math.pow(-args[1], 1 / a) : NaN) : Math.pow(args[1], 1 / a)),
        pow: () => Math.pow(a, args[1]), ncr: () => combination(a, args[1]), npr: () => combination(a, args[1], true),
        min: () => Math.min(...args), max: () => Math.max(...args)
      };
      if (!Object.prototype.hasOwnProperty.call(f, name)) throw new Error('Unknown function');
      if (['pow', 'root', 'ncr', 'npr'].includes(name) && args.length !== 2) throw new Error('Two arguments required');
      if (['min', 'max'].includes(name) && args.length < 1) throw new Error('Argument required');
      if (!['pow', 'root', 'ncr', 'npr', 'min', 'max'].includes(name) && args.length !== 1) throw new Error('One argument required');
      return f[name]();
    };

    function parseExpression() { return parseAddSub(); }
    function parseAddSub() {
      let value = parseMulDiv();
      while (peek() === '+' || peek() === '-') {
        const op = take(), right = parseMulDiv();
        value = op === '+' ? value + right : value - right;
      }
      return value;
    }
    function canStartValue(token) { return token !== undefined && (token === '(' || /^\d/.test(token) || /^\.\d/.test(token) || /^[a-zA-Z_]/.test(token)); }
    function parseMulDiv() {
      let value = parseUnary();
      while (peek() === '*' || peek() === '/' || (typeof peek() === 'string' && peek().toLowerCase() === 'mod') || canStartValue(peek())) {
        let op = peek();
        if (op === '*' || op === '/') take();
        else if (typeof op === 'string' && op.toLowerCase() === 'mod') { take(); op = 'mod'; }
        else op = '*'; // implicit multiplication: 2π, 3(4), 2sin(30)
        const right = parseUnary();
        value = op === '*' ? value * right : op === '/' ? value / right : op === 'mod' ? value % right : value;
      }
      return value;
    }
    function parseUnary() {
      if (peek() === '+') { take(); return parseUnary(); }
      if (peek() === '-') { take(); return -parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      let value = parsePostfix();
      if (peek() === '^') { take(); value = Math.pow(value, parseUnary()); }
      return value;
    }
    function parsePostfix() {
      let value = parsePrimary();
      while (peek() === '!' || peek() === '%') {
        const op = take();
        value = op === '!' ? factorial(value) : value / 100;
      }
      return value;
    }
    function parsePrimary() {
      const token = take();
      if (token === undefined) throw new Error('Missing value');
      if (token === '(') {
        const value = parseExpression();
        if (take() !== ')') throw new Error('Missing closing parenthesis');
        return value;
      }
      if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) return Number(token);
      if (/^[a-zA-Z_]/.test(token)) {
        const name = token.toLowerCase();
        if (peek() === '(' && ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','log','log10','ln','log2','sqrt','cbrt','exp','abs','floor','ceil','round','root','pow','ncr','npr','min','max'].includes(name)) {
          take();
          const args = [];
          if (peek() !== ')') {
            do {
              args.push(parseExpression());
              if (peek() !== ',') break;
              take();
            } while (true);
          }
          if (take() !== ')') throw new Error('Missing function parenthesis');
          return applyFunction(name, args);
        }
        if (name === 'pi') return Math.PI;
        if (name === 'e') return Math.E;
        if (Object.prototype.hasOwnProperty.call(variables, name)) return Number(variables[name]);
        throw new Error('Unknown variable');
      }
      throw new Error('Unexpected token');
    }

    try {
      const result = parseExpression();
      if (cursor !== tokens.length || !Number.isFinite(result)) return null;
      return Number(result.toPrecision(12));
    } catch (_) { return null; }
  }

  function closeOpenParentheses(source) {
    let balance = 0;
    for (const char of source) {
      if (char === '(') balance++;
      else if (char === ')') balance = Math.max(0, balance - 1);
    }
    return source + ')'.repeat(balance);
  }

    function formatNumber(num) {
    if (typeof num === 'string') return num;
    if (!isFinite(num) || Number.isNaN(num)) return 'Error';
    const abs = Math.abs(num);
    if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) return num.toExponential(6).replace(/\.?0+e/, 'e');
    const rounded = Number(num.toPrecision(12));
    let str = String(rounded);
    const [intPart, decPart] = str.split('.');
    return decPart !== undefined ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + decPart : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ===== Core Logic =====
  function updateDisplay() {
    document.getElementById('result').textContent = currentToken === '' ? '0' : (currentToken.endsWith('.') ? currentToken : formatNumber(Number(currentToken) || 0));
    document.getElementById('expression').textContent = expression;
    
    const preview = evaluateMath(expression + currentToken);
    document.getElementById('preview').textContent = (preview !== null && !isEvaluated && (expression !== '' || currentToken !== '0')) ? '= ' + formatNumber(preview) : '';
    
    document.getElementById('acBtn').textContent = (currentToken !== '0' && currentToken !== '' && !isEvaluated) ? 'C' : 'AC';
    document.getElementById('memBadge').classList.toggle('show', memory !== 0);
    
    const stepsBtn = document.getElementById('stepsBtn');
    stepsBtn.classList.toggle('show', isEvaluated && lastFullExpr !== '');
  }

  function inputDigit(d) {
    if (isEvaluated) { expression = ''; currentToken = d; isEvaluated = false; }
    else if (currentToken === '0') currentToken = d;
    else currentToken += d;
    updateDisplay();
  }

  function inputOperator(op) {
    if (isEvaluated) { expression = currentToken + ' ' + op + ' '; currentToken = ''; isEvaluated = false; }
    else if (currentToken !== '') { expression += currentToken + ' ' + op + ' '; currentToken = ''; }
    else if (expression !== '') expression = expression.replace(/[+\-−×÷^]\s*$/, '') + op + ' ';
    updateDisplay();
  }

  function handleEquals() {
    if (isEvaluated && lastOperator && lastOperand !== null) {
      expression = `${currentToken} ${lastOperator} `;
      currentToken = String(lastOperand);
      isEvaluated = false;
    }
    const rawExpr = (expression + currentToken).trim();
    const fullExpr = closeOpenParentheses(rawExpr);
    const res = evaluateMath(fullExpr);
    if (res !== null) {
      const simple = fullExpr.match(/^\s*(-?(?:\d+\.?\d*|\.\d+))\s*([+\-−×÷^])\s*(-?(?:\d+\.?\d*|\.\d+))\s*$/);
      if (simple) { lastOperator = simple[2]; lastOperand = Number(simple[3]); }
      else { lastOperator = null; lastOperand = null; }
      addHistory(fullExpr, res);
      currentToken = String(res); lastAnswer = res; STORE.writeText('calcLastAnswer', res);
      expression = ''; isEvaluated = true; lastFullExpr = fullExpr;
      updateDisplay();
    } else { toast('Check the expression'); }
  }

    function handleClear() {
    if (currentToken !== '0' && currentToken !== '' && !isEvaluated) currentToken = '0';
    else { expression = ''; currentToken = '0'; isEvaluated = false; lastOperator = null; lastFullExpr = ''; }
    updateDisplay();
  }

  // ===== Dynamic Keypad & Dragging =====
  const defaultKeypad = [
    { c: 'func', a: 'clear', t: 'AC', id: 'acBtn' }, { c: 'func', a: 'sign', t: '+/−' }, { c: 'func', a: 'percent', t: '%' }, { c: 'operator', o: '÷', t: '÷' },
    { n: '7', t: '7' }, { n: '8', t: '8' }, { n: '9', t: '9' }, { c: 'operator', o: '×', t: '×' },
    { n: '4', t: '4' }, { n: '5', t: '5' }, { n: '6', t: '6' }, { c: 'operator', o: '−', t: '−' },
    { n: '1', t: '1' }, { n: '2', t: '2' }, { n: '3', t: '3' }, { c: 'operator', o: '+', t: '+' },
    { c: 'func', a: 'backspace', t: '⌫', id: 'backspaceBtn' }, { n: '0', t: '0' }, { a: 'decimal', t: '.' }, { c: 'operator', a: 'equals', t: '=' }
  ];

  // Restore only a complete permutation of the supported keys. This avoids a
  // stale/corrupt localStorage value leaving missing or non-functional buttons.
  const keypadSignature = key => key?.id ? `id:${key.id}`
    : key?.n !== undefined ? `number:${key.n}`
    : key?.o !== undefined ? `operator:${key.o}`
    : key?.a ? `action:${key.a}` : '';
  const defaultKeyBySignature = new Map(defaultKeypad.map(key => [keypadSignature(key), key]));
  const savedKeypad = STORE.read('calcKeypad', null);
  const savedSignatures = Array.isArray(savedKeypad) ? savedKeypad.map(keypadSignature) : [];
  const validSavedKeypad = savedSignatures.length === defaultKeypad.length
    && savedSignatures.every(signature => defaultKeyBySignature.has(signature))
    && new Set(savedSignatures).size === defaultKeypad.length;
  let keypadLayout = validSavedKeypad
    ? savedSignatures.map(signature => ({ ...defaultKeyBySignature.get(signature) }))
    : defaultKeypad.map(key => ({ ...key }));
  let isDragMode = false, dragSourceIndex = -1, dragPointerId = null;

  function renderKeypad() {
    const grid = document.getElementById('basicGrid');
    grid.innerHTML = '';
    keypadLayout.forEach((b, i) => {
      const btn = document.createElement('button');
      if (b.c) btn.className = b.c;
      if (b.n !== undefined) btn.dataset.num = b.n;
      if (b.o !== undefined) btn.dataset.op = b.o;
      if (b.a) btn.dataset.action = b.a;
      if (b.id) btn.id = b.id;
      btn.textContent = b.id === 'acBtn'
        ? ((currentToken !== '0' && currentToken !== '' && !isEvaluated) ? 'C' : 'AC')
        : b.t;
      btn.dataset.index = String(i);
      btn.dataset.keySignature = keypadSignature(b);
      btn.setAttribute('aria-label', b.t === '⌫' ? 'Backspace' : b.t === '+/−' ? 'Change sign' : b.t);
      if (!isDragMode) {
        btn.addEventListener('click', () => { playClick(); haptic(); handleKeypadPress(b); });
      } else {
        btn.classList.add('reorderable');
        let startX = 0, startY = 0, dragging = false;
        const reorderAt = (x, y) => {
          const candidates = [...grid.querySelectorAll('button:not(.dragging)')];
          if (!candidates.length) return;
          let nearest = null, nearestDistance = Infinity;
          candidates.forEach(candidate => {
            const r = candidate.getBoundingClientRect();
            const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
            const d = dx * dx + dy * dy;
            if (d < nearestDistance) { nearestDistance = d; nearest = candidate; }
          });
          if (!nearest) return;
          const r = nearest.getBoundingClientRect();
          const before = (y < r.top + r.height / 2) || (Math.abs(y - (r.top + r.height / 2)) < r.height * .35 && x < r.left + r.width / 2);
          const oldRects = new Map([...grid.children].map(el => [el, el.getBoundingClientRect()]));
          grid.insertBefore(btn, before ? nearest : nearest.nextSibling);
          [...grid.children].forEach(el => {
            const old = oldRects.get(el); if (!old) return;
            const now = el.getBoundingClientRect();
            const dx = old.left - now.left, dy = old.top - now.top;
            if (dx || dy) {
              el.style.transition = 'none';
              el.style.transform = `translate(${dx}px, ${dy}px)`;
              requestAnimationFrame(() => {
                el.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)';
                el.style.transform = '';
                setTimeout(() => { el.style.transition = ''; }, 200);
              });
            }
          });
        };
        btn.addEventListener('pointerdown', event => {
          if (event.button !== undefined && event.button !== 0) return;
          startX = event.clientX; startY = event.clientY; dragging = true;
          dragSourceIndex = Number(btn.dataset.index); dragPointerId = event.pointerId;
          btn.classList.add('dragging');
          btn.setPointerCapture?.(event.pointerId);
          event.preventDefault();
        });
        btn.addEventListener('pointermove', event => {
          if (!dragging || dragPointerId !== event.pointerId) return;
          if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) reorderAt(event.clientX, event.clientY);
        });
        const finishDrag = event => {
          if (!dragging || dragPointerId !== event.pointerId) return;
          dragging = false;
          btn.classList.remove('dragging');
          grid.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
          keypadLayout = [...grid.children].map(el => defaultKeyBySignature.get(el.dataset.keySignature)).filter(Boolean).map(key => ({ ...key }));
          STORE.write('calcKeypad', keypadLayout);
          grid.querySelectorAll('button').forEach((el, index) => { el.dataset.index = String(index); });
          dragSourceIndex = -1; dragPointerId = null;
          haptic();
        };
        btn.addEventListener('pointerup', finishDrag);
        btn.addEventListener('pointercancel', finishDrag);
      }
      grid.appendChild(btn);
    });
    if (!isDragMode) attachLongPress();
  }

    function handleKeypadPress(b) {
    if (b.n !== undefined) inputDigit(b.n);
    else if (b.o !== undefined) inputOperator(b.o);
    else if (b.a) {
      if (b.a === 'clear') handleClear();
      else if (b.a === 'backspace') { if(currentToken.length>1) currentToken = currentToken.slice(0,-1); else currentToken='0'; updateDisplay(); }
      else if (b.a === 'decimal') { if(!currentToken.includes('.')) currentToken += '.'; updateDisplay(); }
      else if (b.a === 'equals') handleEquals();
      else if (b.a === 'sign') { if(currentToken!=='0') currentToken = currentToken.startsWith('-') ? currentToken.slice(1) : '-'+currentToken; updateDisplay(); }
      else if (b.a === 'percent') { currentToken = String(parseFloat(currentToken)/100); updateDisplay(); }
    }
  }

  function attachLongPress() {
    const button = document.getElementById('backspaceBtn');
    if (!button) return;
    let timer = null, fired = false;
    button.addEventListener('pointerdown', () => {
      fired = false;
      timer = setTimeout(() => { fired = true; handleClear(); toast('Cleared'); }, 700);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => button.addEventListener(type, () => clearTimeout(timer)));
    button.addEventListener('click', event => { if (fired) { event.stopImmediatePropagation(); fired = false; } }, true);
  }

    // ===== Step-by-Step Engine =====
  function showSteps() {
    if (!lastFullExpr) return;
    let steps = `Expression: ${lastFullExpr}\n\n`;
    if (lastFullExpr.includes('(')) steps += `1. Evaluate parentheses ( ... )\n`;
    if (lastFullExpr.match(/[×÷\^]/)) steps += `2. Evaluate exponents, multiplication & division (left to right)\n`;
    steps += `3. Evaluate addition & subtraction (left to right)\n\n`;
    let tempExpr = lastFullExpr;
    const parenMatch = tempExpr.match(/\(([^()]+)\)/);
    if (parenMatch) {
      const parenRes = evaluateMath(parenMatch[1]);
      steps += `Parentheses: ${parenMatch[0]} = ${parenRes}\n`;
      tempExpr = tempExpr.replace(parenMatch[0], parenRes);
    }
    steps += `Result: ${tempExpr} = ${currentToken}`;
    alert(steps);
  }

  // ===== Sci Logic =====
  function toggle2nd() {
    isSecondFunc = !isSecondFunc;
    document.getElementById('btn2nd').classList.toggle('active', isSecondFunc);
    document.querySelectorAll('.scientific-grid [data-alt]').forEach(b => {
      b.textContent = isSecondFunc ? b.dataset.alt : b.dataset.sci;
      if (isSecondFunc) {
        const map = { sin:'asin', cos:'acos', tan:'atan', log:'log2', ln:'exp', sqrt:'cbrt', sqr:'cube' };
        b.dataset.current = map[b.dataset.sci] || b.dataset.sci;
      } else b.dataset.current = b.dataset.sci;
    });
  }

  function handleSci(fn, btn) {
    if (fn === '2nd') return toggle2nd();
    if (fn === 'deg') { isDegree = !isDegree; document.getElementById('degToggle').textContent = isDegree ? 'Deg' : 'Rad'; STORE.writeText('calcAngleMode', isDegree ? 'deg' : 'rad'); return; }
    
    const actual = btn.dataset.current || fn;
    if (actual === 'pi' || actual === 'e') { const value = String(actual === 'pi' ? Math.PI : Math.E); if (currentToken !== '' && currentToken !== '0' && !isEvaluated) expression += currentToken + ' × '; currentToken = value; isEvaluated = false; }
    else if (actual === 'rand') { currentToken = String(Math.random()); isEvaluated=false; }
    else if (['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','log','ln','log2','sqrt','cbrt','exp'].includes(actual)) { if (currentToken !== '') expression += `${actual}(${currentToken})`; else expression += actual + '('; currentToken = ''; isEvaluated = false; }
    else if (actual === 'sqr' || actual === 'cube') { expression += `(${currentToken || '0'})^${actual==='sqr'?'2':'3'}`; currentToken=''; isEvaluated=false; }
    else if (actual === 'fact') { expression += (currentToken || '0') + '!'; currentToken=''; isEvaluated=false; }
    else if (actual === 'root') { const degree = currentToken && currentToken !== '0' ? currentToken : '2'; expression += `root(${degree},`; currentToken=''; isEvaluated=false; }
    else if (actual === '(' || actual === ')') { if (currentToken !== '' && !(actual === '(' && currentToken === '0' && expression === '' && !isEvaluated)) expression += currentToken; expression += actual; currentToken=''; isEvaluated=false; }
    else if (actual === 'pow') inputOperator('^');
    else if (actual === 'nCr' || actual === 'nPr') { expression += actual + '(' + (currentToken !== '' ? currentToken + ',' : ''); currentToken = ''; isEvaluated=false; }
    updateDisplay();
    
    const isLandscape = window.matchMedia('(orientation: landscape)').matches && window.innerHeight < 550;
    if (!isLandscape) setScientificOpen(false);
  }

  // ===== Converters =====
  const unitData = {
    angle: { deg: 1, rad: 57.2958, grad: 0.9 }, area: { m2: 1, km2: 1e6, cm2: 0.0001, ft2: 0.092903, acre: 4046.86, ha: 10000 },
    currency: {}, data: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 },
    energy: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3.6e6 }, force: { N: 1, kN: 1000, lbf: 4.44822, dyn: 1e-5 },
    fuel: { mpg: 1, kml: 1, l100km: 1 }, length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.34 },
    power: { W: 1, kW: 1000, hp: 745.7, MW: 1e6 }, pressure: { Pa: 1, kPa: 1000, bar: 100000, psi: 6894.76, atm: 101325 },
    speed: { kph: 1, mph: 1.60934, mps: 3.6, knot: 1.852 }, temperature: { C: 1, F: 1, K: 1 },
    time: { s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31536000 },
    volume: { l: 1, ml: 0.001, m3: 1000, gal: 3.78541, qt: 0.946353, pt: 0.473176, cup: 0.236588, floz: 0.0295735 },
    weight: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, oz: 0.0283495, lb: 0.453592, st: 6.35029 }
  };
  let currentCategory = 'length';
  const catNames = Object.keys(unitData);

  function initConverter() {
    const catContainer = document.getElementById('convCategories');
    catContainer.innerHTML = catNames.map(c => `<button data-cat="${c}" class="${c===currentCategory?'active':''}">${c.charAt(0).toUpperCase()+c.slice(1)}</button>`).join('');
    catContainer.querySelectorAll('button').forEach(b => b.onclick = () => {
      catContainer.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); currentCategory = b.dataset.cat; populateUnits(); if (currentCategory === 'currency') refreshCurrencyIfStale();
    });
    populateUnits();
    if (currentCategory === 'currency') refreshCurrencyIfStale();
  }

  function populateUnits() {
    const from = document.getElementById('convFromUnit'), to = document.getElementById('convToUnit');
    from.innerHTML = ''; to.innerHTML = '';
    let units = currentCategory === 'currency'
      ? (currencyRates?.rates ? Object.keys(currencyRates.rates).filter(code => /^[A-Z]{3}$/.test(code) && Number.isFinite(currencyRates.rates[code]) && currencyRates.rates[code] > 0).sort() : ['EUR','GBP','KES','UGX','USD'])
      : Object.keys(unitData[currentCategory]);
    from.replaceChildren(); to.replaceChildren();
    units.forEach(code => {
      const fromOption = document.createElement('option'); fromOption.value = code; fromOption.textContent = code.toUpperCase();
      const toOption = document.createElement('option'); toOption.value = code; toOption.textContent = code.toUpperCase();
      from.appendChild(fromOption); to.appendChild(toOption);
    });
    if (units.length > 1) to.selectedIndex = Math.max(0, units.indexOf(currentCategory === 'currency' ? 'UGX' : units[1]));
    if (from.options.length) from.value = units.includes(currentCategory === 'currency' ? 'USD' : units[0]) ? (currentCategory === 'currency' ? 'USD' : units[0]) : units[0];
    convert();
    const refreshButton = document.getElementById('refreshRatesBtn');
    if (refreshButton) refreshButton.style.display = currentCategory === 'currency' ? 'inline-flex' : 'none';
    if (currentCategory === 'currency') {
      const stamp = Date.parse(lastRateUpdate);
      const label = document.getElementById('rateLabel');
      if (label && currencyRates?.rates) label.textContent = stamp ? `Rates timestamp · ${new Date(stamp).toLocaleString()}` : 'Cached rates · update unavailable';
    } else { const label = document.getElementById('rateLabel'); if (label) label.textContent = ''; }
  }

  function convert() {
    const output = document.getElementById('convTo');
    const raw = document.getElementById('convFrom').value;
    const from = document.getElementById('convFromUnit').value;
    const to = document.getElementById('convToUnit').value;
    if (!raw || !from || !to) { output.value = ''; return; }
    const value = evaluateMath(raw);
    if (value === null) { output.value = 'Invalid'; return; }
    let result;
    if (currentCategory === 'temperature') {
      const celsius = from === 'C' ? value : from === 'F' ? (value - 32) * 5 / 9 : value - 273.15;
      result = to === 'C' ? celsius : to === 'F' ? celsius * 9 / 5 + 32 : celsius + 273.15;
    } else if (currentCategory === 'currency') {
      const base = currencyRates?.rates;
      if (!base || !Number.isFinite(base[from]) || !Number.isFinite(base[to]) || base[from] === 0) {
        output.value = 'Rates unavailable'; return;
      }
      result = value / base[from] * base[to];
    } else if (currentCategory === 'fuel') {
      if (value <= 0) { output.value = 'Use a value above zero'; return; }
      const kmPerLitre = from === 'mpg' ? value * 0.425143707 : from === 'kml' ? value : 100 / value;
      result = to === 'mpg' ? kmPerLitre / 0.425143707 : to === 'kml' ? kmPerLitre : 100 / kmPerLitre;
    } else {
      const table = unitData[currentCategory];
      result = value * table[from] / table[to];
    }
    output.value = Number.isFinite(result) ? Number(result.toPrecision(10)).toString() : 'Error';
  }

  let ratesRequestInFlight = false;
  async function fetchRates(force = false) {
    if (ratesRequestInFlight) return;
    const label = document.getElementById('rateLabel');
    const refresh = document.getElementById('refreshRatesBtn');
    ratesRequestInFlight = true;
    if (label) label.textContent = 'Updating exchange rates…';
    if (refresh) refresh.disabled = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Exchange service returned ${response.status}`);
      const data = await response.json();
      if (data.result !== 'success' || !data.rates || !Number.isFinite(data.rates.USD)) throw new Error('Invalid exchange-rate response');
      currencyRates = data;
      lastRateUpdate = new Date().toISOString();
      STORE.write('calcCurrencyRates', currencyRates);
      STORE.writeText('calcRateUpdate', lastRateUpdate);
      if (currentCategory === 'currency') populateUnits();
      if (label) label.textContent = `Rates updated ${new Date(lastRateUpdate).toLocaleString()}`;
    } catch (error) {
      const cached = currencyRates?.rates && Object.keys(currencyRates.rates).length > 0;
      if (label) label.textContent = cached ? `Offline · cached rates from ${lastRateUpdate ? new Date(lastRateUpdate).toLocaleString() : 'an earlier session'}` : 'Could not load rates. Check your connection and try again.';
      if (refresh) refresh.disabled = false;
    } finally {
      clearTimeout(timeout);
      ratesRequestInFlight = false;
      if (refresh) refresh.disabled = false;
    }
  }

  function refreshCurrencyIfStale() {
    const stamp = Date.parse(lastRateUpdate);
    if (!currencyRates?.rates || !stamp || Date.now() - stamp > 12 * 60 * 60 * 1000) fetchRates();
  }

    // ===== Math Notes =====
  let notesData = STORE.read('calcNotes', []);
  if (!Array.isArray(notesData)) notesData = [];
  let isStackedMode = STORE.readText('calcNotesStacked', 'false') === 'true';
  let isDrawMode = false;
  let drawCtx, isDrawing = false;

  function initNotes() {
    document.getElementById('toggleStacked').onclick = () => { isStackedMode = !isStackedMode; STORE.writeText('calcNotesStacked', String(isStackedMode)); document.getElementById('toggleStacked').classList.toggle('active', isStackedMode); renderNotes(); };
    document.getElementById('toggleStacked').classList.toggle('active', isStackedMode);
    document.getElementById('toggleDraw').onclick = () => { isDrawMode = !isDrawMode; document.getElementById('toggleDraw').classList.toggle('active', isDrawMode);
      document.getElementById('notesContent').style.display = isDrawMode ? 'none' : 'flex';
      document.getElementById('drawCanvas').style.display = isDrawMode ? 'block' : 'none';
      document.getElementById('clearDrawingBtn').style.display = isDrawMode ? 'inline-flex' : 'none';
      document.getElementById('addNoteLineBtn').style.display = isDrawMode ? 'none' : 'block';
      if (isDrawMode) requestAnimationFrame(setupCanvas);
    };
    document.getElementById('clearDrawingBtn').onclick = () => { if (!drawCtx) return; const canvas = document.getElementById('drawCanvas'); drawCtx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight); STORE.writeText('calcNoteDrawing', ''); toast('Drawing cleared'); };
    document.getElementById('addNoteLineBtn').onclick = () => { notesData.push({ expr: '', res: '' }); STORE.write('calcNotes', notesData); renderNotes(); };
    renderNotes();
  }

  function renderNotes() {
    const container = document.getElementById('notesContent');
    container.innerHTML = '';
    notesData.forEach((note, index) => {
      const row = document.createElement('div'); row.className = 'note-line';
      const input = document.createElement('input'); input.className = 'note-input'; input.value = note.expr || ''; input.dataset.idx = String(index); input.placeholder = 'Type math or name = expression';
      const result = document.createElement('span'); result.className = 'note-result'; result.textContent = note.res || '';
      row.append(input, result); container.appendChild(row);
      input.addEventListener('input', event => { notesData[Number(event.target.dataset.idx)].expr = event.target.value; evaluateAllNotes(); });
    });
    evaluateAllNotes();
  }

    function evaluateAllNotes() {
    const vars = {};
    notesData.forEach(note => {
      const expr = String(note.expr || '').trim();
      if (!expr) { note.res = ''; return; }
      const environment = isStackedMode ? vars : {};
      const assignment = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (assignment) {
        const value = evaluateMath(assignment[2], environment);
        if (value !== null) { if (isStackedMode) vars[assignment[1].toLowerCase()] = value; note.res = formatNumber(value); }
        else note.res = 'Invalid';
        return;
      }
      const value = evaluateMath(expr, environment);
      note.res = value === null ? '—' : formatNumber(value);
    });
    document.querySelectorAll('.note-input').forEach(input => {
      const index = Number(input.dataset.idx);
      if (input.nextElementSibling) input.nextElementSibling.textContent = notesData[index]?.res || '';
    });
    STORE.write('calcNotes', notesData);
  }

    function setupCanvas() {
    const canvas = document.getElementById('drawCanvas');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    drawCtx = canvas.getContext('2d');
    drawCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff9500';
    drawCtx.lineWidth = 3; drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';

    const savedDrawing = STORE.readText('calcNoteDrawing', '');
    if (savedDrawing) {
      const image = new Image();
      image.onload = () => drawCtx.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = savedDrawing;
    }
    const save = () => {
      try { if (!STORE.writeText('calcNoteDrawing', canvas.toDataURL('image/png'))) toast('Storage is full; drawing was not saved'); }
      catch (_) { toast('Drawing is too large to save'); }
    };
    canvas.onpointerdown = event => {
      if (event.button !== undefined && event.button !== 0) return;
      isDrawing = true; canvas.setPointerCapture?.(event.pointerId);
      drawCtx.beginPath(); drawCtx.moveTo(event.offsetX, event.offsetY);
    };
    canvas.onpointermove = event => {
      if (!isDrawing) return;
      drawCtx.lineTo(event.offsetX, event.offsetY); drawCtx.stroke();
    };
    const finishStroke = () => { if (isDrawing) { isDrawing = false; save(); } };
    canvas.onpointerup = finishStroke;
    canvas.onpointercancel = finishStroke;
    canvas.onpointerleave = event => { if (!canvas.hasPointerCapture?.(event.pointerId)) finishStroke(); };
  }

  // ===== Finance =====
  function initFinance() {
    document.querySelectorAll('#financeDrawer .conv-category button').forEach(b => b.onclick = () => {
      document.querySelectorAll('#financeDrawer .conv-category button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); renderFinanceForm(b.dataset.fin);
    });
    renderFinanceForm('tip');
  }
  function renderFinanceForm(type) {
    const c = document.getElementById('financeContent');
    if (type === 'tip') {
      c.innerHTML = `<div class="form-group"><label>Bill Amount</label><input type="number" id="tipBill" placeholder="0.00" oninput="calcTip()"></div>
        <div class="form-group"><label>Tip %</label><input type="number" id="tipPct" value="15" oninput="calcTip()"></div>
        <div class="form-group"><label>Split by People</label><input type="number" id="tipPpl" value="1" oninput="calcTip()"></div>
        <div class="form-result" id="tipRes">0.00 / person</div>`;
    } else if (type === 'loan') {
      c.innerHTML = `<div class="form-group"><label>Loan Amount</label><input type="number" id="loanAmt" placeholder="0.00" oninput="calcLoan()"></div>
        <div class="form-group"><label>Interest Rate (%)</label><input type="number" id="loanInt" placeholder="5.0" oninput="calcLoan()"></div>
        <div class="form-group"><label>Term (Years)</label><input type="number" id="loanYrs" placeholder="30" oninput="calcLoan()"></div>
        <div class="form-result" id="loanRes">0.00 / month</div>`;
    } else {
      c.innerHTML = `<div class="form-group"><label>Principal</label><input type="number" id="ciP" placeholder="0.00" oninput="calcCI()"></div>
        <div class="form-group"><label>Annual Rate (%)</label><input type="number" id="ciR" placeholder="5.0" oninput="calcCI()"></div>
        <div class="form-group"><label>Years</label><input type="number" id="ciY" placeholder="10" oninput="calcCI()"></div>
        <div class="form-group"><label>Compounding frequency</label><select id="ciN" onchange="calcCI()"><option value="1">Annually</option><option value="2">Semi-annually</option><option value="4">Quarterly</option><option value="12" selected>Monthly</option><option value="365">Daily</option></select></div>
        <div class="form-result" id="ciRes">0.00</div>`;
    }
  }
  window.calcTip = () => { const b = Math.max(0, Number(document.getElementById('tipBill').value)||0), p = Math.max(0, Number(document.getElementById('tipPct').value)||0), n = Math.max(1, Math.floor(Number(document.getElementById('tipPpl').value)||1)); document.getElementById('tipRes').textContent = ((b + b*p/100)/n).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) + ' / person'; };
  window.calcLoan = () => { const P = Math.max(0, Number(document.getElementById('loanAmt').value)||0), r = Math.max(0, Number(document.getElementById('loanInt').value)||0)/1200, years = Math.max(0, Number(document.getElementById('loanYrs').value)||0), n = years*12; if(n===0) { document.getElementById('loanRes').textContent = 'Enter a term'; return; } const m = r===0 ? P/n : P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1); document.getElementById('loanRes').textContent = (Number.isFinite(m)?m.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}):'—') + ' / month'; };
  window.calcCI = () => { const P = Math.max(0, Number(document.getElementById('ciP').value)||0), r = (Number(document.getElementById('ciR').value)||0)/100, t = Math.max(0, Number(document.getElementById('ciY').value)||0), n = Math.max(1, Number(document.getElementById('ciN')?.value)||1); const result = P*Math.pow(1+r/n,n*t); document.getElementById('ciRes').textContent = Number.isFinite(result) ? result.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'; };

  // ===== Statistics =====
  function initStats() {
    const input = document.getElementById('statsData');
    input.oninput = () => {
      const raw = input.value.trim();
      const data = raw ? raw.split(/[\s,;]+/).map(Number).filter(Number.isFinite) : [];
      const out = document.getElementById('statsOutput');
      if (!data.length) { out.innerHTML = ''; return; }
      const sorted = [...data].sort((a, b) => a - b);
      const n = sorted.length, sum = sorted.reduce((a, b) => a + b, 0), mean = sum / n;
      const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / n;
      const frequencies = new Map(); sorted.forEach(value => frequencies.set(value, (frequencies.get(value) || 0) + 1));
      const maxFrequency = Math.max(...frequencies.values());
      const modes = maxFrequency > 1 ? [...frequencies].filter(([, count]) => count === maxFrequency).map(([value]) => value).join(', ') : 'None';
      const q = percentile => { const pos = (n - 1) * percentile, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); };
      const values = [
        ['Count', n], ['Sum', formatNumber(sum)], ['Mean', formatNumber(mean)], ['Median', formatNumber(median)],
        ['Mode', modes], ['Min', formatNumber(sorted[0])], ['Max', formatNumber(sorted[n - 1])],
        ['Range', formatNumber(sorted[n - 1] - sorted[0])], ['Std. deviation', formatNumber(Math.sqrt(variance))],
        ['Variance', formatNumber(variance)], ['Q1', formatNumber(q(.25))], ['Q3', formatNumber(q(.75))]
      ];
      out.innerHTML = values.map(([label, value]) => `<div class="stat-box"><div class="lbl">${label}</div><div class="val">${value}</div></div>`).join('');
    };
    input.dispatchEvent(new Event('input'));
  }



    // ===== Graphing Engine =====
  let graphCtx, graphCanvas, graphOffset = { x: 0, y: 0 }, graphScale = 40, graphResizeObserver = null;
  function resizeGraphCanvas() {
    if (!graphCanvas || !graphCtx) return;
    const rect = graphCanvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    graphCanvas.width = Math.max(1, Math.round(rect.width * ratio));
    graphCanvas.height = Math.max(1, Math.round(rect.height * ratio));
    graphCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawGraph();
  }
  function initGraph() {
    graphCanvas = document.getElementById('graphCanvas');
    graphCtx = graphCanvas.getContext('2d');
    resizeGraphCanvas();
    if (graphResizeObserver) graphResizeObserver.disconnect();
    if ('ResizeObserver' in window) { graphResizeObserver = new ResizeObserver(resizeGraphCanvas); graphResizeObserver.observe(graphCanvas); }

    // One pointer pans; two pointers pinch-zoom around their midpoint.
    const pointers = new Map();
    let lastPanPoint = null, pinchBaseline = null;
    const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const beginPinch = () => {
      const pair = [...pointers.values()].slice(0, 2);
      if (pair.length < 2) return;
      const rect = graphCanvas.getBoundingClientRect();
      const center = midpoint(pair[0], pair[1]);
      const centerX = center.x - rect.left, centerY = center.y - rect.top;
      const originX = rect.width / 2 + graphOffset.x, originY = rect.height / 2 + graphOffset.y;
      pinchBaseline = {
        distance: Math.max(1, distanceBetween(pair[0], pair[1])),
        scale: graphScale,
        worldX: (centerX - originX) / graphScale,
        worldY: (originY - centerY) / graphScale
      };
      lastPanPoint = null;
    };
    graphCanvas.onpointerdown = event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      graphCanvas.setPointerCapture?.(event.pointerId);
      if (pointers.size === 1) lastPanPoint = { x: event.clientX, y: event.clientY };
      else if (pointers.size === 2) beginPinch();
    };
    graphCanvas.onpointermove = event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2 && pinchBaseline) {
        const pair = [...pointers.values()].slice(0, 2);
        const rect = graphCanvas.getBoundingClientRect();
        const center = midpoint(pair[0], pair[1]);
        graphScale = Math.max(8, Math.min(160, pinchBaseline.scale * distanceBetween(pair[0], pair[1]) / pinchBaseline.distance));
        const centerX = center.x - rect.left, centerY = center.y - rect.top;
        graphOffset.x = centerX - rect.width / 2 - pinchBaseline.worldX * graphScale;
        graphOffset.y = centerY - rect.height / 2 + pinchBaseline.worldY * graphScale;
        drawGraph();
      } else if (pointers.size === 1 && lastPanPoint) {
        graphOffset.x += event.clientX - lastPanPoint.x;
        graphOffset.y += event.clientY - lastPanPoint.y;
        lastPanPoint = { x: event.clientX, y: event.clientY };
        drawGraph();
      }
    };
    const finishPointer = event => {
      pointers.delete(event.pointerId);
      pinchBaseline = null;
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        lastPanPoint = { ...remaining };
      } else lastPanPoint = null;
      if (pointers.size >= 2) beginPinch();
    };
    graphCanvas.onpointerup = finishPointer;
    graphCanvas.onpointercancel = finishPointer;
    graphCanvas.onlostpointercapture = finishPointer;
    graphCanvas.onwheel = event => { event.preventDefault(); graphScale = Math.max(8, Math.min(160, graphScale * (event.deltaY > 0 ? .9 : 1.1))); drawGraph(); };
    document.getElementById('plotBtn').onclick = drawGraph;
    document.getElementById('graphInput').onkeydown = event => { if (event.key === 'Enter') drawGraph(); };
  }
  function drawGraph() {
    if (!graphCtx || !graphCanvas) return;
    const rect = graphCanvas.getBoundingClientRect(), w = rect.width, h = rect.height;
    graphCtx.clearRect(0, 0, w, h);
    const cx = w / 2 + graphOffset.x, cy = h / 2 + graphOffset.y;
    graphCtx.lineWidth = 1; graphCtx.strokeStyle = 'rgba(255,255,255,.09)';
    for (let x = ((cx % graphScale) + graphScale) % graphScale; x < w; x += graphScale) { graphCtx.beginPath(); graphCtx.moveTo(x, 0); graphCtx.lineTo(x, h); graphCtx.stroke(); }
    for (let y = ((cy % graphScale) + graphScale) % graphScale; y < h; y += graphScale) { graphCtx.beginPath(); graphCtx.moveTo(0, y); graphCtx.lineTo(w, y); graphCtx.stroke(); }
    graphCtx.strokeStyle = 'rgba(255,255,255,.5)'; graphCtx.lineWidth = 1.5;
    graphCtx.beginPath(); graphCtx.moveTo(cx, 0); graphCtx.lineTo(cx, h); graphCtx.moveTo(0, cy); graphCtx.lineTo(w, cy); graphCtx.stroke();
    const equation = document.getElementById('graphInput').value.replace(/^\s*y\s*=\s*/i, '').trim();
    if (!equation) return;
    graphCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff9500';
    graphCtx.lineWidth = 2.25; graphCtx.beginPath();
    let active = false;
    for (let px = 0; px <= w; px++) {
      const x = (px - cx) / graphScale;
      const y = evaluateMath(equation, { x });
      const py = y === null ? NaN : cy - y * graphScale;
      if (Number.isFinite(py) && py > -h * 4 && py < h * 5) {
        if (!active) graphCtx.moveTo(px, py); else graphCtx.lineTo(px, py);
        active = true;
      } else active = false;
    }
    graphCtx.stroke();
  }



    // ===== History, Cloud Sync & CSV Export =====
  let longPressTimer, currentHistoryIndex = -1;

  function checkCloudBanner() {
    const banner = document.getElementById('cloudBanner');
    if (STORE.readText('cloudBannerDismissed', 'false') === 'true') banner.classList.add('hidden');
  }

  document.getElementById('dismissBanner').addEventListener('click', () => {
    document.getElementById('cloudBanner').classList.add('hidden');
    STORE.writeText('cloudBannerDismissed', 'true');
  });

  function triggerSignIn() {
    toast('Cloud sync is not configured in this build. Your history stays on this device.');
  }

  document.getElementById('bannerSignInBtn').addEventListener('click', triggerSignIn);
  document.getElementById('cloudSyncBtn').addEventListener('click', () => {
    toggleModal('settingsMenu', false);
    triggerSignIn();
  });

  function addHistory(expr, res) {
    history.unshift({ expr, result: formatNumber(res), ts: Date.now() });
    if (history.length > 1000) history.length = 1000;
    STORE.write('calcHistoryPro', history); 
    renderHistory();
  }

  function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    if (!history.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Your calculations will appear here'; list.appendChild(empty); return; }
    const groups = { Today: [], Yesterday: [], 'Previous 7 Days': [], Older: [] };
    const now = new Date();
    history.forEach((item, index) => {
      const date = new Date(item.ts), diff = Math.floor((now - date) / 86400000);
      const group = diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'Previous 7 Days' : 'Older';
      groups[group].push({ ...item, index });
    });
    Object.entries(groups).forEach(([groupName, items]) => {
      if (!items.length) return;
      const group = document.createElement('section'); group.className = 'history-group';
      const heading = document.createElement('div'); heading.className = 'history-group-title'; heading.textContent = groupName; group.appendChild(heading);
      items.forEach(item => {
        const row = document.createElement('div'); row.className = 'history-item'; row.dataset.idx = String(item.index);
        const content = document.createElement('button'); content.className = 'history-text'; content.type = 'button';
        const expr = document.createElement('div'); expr.className = 'hist-expr'; expr.textContent = item.expr;
        const result = document.createElement('div'); result.className = 'hist-result'; result.textContent = item.result;
        content.append(expr, result); row.appendChild(content); group.appendChild(row);
        let timer = null;
        row.addEventListener('pointerdown', event => {
          if (event.pointerType !== 'touch') return;
          timer = setTimeout(() => showHistoryContext(item.index, event.clientX, event.clientY), 550);
        });
        ['pointerup','pointermove','pointercancel','pointerleave'].forEach(type => row.addEventListener(type, () => clearTimeout(timer)));
        row.addEventListener('contextmenu', event => { event.preventDefault(); showHistoryContext(item.index, event.clientX, event.clientY); });
        content.addEventListener('click', () => {
          currentToken = String(Number(String(item.result).replace(/,/g, '')) || 0); expression = ''; isEvaluated = true;
          toggleModal('historyDrawer', false); updateDisplay();
        });
      });
      list.appendChild(group);
    });
  }

  function showHistoryContext(index, x, y) {
    currentHistoryIndex = index;
    const menu = document.getElementById('historyContextMenu');
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 150))}px`;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 170))}px`;
    menu.classList.add('open');
  }

    // CSV export: use Android's native share sheet in the APK and a browser download on the web.
  document.getElementById('exportCsvBtn').addEventListener('click', async () => {
    if (history.length === 0) return toast('No history to export');
    const quote = value => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [['Date', 'Expression', 'Result'], ...history.map(item => [new Date(item.ts).toLocaleString(), item.expr, item.result])];
    const csvContent = rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
    const nativeFiles = window.OmniNativeFiles;
    const isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    if (isNative && nativeFiles?.Filesystem && nativeFiles?.Share) {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = await nativeFiles.Filesystem.writeFile({
          path: `omni_calculator_history_${stamp}.csv`, data: csvContent,
          directory: nativeFiles.Directory.Cache, encoding: nativeFiles.Encoding.UTF8
        });
        await nativeFiles.Share.share({
          title: 'Omni Calculator history', text: 'CSV backup of calculation history',
          url: file.uri, dialogTitle: 'Export calculation history'
        });
        toast('History ready to share or save');
        return;
      } catch (error) { toast(error?.message || 'Could not export history'); return; }
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const encodedUri = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = encodedUri; link.download = 'omni_calc_history.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(encodedUri), 1000);
    toast('History exported');
  });

  bind(document.getElementById('clearHistoryBtn'), () => {
    if (!history.length) return toast('History is already empty');
    if (!window.confirm('Delete all saved calculations on this device?')) return;
    history = []; currentHistoryIndex = -1;
    STORE.write('calcHistoryPro', history); renderHistory();
    document.getElementById('historyContextMenu').classList.remove('open');
    toast('History cleared');
  });

  // ===== Voice Input & spoken mathematics =====
  const BrowserSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const nativeSpeech = window.OmniNativeSpeech || null;
  let browserRecognition = null;
  let voiceListening = false;
  const voiceBtn = document.getElementById('voiceBtn');

  function numberWordValue(words) {
    const small = { zero:0, oh:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
    const tens = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
    let total = 0, current = 0, decimal = false, decimalDigits = '';
    words.forEach(word => {
      if (word === 'and') return;
      if (word === 'point') { decimal = true; return; }
      if (decimal) { if (Object.prototype.hasOwnProperty.call(small, word) && small[word] < 10) decimalDigits += String(small[word]); else if (/^\d$/.test(word)) decimalDigits += word; else throw new Error('Invalid decimal'); return; }
      if (Object.prototype.hasOwnProperty.call(small, word)) current += small[word];
      else if (Object.prototype.hasOwnProperty.call(tens, word)) current += tens[word];
      else if (word === 'hundred') current = Math.max(1, current) * 100;
      else if (word === 'thousand') { total += Math.max(1, current) * 1000; current = 0; }
      else if (word === 'million') { total += Math.max(1, current) * 1000000; current = 0; }
      else if (/^\d+(?:\.\d+)?$/.test(word)) current += Number(word);
      else throw new Error('Unknown number word');
    });
    const whole = total + current;
    return decimal ? `${whole}.${decimalDigits || '0'}` : String(whole);
  }

  function spokenMathToExpression(transcript) {
    let text = String(transcript || '').toLowerCase().replace(/[’']/g, '').replace(/[?!]/g, ' ').trim();
    text = text.replace(/^(please\s+)?(can you\s+)?(calculate|work out|what is|whats|evaluate)\s+/i, '');
    const spokenEquals = text.match(/\b(?:is equal to|equals?)\b/);
    if (spokenEquals) text = text.slice(0, spokenEquals.index);
    text = text.replace(/\bnegative\b/g, ' - ').replace(/\bpositive\b/g, ' + ');
    text = text.replace(/\bmultiplied by\b|\btimes\b|\binto\b/g, ' * ')
      .replace(/\bdivided by\b|\bover\b/g, ' / ')
      .replace(/\bplus\b|\badded to\b/g, ' + ')
      .replace(/\bminus\b|\bsubtract\b/g, ' - ')
      .replace(/\bto the power of\b|\braised to(?: the power of)?\b|\bpower of\b/g, ' ^ ')
      .replace(/\bopen (?:parenthesis|bracket)\b/g, ' ( ')
      .replace(/\bclose (?:parenthesis|bracket)\b/g, ' ) ')
      .replace(/\bsquare root of\b/g, ' sqrt ')
      .replace(/\bcube root of\b/g, ' cbrt ')
      .replace(/\bsine?(?: of)?\b/g, ' sin ')
      .replace(/\bcos(?:ine)?(?: of)?\b/g, ' cos ')
      .replace(/\btan(?:gent)?(?: of)?\b/g, ' tan ')
      .replace(/\barcsine(?: of)?\b/g, ' asin ')
      .replace(/\barccosine(?: of)?\b/g, ' acos ')
      .replace(/\barctangent(?: of)?\b/g, ' atan ')
      .replace(/\bnatural log(?:arithm)? of\b/g, ' ln ')
      .replace(/\blog(?:arithm)? base ten of\b|\bcommon log(?:arithm)? of\b|\blog(?:arithm)? of\b/g, ' log ')
      .replace(/\bpi\b/g, ' pi ')
      .replace(/\bpercent(?:age)?\s+of\b/g, ' % * ')
      .replace(/\bpercent(?:age)?\b/g, ' % ')
      .replace(/\bfactorial\b/g, ' ! ')
      .replace(/\bsquared\b/g, ' ^ 2 ')
      .replace(/\bcubed\b/g, ' ^ 3 ')
      .replace(/\bmodulo\b|\bmod\b/g, ' mod ')
      .replace(/\bchoose\b/g, ' ncr ');

    const tokens = text.match(/[a-z]+|\d+(?:\.\d+)?|[()+\-*/^!,%]/g) || [];
    const numericWords = new Set(['zero','oh','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','million','point','and']);
    const output = [];
    for (let i = 0; i < tokens.length;) {
      if (numericWords.has(tokens[i])) {
        const phrase = [];
        while (i < tokens.length && numericWords.has(tokens[i])) phrase.push(tokens[i++]);
        output.push(numberWordValue(phrase));
      } else { output.push(tokens[i++]); }
    }
    let result = output.join('');
    result = result.replace(/(sqrt|cbrt|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|log|ln|log2)\s*(\d+(?:\.\d+)?)/g, '$1($2)');
    result = result.replace(/(\d+(?:\.\d+)?)\s*(?:is )?squared/g, '($1)^2');
    result = result.replace(/(\d+(?:\.\d+)?)\s*(?:is )?cubed/g, '($1)^3');
    // Voice phrase "five choose two" means the binomial coefficient C(5,2).
    result = result.replace(/(\d+(?:\.\d+)?)ncr(\d+(?:\.\d+)?)/gi, 'ncr($1,$2)');
    return result;
  }

  function processVoiceResult(transcript) {
    const mathText = spokenMathToExpression(transcript);
    if (!mathText) { toast('I did not hear a calculation. Try “five plus seven”.'); return; }
    const completed = closeOpenParentheses(mathText);
    if (evaluateMath(completed) === null) { toast(`Could not parse: ${transcript}`); return; }
    expression = mathText; currentToken = ''; isEvaluated = false;
    updateDisplay();
    handleEquals();
    toast(`Heard: “${transcript}”`);
  }

  function setVoiceState(listening) {
    voiceListening = listening;
    voiceBtn.classList.toggle('listening', listening);
    voiceBtn.setAttribute('aria-label', listening ? 'Listening for calculation' : 'Voice calculation input');
  }

  async function startVoiceInput() {
    if (voiceListening) return;
    setVoiceState(true);
    let browserOwnsState = false;
    try {
      const isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
      if (isNative && nativeSpeech) {
        const availability = typeof nativeSpeech.available === 'function' ? await nativeSpeech.available() : { available: true };
        if (!availability?.available) throw new Error('Speech recognition is not installed or enabled on this device');
        let permission = await nativeSpeech.checkPermissions();
        if (permission?.speechRecognition !== 'granted') permission = await nativeSpeech.requestPermissions();
        if (permission?.speechRecognition !== 'granted') throw new Error('Microphone permission was not granted');
        const response = await nativeSpeech.start({ language: 'en-US', maxResults: 5, prompt: 'Speak a calculation', partialResults: false, popup: true });
        const heard = response?.matches?.[0];
        if (heard) processVoiceResult(heard); else toast('No speech was recognized');
      } else if (BrowserSpeechRecognition) {
        browserRecognition = new BrowserSpeechRecognition();
        browserRecognition.lang = 'en-US'; browserRecognition.continuous = false; browserRecognition.interimResults = false; browserRecognition.maxAlternatives = 3;
        browserRecognition.onresult = event => { const heard = event.results?.[0]?.[0]?.transcript; if (heard) processVoiceResult(heard); };
        browserRecognition.onerror = event => toast(`Voice input: ${event.error || 'unavailable'}`);
        browserRecognition.onend = () => setVoiceState(false);
        browserRecognition.start();
        browserOwnsState = true;
        return;
      } else {
        toast('Voice input is not available on this device. Use the Android app build for native speech.');
      }
    } catch (error) {
      toast(error?.message || 'Voice input failed. Check microphone permission and try again.');
    } finally { if (!browserOwnsState) setVoiceState(false); }
  }
  voiceBtn.addEventListener('click', startVoiceInput);


    // ===== Modals & Events =====
  const drawerParents = Object.create(null);
  function openDrawerFrom(parentId, childId, onOpen) {
    toggleModal(parentId, false);
    drawerParents[childId] = parentId;
    toggleModal(childId, true);
    if (typeof onOpen === 'function') onOpen();
  }
  function toggleModal(id, state) { const el = document.getElementById(id); if(el) el.classList.toggle('open', state); }
  function setScientificOpen(state) { toggleModal('sciWrapper', state); const backdrop = document.getElementById('sciBackdrop'); if (backdrop) backdrop.classList.toggle('open', state); }

  // Android system-back handling: close the top-most app surface before allowing exit.
  function handleBackNavigation() {
    const contextMenu = document.getElementById('historyContextMenu');
    if (contextMenu?.classList.contains('open')) { contextMenu.classList.remove('open'); return true; }
    const openDrawer = [...document.querySelectorAll('.full-drawer.open')].pop();
    if (openDrawer) {
      const parentId = drawerParents[openDrawer.id];
      openDrawer.classList.remove('open');
      if (parentId) { delete drawerParents[openDrawer.id]; toggleModal(parentId, true); }
      return true;
    }
    const settings = document.getElementById('settingsMenu');
    if (settings?.classList.contains('open')) { toggleModal('settingsMenu', false); return true; }
    if (document.getElementById('sciWrapper')?.classList.contains('open')) { setScientificOpen(false); return true; }
    if (isDragMode) {
      isDragMode = false;
      document.getElementById('app').classList.remove('drag-mode');
      renderKeypad();
      toast('Keypad layout saved');
      return true;
    }
    return false;
  }

  const nativeApp = window.OmniNativeApp;
  if (nativeApp?.addListener) {
    nativeApp.addListener('backButton', async () => {
      if (!handleBackNavigation() && nativeApp.exitApp) await nativeApp.exitApp();
    }).catch(() => {});
  }

  function bind(el, fn) { if(el) el.addEventListener('click', (e) => { playClick(); haptic(); fn(e); }); }

  // Top controls
  bind(document.getElementById('historyBtn'), () => { checkCloudBanner(); renderHistory(); toggleModal('historyDrawer', true); });
  bind(document.getElementById('closeHistory'), () => toggleModal('historyDrawer', false));
  bind(document.getElementById('convertBtn'), () => { initConverter(); toggleModal('converterDrawer', true); if (currentCategory === 'currency') refreshCurrencyIfStale(); });
  bind(document.getElementById('closeConverter'), () => toggleModal('converterDrawer', false));
  bind(document.getElementById('toolsBtn'), () => toggleModal('toolsDrawer', true));
  bind(document.getElementById('closeTools'), () => toggleModal('toolsDrawer', false));
  bind(document.getElementById('sciToggleBtn'), () => setScientificOpen(!document.getElementById('sciWrapper').classList.contains('open')));
  bind(document.getElementById('closeSciBtn'), () => setScientificOpen(false));
  bind(document.getElementById('sciBackdrop'), () => setScientificOpen(false));

  // Tool cards
  bind(document.getElementById('openGraphBtn'), () => openDrawerFrom('toolsDrawer', 'graphDrawer', () => setTimeout(initGraph, 100)));
  bind(document.getElementById('openNotesBtn'), () => openDrawerFrom('toolsDrawer', 'notesDrawer', () => setTimeout(initNotes, 100)));
  bind(document.getElementById('openFinanceBtn'), () => openDrawerFrom('toolsDrawer', 'financeDrawer', initFinance));
  bind(document.getElementById('openStatsBtn'), () => openDrawerFrom('toolsDrawer', 'statsDrawer', initStats));
  bind(document.getElementById('openOmniAiBtn'), () => {
    openDrawerFrom('toolsDrawer', 'omniAiDrawer', renderOmniAiHistory);
    if (!STORE.read('omniAiChat', []).length) omniAiMessage('assistant', 'Hello. I am Omni Intelligence. I can calculate, compare, convert, analyse loans, build budgets and explain the mathematics behind an answer. Try asking me in your own words.');
    setTimeout(() => document.getElementById('omniAiInput')?.focus(), 120);
  });
  bind(document.getElementById('closeOmniAi'), () => handleBackNavigation());

  
  bind(document.getElementById('closeGraph'), () => handleBackNavigation());
  bind(document.getElementById('closeNotes'), () => handleBackNavigation());
  bind(document.getElementById('closeFinance'), () => handleBackNavigation());
  bind(document.getElementById('closeStats'), () => handleBackNavigation());

  // ===== Omni Intelligence: privacy-first local tool-using reasoning assistant =====
  const omniAiChatEl = document.getElementById('omniAiChat');
  const omniAiInputEl = document.getElementById('omniAiInput');
  function omniAiHistory() { const items = STORE.read('omniAiChat', []); return Array.isArray(items) ? items.slice(-80) : []; }
  function omniAiMessage(role, content, meta='') {
    const items = omniAiHistory(); items.push({ role, content: String(content), meta, at: Date.now() });
    STORE.write('omniAiChat', items.slice(-80)); renderOmniAiHistory();
  }
  function renderOmniAiHistory() {
    if (!omniAiChatEl) return;
    omniAiChatEl.replaceChildren();
    omniAiHistory().forEach(item => {
      const bubble = document.createElement('div'); bubble.className = `ai-msg ${item.role === 'user' ? 'user' : 'assistant'}`;
      bubble.append(document.createTextNode(item.content));
      if (item.meta) { const meta = document.createElement('span'); meta.className='ai-meta'; meta.textContent=item.meta; bubble.append(meta); }
      omniAiChatEl.append(bubble);
    });
    omniAiChatEl.scrollTop = omniAiChatEl.scrollHeight;
  }
  function omniFormat(n) { return Number(n).toLocaleString(undefined,{maximumFractionDigits:8}); }
  function omniMathText(text) {
    let q = text.toLowerCase().replace(/,/g,'').replace(/\b(what is|what's|calculate|compute|work out|evaluate|please|can you|tell me)\b/g,' ').trim();
    q = q.replace(/(\d+(?:\.\d+)?)\s*percent\s+of\s+(\d+(?:\.\d+)?)/g,'($1/100)*$2')
      .replace(/(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)/g,'($1/100)*$2')
      .replace(/\bplus\b/g,'+').replace(/\bminus\b/g,'-').replace(/\btimes\b|multiplied by/g,'*')
      .replace(/\bdivided by\b|\bover\b/g,'/').replace(/\bto the power of\b/g,'^')
      .replace(/\bsquared\b/g,'^2').replace(/\bcubed\b/g,'^3').replace(/\bpercent\b/g,'%');
    q=q.replace(/(\d+(?:\.\d+)?)\s*%/g,'($1/100)');
    q=q.replace(/[^0-9a-z_π().,+\-*/^!%\s]/gi,' ').trim();
    return q;
  }
  function omniConvert(q) {
    const m=q.match(/convert\s+([\d.]+)\s*(km|kilometres?|kilometers?|m|metres?|meters?|cm|centimetres?|mm|miles?|mi|kg|kilograms?|g|grams?|lb|pounds?|c|°c|fahrenheit|°f)\s+to\s+(km|kilometres?|kilometers?|m|metres?|meters?|cm|centimetres?|mm|miles?|mi|kg|kilograms?|g|grams?|lb|pounds?|c|°c|fahrenheit|°f)/i);
    if(!m) return null;
    const unit=x=>{x=x.toLowerCase(); if(['km','kilometre','kilometres','kilometer','kilometers'].includes(x))return ['length',1000,'km']; if(['m','metre','metres','meter','meters'].includes(x))return ['length',1,'m']; if(['cm','centimetre','centimetres'].includes(x))return ['length',.01,'cm']; if(['mm'].includes(x))return ['length',.001,'mm']; if(['mile','miles','mi'].includes(x))return ['length',1609.344,'mi']; if(['kg','kilogram','kilograms'].includes(x))return ['mass',1,'kg']; if(['g','gram','grams'].includes(x))return ['mass',.001,'g']; if(['lb','pound','pounds'].includes(x))return ['mass',.45359237,'lb']; if(['c','°c'].includes(x))return ['temp',1,'°C']; if(['fahrenheit','°f'].includes(x))return ['temp',1,'°F']; return null;};
    const a=unit(m[2]),b=unit(m[3]); if(!a||!b||a[0]!==b[0]) return 'Those units are not in the same conversion family yet.';
    let v=Number(m[1]); if(a[0]==='temp'){v=a[2]==='°C'?v:(v-32)*5/9; v=b[2]==='°C'?v:v*9/5+32;} else v=v*a[1]/b[1];
    return `${omniFormat(Number(m[1]))} ${a[2]} = ${omniFormat(v)} ${b[2]}\nMethod: convert through the standard base unit (${a[0]==='length'?'metres':a[0]==='mass'?'kilograms':'Celsius'}).`;
  }
  function omniLoan(q) {
    const m=q.replace(/,/g,'').match(/(?:loan|borrow|borrowed|mortgage)?\s*(?:of\s*)?([\d.]+)\s*(?:ugx|shillings?)?\s*(?:at|with|interest(?: rate)? of)\s*([\d.]+)\s*%\s*(?:annual(?:\s+interest)?|interest(?:\s+rate)?|per year|yearly)?\s*(?:for|over|in)\s*(\d+(?:\.\d+)?)\s*(months?|years?)/i);
    if(!m) return null;
    const principal=+m[1], annual=+m[2]/100, months=+m[3]*(m[4].toLowerCase().startsWith('year')?12:1), r=annual/12;
    if(!(principal>0&&annual>=0&&months>0&&months<=1200)) return 'Please provide a positive loan amount, interest rate and term (up to 100 years).';
    const payment=r===0?principal/months:principal*r/(1-Math.pow(1+r,-months));
    const total=payment*months, interest=total-principal;
    return `LOAN ANALYSIS\nPrincipal: ${omniFormat(principal)}\nMonthly payment: ${omniFormat(payment)}\nTotal repayment: ${omniFormat(total)}\nTotal interest: ${omniFormat(interest)}\nTerm: ${omniFormat(months)} months\n\nMethod: standard reducing-balance amortisation, monthly rate = annual rate ÷ 12. Fees, insurance and lender-specific charges are not included.`;
  }
  function omniBudget(q) {
    const m=q.replace(/,/g,'').match(/(?:budget|split|allocate)\D{0,30}([\d.]+)/i); if(!m)return null;
    const amount=+m[1]; if(!(amount>0))return 'Enter a budget greater than zero.';
    const needs=amount*.5,wants=amount*.3,savings=amount*.2;
    return `SMART 50 / 30 / 20 BUDGET\nNeeds (50%): ${omniFormat(needs)}\nWants (30%): ${omniFormat(wants)}\nSavings/debt (20%): ${omniFormat(savings)}\n\nThis is a starting framework, not financial advice. Adjust the split to match your essential costs and goals.`;
  }
  function omniExplain(q) {
    if(/compound interest/.test(q)) return 'Compound interest means earning interest on both your original principal and previously accumulated interest. Formula: A = P(1 + r/n)^(nt), where P is principal, r is annual rate as a decimal, n is compounding periods per year and t is years. Example: 100,000 at 10% compounded annually for 2 years becomes 121,000.';
    if(/percent(age)?/.test(q)) return 'A percentage is a number out of 100. To find p% of an amount A, calculate (p ÷ 100) × A. Example: 18% of 250,000 = 0.18 × 250,000 = 45,000.';
    if(/mean|average/.test(q)) return 'The arithmetic mean is the sum of all values divided by the number of values. Example: (4 + 6 + 8) ÷ 3 = 6. The median is the middle value after sorting; it is less affected by extreme values.';
    if(/how.*work|what can you do|capabilit|help/.test(q)) return 'I can route requests to local tools for arithmetic, scientific expressions, percentages, loans, budgets, supported unit conversions and learning explanations. I work offline for these tasks. I am not connected to a generative cloud model in this build, so I will tell you when a request needs capabilities I do not have.';
    return null;
  }
  function omniSolveEquation(q) {
    if (!/\bsolve\b/i.test(q) || !q.includes('=')) return null;
    const equation=q.replace(/^.*?\bsolve\b/i,'').replace(/\s+/g,'').replace(/²/g,'^2');
    const sides=equation.split('='); if(sides.length!==2) return null;
    const polynomial=side=>{
      const terms=side.match(/[+-]?[^+-]+/g); if(!terms) return null;
      const c=[0,0,0];
      for(let term of terms){
        let sign=1; if(term[0]==='+')term=term.slice(1); else if(term[0]==='-'){sign=-1;term=term.slice(1);}
        if(!term) return null;
        if(term.includes('x^2')){const n=term.replace('x^2','').replace('*',''); c[2]+=sign*(n===''?1:Number(n));}
        else if(term.includes('x')){const n=term.replace('x','').replace('*',''); c[1]+=sign*(n===''?1:Number(n));}
        else c[0]+=sign*Number(term);
      }
      return c.every(Number.isFinite)?c:null;
    };
    const a=polynomial(sides[0]),b=polynomial(sides[1]); if(!a||!b)return null;
    const c=a.map((v,i)=>v-b[i]);
    if(Math.abs(c[2])<1e-12){if(Math.abs(c[1])<1e-12)return {text:Math.abs(c[0])<1e-12?'Every real number is a solution.':'No solution exists.',tool:'Equation solver'}; return {text:`x = ${omniFormat(-c[0]/c[1])}\n\nMethod: isolate x in the linear equation.`,tool:'Linear equation solver'};}
    const d=c[1]*c[1]-4*c[2]*c[0]; if(d<0)return {text:`No real roots. Discriminant = ${omniFormat(d)}.`,tool:'Quadratic equation solver'};
    const x1=(-c[1]+Math.sqrt(d))/(2*c[2]),x2=(-c[1]-Math.sqrt(d))/(2*c[2]);
    return {text:`Roots:\nx₁ = ${omniFormat(x1)}\nx₂ = ${omniFormat(x2)}\n\nDiscriminant: ${omniFormat(d)}\nMethod: quadratic formula, x = (−b ± √(b² − 4ac)) / 2a.`,tool:'Quadratic equation solver'};
  }
  function omniReason(q) {
    const lower=q.toLowerCase();
    const solved=omniSolveEquation(q); if(solved) return solved;
    const converted=omniConvert(q); if(converted) return {text:converted,tool:'Unit conversion'};
    const loan=omniLoan(q); if(loan) return {text:loan,tool:'Financial analysis'};
    const budget=omniBudget(q); if(budget) return {text:budget,tool:'Budget planner'};
    const explanation=omniExplain(lower); if(explanation) return {text:explanation,tool:'Knowledge engine'};
    if(/last calculation|previous answer|last answer/.test(lower)) return {text:`Your previous calculator answer is ${omniFormat(lastAnswer)}.`,tool:'Calculator context'};
    const expressionText=omniMathText(q);
    if(expressionText && /\d/.test(expressionText)) {
      const value=evaluateMath(expressionText);
      if(value!==null && Number.isFinite(value)) return {text:`Result: ${omniFormat(value)}\n\nExpression: ${expressionText}\n\nI evaluated this using Omni's safe mathematical parser. No JavaScript code from your prompt is executed.`,tool:'Scientific calculation'};
    }
    return {text:'I can help with calculations, percentages, loans, budgets, supported unit conversions and maths explanations. Try a specific request such as “18% of 2,450,000” or “loan 5,000,000 at 18% for 12 months”. This offline edition does not yet connect to a generative cloud model, so I will not invent an answer to an unsupported question.',tool:'Capability guidance'};
  }
  function omniAiSend() {
    const q=omniAiInputEl?.value.trim(); if(!q)return;
    omniAiMessage('user',q); omniAiInputEl.value='';
    const response=omniReason(q); omniAiMessage('assistant',response.text,`Tool: ${response.tool} · Local execution`);
  }
  bind(document.getElementById('omniAiSend'),omniAiSend);
  omniAiInputEl?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();omniAiSend();}});
  document.querySelectorAll('[data-ai-prompt]').forEach(b=>bind(b,()=>{omniAiInputEl.value=b.dataset.aiPrompt;omniAiSend();}));
  bind(document.getElementById('omniAiClear'),()=>{STORE.write('omniAiChat',[]);renderOmniAiHistory();toast('Conversation cleared from this device');});

  // Settings & Themes
  bind(document.getElementById('settingsBtn'), (e) => { e.stopPropagation(); toggleModal('settingsMenu', !document.getElementById('settingsMenu').classList.contains('open')); });
  const savedThemeRaw = STORE.readText('calcTheme', 'dark');
  const savedTheme = ['dark','light','blue','emerald'].includes(savedThemeRaw) ? savedThemeRaw : 'dark';
  document.getElementById('app').dataset.theme = savedTheme;
  document.querySelectorAll('#settingsMenu button[data-theme]').forEach(b => bind(b, () => { document.getElementById('app').dataset.theme = b.dataset.theme; STORE.writeText('calcTheme', b.dataset.theme); toggleModal('settingsMenu', false); }));
  
  // Haptics Toggle Logic
  const hapticBtn = document.getElementById('hapticToggleBtn');
  hapticBtn.textContent = hapticsEnabled ? '📳 Haptics: ON' : '📴 Haptics: OFF';
  bind(hapticBtn, () => {
    hapticsEnabled = !hapticsEnabled;
    STORE.writeText('calcHaptics', hapticsEnabled);
    hapticBtn.textContent = hapticsEnabled ? '📳 Haptics: ON' : '📴 Haptics: OFF';
    toast(hapticsEnabled ? 'Haptics enabled' : 'Haptics disabled');
  });

  // Color Picker Logic
  document.querySelectorAll('.color-swatch[data-color]').forEach(s => {
    s.addEventListener('click', () => {
      const color = s.dataset.color;
      document.documentElement.style.setProperty('--accent', color); STORE.writeText('calcAccent', color);
      document.getElementById('customColorInput').value = color;
      document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
      s.classList.add('active');
      haptic();
    });
  });

  document.getElementById('customColorInput').addEventListener('input', (e) => {
    const color = e.target.value;
    document.documentElement.style.setProperty('--accent', color); STORE.writeText('calcAccent', color);
    document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
    e.target.parentElement.classList.add('active');
  });

  bind(document.getElementById('resetKeypadBtn'), () => { keypadLayout = defaultKeypad.map(key => ({ ...key })); STORE.write('calcKeypad', keypadLayout); isDragMode = false; document.getElementById('app').classList.remove('drag-mode'); renderKeypad(); toggleModal('settingsMenu', false); toast('Keypad restored'); });

  bind(document.getElementById('dragModeBtn'), () => {
    isDragMode = !isDragMode;
    document.getElementById('app').classList.toggle('drag-mode', isDragMode);
    renderKeypad();
    toast(isDragMode ? 'Drag a key to any position' : 'Layout saved');
    toggleModal('settingsMenu', false);
  });

  bind(document.getElementById('stepsBtn'), showSteps);

  // Close menus on outside click
  document.addEventListener('click', (e) => {
    if (!document.getElementById('historyContextMenu').contains(e.target)) document.getElementById('historyContextMenu').classList.remove('open');
    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsMenu.classList.contains('open') && !document.getElementById('settingsBtn').contains(e.target) && !settingsMenu.contains(e.target)) settingsMenu.classList.remove('open');

    if (isDragMode) {
      const isButton = e.target.closest('.basic-grid button');
      const isSettings = e.target.closest('#settingsMenu') || e.target.closest('#settingsBtn');
      const isDisplay = e.target.closest('.result-line'); 
      if (!isButton && !isSettings && !isDisplay) {
        isDragMode = false;
        document.getElementById('app').classList.remove('drag-mode');
        renderKeypad();
        toast('Layout saved');
      }
    }
  });

  document.getElementById('ctxCopyExpr').onclick = async () => { try { if(currentHistoryIndex>-1) await navigator.clipboard.writeText(history[currentHistoryIndex].expr); toast('Copied'); } catch (_) { toast('Clipboard unavailable'); } document.getElementById('historyContextMenu').classList.remove('open'); };
  document.getElementById('ctxCopyRes').onclick = async () => { try { if(currentHistoryIndex>-1) await navigator.clipboard.writeText(history[currentHistoryIndex].result.replace(/,/g,'')); toast('Copied'); } catch (_) { toast('Clipboard unavailable'); } document.getElementById('historyContextMenu').classList.remove('open'); };
  document.getElementById('ctxDelete').onclick = () => { if(currentHistoryIndex>-1) { history.splice(currentHistoryIndex, 1); STORE.write('calcHistoryPro', history); renderHistory(); } document.getElementById('historyContextMenu').classList.remove('open'); };

  // Converter events
  document.getElementById('convFrom').addEventListener('input', convert);
  document.getElementById('convFromUnit').addEventListener('change', convert);
  document.getElementById('convToUnit').addEventListener('change', convert);
  const refreshRatesButton = document.getElementById('refreshRatesBtn');
  if (refreshRatesButton) refreshRatesButton.addEventListener('click', () => fetchRates(true));
  bind(document.getElementById('convSwap'), () => { const f = document.getElementById('convFromUnit'), t = document.getElementById('convToUnit'); const tmp = f.value; f.value = t.value; t.value = tmp; convert(); });

  // Sci events
  document.querySelectorAll('[data-sci]').forEach(b => { b.dataset.current = b.dataset.sci; bind(b, () => handleSci(b.dataset.sci, b)); });
  document.querySelectorAll('[data-mem]').forEach(b => bind(b, () => { const val = parseFloat(currentToken)||0, act = b.dataset.mem; if(act==='mc') memory=0; if(act==='mr') { currentToken=String(memory); isEvaluated=false; } if(act==='mplus') memory+=val; if(act==='mminus') memory-=val; STORE.writeText('calcMemory', memory); updateDisplay(); if(!(window.matchMedia('(orientation: landscape)').matches && window.innerHeight<550)) setScientificOpen(false); }));

  // Keyboard
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
    else if (e.key === '.') { if(!currentToken.includes('.')) currentToken += '.'; updateDisplay(); }
    else if (['+','-','*','/','^'].includes(e.key)) inputOperator(e.key==='*'?'×':e.key==='/'?'÷':e.key==='-'?'−':e.key);
    else if (e.key === 'Enter' || e.key === '=') handleEquals();
    else if (e.key === 'Escape') { if (!handleBackNavigation()) handleClear(); }
    else if (e.key === 'Backspace') { if(currentToken.length>1) currentToken = currentToken.slice(0,-1); else currentToken='0'; updateDisplay(); }
  });

  // Screen Wake Lock
  let wakeLock = null;
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (err) { }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWakeLock(); });
  requestWakeLock();

  // Init
  document.getElementById('degToggle').textContent = isDegree ? 'Deg' : 'Rad';
  const savedAccent = STORE.readText('calcAccent', '');
  if (/^#[0-9a-f]{6}$/i.test(savedAccent)) { document.documentElement.style.setProperty('--accent', savedAccent); const picker = document.getElementById('customColorInput'); if (picker) picker.value = savedAccent; }
  renderKeypad();
  updateDisplay();
  const runningNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  if (!runningNative && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) { navigator.serviceWorker.register('./sw.js').catch(() => {}); }

})();
