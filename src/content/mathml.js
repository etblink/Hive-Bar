'use strict';

const COMMAND_SYMBOLS = Object.freeze({
  alpha: ['mi', 'α'], beta: ['mi', 'β'], gamma: ['mi', 'γ'], delta: ['mi', 'δ'], epsilon: ['mi', 'ϵ'], varepsilon: ['mi', 'ε'],
  zeta: ['mi', 'ζ'], eta: ['mi', 'η'], theta: ['mi', 'θ'], vartheta: ['mi', 'ϑ'], iota: ['mi', 'ι'], kappa: ['mi', 'κ'],
  lambda: ['mi', 'λ'], mu: ['mi', 'μ'], nu: ['mi', 'ν'], xi: ['mi', 'ξ'], omicron: ['mi', 'ο'], pi: ['mi', 'π'], varpi: ['mi', 'ϖ'],
  rho: ['mi', 'ρ'], varrho: ['mi', 'ϱ'], sigma: ['mi', 'σ'], varsigma: ['mi', 'ς'], tau: ['mi', 'τ'], upsilon: ['mi', 'υ'],
  phi: ['mi', 'ϕ'], varphi: ['mi', 'φ'], chi: ['mi', 'χ'], psi: ['mi', 'ψ'], omega: ['mi', 'ω'],
  Gamma: ['mi', 'Γ'], Delta: ['mi', 'Δ'], Theta: ['mi', 'Θ'], Lambda: ['mi', 'Λ'], Xi: ['mi', 'Ξ'], Pi: ['mi', 'Π'],
  Sigma: ['mi', 'Σ'], Upsilon: ['mi', 'Υ'], Phi: ['mi', 'Φ'], Psi: ['mi', 'Ψ'], Omega: ['mi', 'Ω'],
  infty: ['mo', '∞'], partial: ['mo', '∂'], nabla: ['mo', '∇'], ell: ['mi', 'ℓ'], hbar: ['mi', 'ℏ'], Re: ['mi', 'ℜ'], Im: ['mi', 'ℑ'],
  pm: ['mo', '±'], mp: ['mo', '∓'], times: ['mo', '×'], cdot: ['mo', '·'], div: ['mo', '÷'], ast: ['mo', '∗'], star: ['mo', '⋆'],
  circ: ['mo', '∘'], bullet: ['mo', '•'], cap: ['mo', '∩'], cup: ['mo', '∪'], setminus: ['mo', '∖'], land: ['mo', '∧'], lor: ['mo', '∨'],
  le: ['mo', '≤'], leq: ['mo', '≤'], ge: ['mo', '≥'], geq: ['mo', '≥'], neq: ['mo', '≠'], ne: ['mo', '≠'], approx: ['mo', '≈'],
  sim: ['mo', '∼'], simeq: ['mo', '≃'], equiv: ['mo', '≡'], propto: ['mo', '∝'], in: ['mo', '∈'], notin: ['mo', '∉'], ni: ['mo', '∋'],
  subset: ['mo', '⊂'], supset: ['mo', '⊃'], subseteq: ['mo', '⊆'], supseteq: ['mo', '⊇'], perp: ['mo', '⊥'], parallel: ['mo', '∥'],
  to: ['mo', '→'], rightarrow: ['mo', '→'], leftarrow: ['mo', '←'], leftrightarrow: ['mo', '↔'], Rightarrow: ['mo', '⇒'], Leftarrow: ['mo', '⇐'], Leftrightarrow: ['mo', '⇔'],
  mapsto: ['mo', '↦'], longrightarrow: ['mo', '⟶'], longleftarrow: ['mo', '⟵'], longleftrightarrow: ['mo', '⟷'],
  sum: ['mo', '∑'], prod: ['mo', '∏'], coprod: ['mo', '∐'], int: ['mo', '∫'], iint: ['mo', '∬'], iiint: ['mo', '∭'], oint: ['mo', '∮'],
  forall: ['mo', '∀'], exists: ['mo', '∃'], neg: ['mo', '¬'], emptyset: ['mo', '∅'], varnothing: ['mo', '∅'],
  ldots: ['mo', '…'], cdots: ['mo', '⋯'], vdots: ['mo', '⋮'], ddots: ['mo', '⋱'],
  langle: ['mo', '⟨'], rangle: ['mo', '⟩'], lfloor: ['mo', '⌊'], rfloor: ['mo', '⌋'], lceil: ['mo', '⌈'], rceil: ['mo', '⌉'],
});

const NAMED_OPERATORS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'gcd', 'Pr']);
const STYLE_COMMANDS = Object.freeze({ mathrm: 'normal', mathbf: 'bold', mathit: 'italic', mathsf: 'sans-serif', mathtt: 'monospace', mathbb: 'double-struck', mathcal: 'script', mathfrak: 'fraktur' });
const DANGEROUS_COMMANDS = new Set(['href', 'url', 'includegraphics', 'htmlClass', 'htmlId', 'htmlStyle', 'htmlData']);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function element(tag, content, attrs = '') {
  return `<${tag}${attrs}>${content}</${tag}>`;
}

function splitTopLevel(source, kind) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{' && (index === 0 || source[index - 1] !== '\\')) depth += 1;
    else if (char === '}' && (index === 0 || source[index - 1] !== '\\')) depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;
    if (kind === '&' && char === '&' && (index === 0 || source[index - 1] !== '\\')) {
      parts.push(source.slice(start, index));
      start = index + 1;
    } else if (kind === '\\\\' && char === '\\' && source[index + 1] === '\\') {
      parts.push(source.slice(start, index));
      start = index + 2;
      index += 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

class TexParser {
  constructor(source) {
    this.source = String(source || '');
    this.index = 0;
  }

  parse(stop = null) {
    const nodes = [];
    while (this.index < this.source.length) {
      if (stop && this.source[this.index] === stop) {
        this.index += 1;
        break;
      }
      if (/\s/.test(this.source[this.index])) {
        this.index += 1;
        if (nodes.length && !nodes[nodes.length - 1].includes('<mspace')) nodes.push('<mspace width="0.22em"></mspace>');
        continue;
      }
      let atom = this.parseAtom();
      if (!atom) continue;
      let subscript = null;
      let superscript = null;
      while (this.source[this.index] === '_' || this.source[this.index] === '^') {
        const marker = this.source[this.index];
        this.index += 1;
        const script = this.parseScriptAtom();
        if (marker === '_') subscript = script;
        else superscript = script;
      }
      if (subscript && superscript) atom = `<msubsup>${atom}${subscript}${superscript}</msubsup>`;
      else if (subscript) atom = `<msub>${atom}${subscript}</msub>`;
      else if (superscript) atom = `<msup>${atom}${superscript}</msup>`;
      nodes.push(atom);
    }
    return nodes.join('');
  }

  parseScriptAtom() {
    while (/\s/.test(this.source[this.index] || '')) this.index += 1;
    if (this.source[this.index] === '{') {
      this.index += 1;
      return `<mrow>${this.parse('}')}</mrow>`;
    }
    return this.parseAtom() || '<mrow></mrow>';
  }

  parseAtom() {
    const char = this.source[this.index];
    if (!char) return '';
    if (char === '{') {
      this.index += 1;
      return `<mrow>${this.parse('}')}</mrow>`;
    }
    if (char === '}') {
      this.index += 1;
      return element('mo', '}');
    }
    if (char === '\\') return this.parseCommand();
    if (/\d/.test(char)) {
      const start = this.index;
      while (/[\d.]/.test(this.source[this.index] || '')) this.index += 1;
      return element('mn', escapeHtml(this.source.slice(start, this.index)));
    }
    if (/[A-Za-z]/.test(char)) {
      this.index += 1;
      return element('mi', escapeHtml(char));
    }
    this.index += 1;
    if (/[+\-=<>|,:;!()[\]\/]/.test(char)) return element('mo', escapeHtml(char));
    return element('mtext', escapeHtml(char));
  }

  readCommandName() {
    if (this.source[this.index] !== '\\') return '';
    this.index += 1;
    if (!/[A-Za-z]/.test(this.source[this.index] || '')) {
      const one = this.source[this.index] || '';
      this.index += one ? 1 : 0;
      return one;
    }
    const start = this.index;
    while (/[A-Za-z]/.test(this.source[this.index] || '')) this.index += 1;
    return this.source.slice(start, this.index);
  }

  readRawGroup() {
    while (/\s/.test(this.source[this.index] || '')) this.index += 1;
    if (this.source[this.index] !== '{') return null;
    this.index += 1;
    const start = this.index;
    let depth = 1;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === '\\') {
        this.index += Math.min(2, this.source.length - this.index);
        continue;
      }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const result = this.source.slice(start, this.index);
          this.index += 1;
          return result;
        }
      }
      this.index += 1;
    }
    return this.source.slice(start);
  }

  parseRequiredGroup() {
    while (/\s/.test(this.source[this.index] || '')) this.index += 1;
    if (this.source[this.index] !== '{') return this.parseScriptAtom();
    this.index += 1;
    return `<mrow>${this.parse('}')}</mrow>`;
  }

  parseEnvironment(name) {
    const marker = `\\end{${name}}`;
    const end = this.source.indexOf(marker, this.index);
    if (end < 0) return element('mtext', escapeHtml(`\\begin{${name}}`));
    const body = this.source.slice(this.index, end);
    this.index = end + marker.length;
    const rows = splitTopLevel(body, '\\\\').map((row) => {
      const cells = splitTopLevel(row, '&').map((cell) => `<mtd><mrow>${new TexParser(cell).parse()}</mrow></mtd>`).join('');
      return `<mtr>${cells}</mtr>`;
    }).join('');
    const table = `<mtable>${rows}</mtable>`;
    if (name === 'cases') return `<mrow><mo stretchy="true">{</mo>${table}</mrow>`;
    if (name === 'pmatrix') return `<mrow><mo stretchy="true">(</mo>${table}<mo stretchy="true">)</mo></mrow>`;
    if (name === 'bmatrix') return `<mrow><mo stretchy="true">[</mo>${table}<mo stretchy="true">]</mo></mrow>`;
    if (name === 'vmatrix') return `<mrow><mo stretchy="true">|</mo>${table}<mo stretchy="true">|</mo></mrow>`;
    return table;
  }

  parseCommand() {
    const command = this.readCommandName();
    if (!command) return '';
    if (Object.hasOwn(COMMAND_SYMBOLS, command)) {
      const [tag, symbol] = COMMAND_SYMBOLS[command];
      const attrs = ['sum', 'prod', 'coprod', 'int', 'iint', 'iiint', 'oint'].includes(command) ? ' largeop="true" movablelimits="true"' : '';
      return element(tag, symbol, attrs);
    }
    if (NAMED_OPERATORS.has(command)) return element('mi', escapeHtml(command), ' mathvariant="normal"');
    if (command === 'frac' || command === 'dfrac' || command === 'tfrac') {
      const numerator = this.parseRequiredGroup();
      const denominator = this.parseRequiredGroup();
      return `<mfrac>${numerator}${denominator}</mfrac>`;
    }
    if (command === 'sqrt') {
      while (/\s/.test(this.source[this.index] || '')) this.index += 1;
      let root = null;
      if (this.source[this.index] === '[') {
        const end = this.source.indexOf(']', this.index + 1);
        if (end >= 0) {
          root = new TexParser(this.source.slice(this.index + 1, end)).parse();
          this.index = end + 1;
        }
      }
      const body = this.parseRequiredGroup();
      return root ? `<mroot>${body}<mrow>${root}</mrow></mroot>` : `<msqrt>${body}</msqrt>`;
    }
    if (command === 'text' || command === 'operatorname') {
      const raw = this.readRawGroup();
      return element(command === 'operatorname' ? 'mi' : 'mtext', escapeHtml(raw ?? ''), command === 'operatorname' ? ' mathvariant="normal"' : '');
    }
    if (Object.hasOwn(STYLE_COMMANDS, command)) {
      const raw = this.readRawGroup();
      const content = new TexParser(raw ?? '').parse();
      return `<mstyle mathvariant="${STYLE_COMMANDS[command]}"><mrow>${content}</mrow></mstyle>`;
    }
    if (command === 'overline' || command === 'bar') return `<mover>${this.parseRequiredGroup()}<mo>¯</mo></mover>`;
    if (command === 'underline') return `<munder>${this.parseRequiredGroup()}<mo>_</mo></munder>`;
    if (command === 'hat' || command === 'widehat') return `<mover>${this.parseRequiredGroup()}<mo>^</mo></mover>`;
    if (command === 'vec') return `<mover>${this.parseRequiredGroup()}<mo>→</mo></mover>`;
    if (command === 'dot') return `<mover>${this.parseRequiredGroup()}<mo>˙</mo></mover>`;
    if (command === 'ddot') return `<mover>${this.parseRequiredGroup()}<mo>¨</mo></mover>`;
    if (command === 'left' || command === 'right') {
      while (/\s/.test(this.source[this.index] || '')) this.index += 1;
      if (this.source[this.index] === '\\') {
        const nested = this.readCommandName();
        if (Object.hasOwn(COMMAND_SYMBOLS, nested)) return element('mo', COMMAND_SYMBOLS[nested][1], ' stretchy="true"');
        if (Object.hasOwn({ '{': '{', '}': '}', '|': '|', Vert: '∥' }, nested)) return element('mo', { '{': '{', '}': '}', '|': '|', Vert: '∥' }[nested], ' stretchy="true"');
        return element('mo', escapeHtml(`\\${nested}`), ' stretchy="true"');
      }
      const delimiter = this.source[this.index] || '';
      this.index += delimiter ? 1 : 0;
      return element('mo', escapeHtml(delimiter === '.' ? '' : delimiter), ' stretchy="true"');
    }
    if (command === 'begin') {
      const name = this.readRawGroup() || '';
      return this.parseEnvironment(name);
    }
    if (command === 'limits' || command === 'displaystyle' || command === 'textstyle') return '';
    if (command === ',' || command === ':' || command === ';' || command === ' ') return '<mspace width="0.28em"></mspace>';
    if (command === '!') return '<mspace width="0.08em"></mspace>';
    if (command === 'quad') return '<mspace width="1em"></mspace>';
    if (command === 'qquad') return '<mspace width="2em"></mspace>';
    if (['%', '#', '$', '_', '&', '{', '}', '\\'].includes(command)) return element('mtext', escapeHtml(command));
    if (DANGEROUS_COMMANDS.has(command)) {
      const raw = this.readRawGroup();
      return element('mtext', escapeHtml(`\\${command}${raw === null ? '' : `{${raw}}`}`));
    }
    return element('mtext', escapeHtml(`\\${command}`));
  }
}

function renderLatexMathML(source, { displayMode = false } = {}) {
  const input = String(source || '').trim();
  if (!input) return '';
  const content = new TexParser(input).parse();
  const display = displayMode ? 'block' : 'inline';
  const math = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display}" aria-label="${escapeHtml(input)}"><semantics><mrow>${content}</mrow><annotation encoding="application/x-tex">${escapeHtml(input)}</annotation></semantics></math>`;
  return displayMode
    ? `<div class="hb-math hb-math--display">${math}</div>`
    : `<span class="hb-math hb-math--inline">${math}</span>`;
}

module.exports = { renderLatexMathML };
