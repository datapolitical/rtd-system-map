// The map's own style expressions, worked out for one zoom and one feature,
// so the key can draw a mark at the size, image and strength its layer would
// (DESIGN.md, "The key"). Only the operators our layer definitions use; an
// unknown one throws, so a new operator in a layer is caught by the tests
// rather than drawn wrong. Pure, so tests can import it.

const num = (v) => (typeof v === 'number' ? v : Number(v));

/**
 * The value of `expr` at `zoom` for a feature with `props`, with MapLibre
 * global state `state` (name -> value). Literals come back as they are.
 */
export function evaluate(expr, { zoom = 0, props = {}, state = {} } = {}) {
  const ev = (e) => evaluate(e, { zoom, props, state });
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr;
  if (typeof op !== 'string') return expr; // a plain array value, like a dash
  switch (op) {
    case 'zoom':
      return zoom;
    case 'literal':
      return args[0];
    case 'get':
      return props[args[0]] ?? null;
    case 'global-state':
      return state[args[0]] ?? null;
    case 'coalesce':
      for (const a of args) {
        const v = ev(a);
        if (v != null) return v;
      }
      return null;
    case 'boolean': {
      const v = ev(args[0]);
      return typeof v === 'boolean' ? v : args.length > 1 ? ev(args[1]) : Boolean(v);
    }
    case 'to-string': {
      const v = ev(args[0]);
      return v == null ? '' : String(v);
    }
    case 'concat':
      return args.map((a) => {
        const v = ev(a);
        return v == null ? '' : String(v);
      }).join('');
    case '==':
      return ev(args[0]) === ev(args[1]);
    case '!=':
      return ev(args[0]) !== ev(args[1]);
    case '<':
      return ev(args[0]) < ev(args[1]);
    case '<=':
      return ev(args[0]) <= ev(args[1]);
    case '>':
      return ev(args[0]) > ev(args[1]);
    case '>=':
      return ev(args[0]) >= ev(args[1]);
    case '!':
      return !ev(args[0]);
    case 'all':
      return args.every((a) => ev(a));
    case 'any':
      return args.some((a) => ev(a));
    case 'in': {
      const needle = ev(args[0]);
      const hay = ev(args[1]);
      return typeof hay === 'string' ? hay.includes(String(needle)) : Array.isArray(hay) && hay.includes(needle);
    }
    case '+':
      return args.reduce((s, a) => s + num(ev(a)), 0);
    case '*':
      return args.reduce((s, a) => s * num(ev(a)), 1);
    case '-':
      return args.length === 1 ? -num(ev(args[0])) : num(ev(args[0])) - num(ev(args[1]));
    case '/':
      return num(ev(args[0])) / num(ev(args[1]));
    case 'min':
      return Math.min(...args.map((a) => num(ev(a))));
    case 'max':
      return Math.max(...args.map((a) => num(ev(a))));
    case 'case': {
      for (let i = 0; i + 1 < args.length; i += 2) if (ev(args[i])) return ev(args[i + 1]);
      return ev(args.at(-1));
    }
    case 'match': {
      const input = ev(args[0]);
      for (let i = 1; i + 1 < args.length; i += 2) {
        const labels = Array.isArray(args[i]) ? args[i] : [args[i]];
        if (labels.includes(input)) return ev(args[i + 1]);
      }
      return ev(args.at(-1));
    }
    case 'step': {
      const x = num(ev(args[0]));
      let out = args[1];
      for (let i = 2; i + 1 < args.length; i += 2) {
        if (x >= args[i]) out = args[i + 1];
        else break;
      }
      return ev(out);
    }
    case 'interpolate': {
      const [type, input, ...stops] = args;
      const x = num(ev(input));
      const base = type[0] === 'exponential' ? type[1] : 1;
      if (type[0] !== 'linear' && type[0] !== 'exponential') throw new Error(`interpolate ${type[0]}`);
      if (x <= stops[0]) return ev(stops[1]);
      for (let i = 0; i + 2 < stops.length; i += 2) {
        const [lo, hi] = [stops[i], stops[i + 2]];
        if (x > hi) continue;
        const d = hi - lo;
        const p = x - lo;
        const t = d === 0 ? 0 : base === 1 ? p / d : (base ** p - 1) / (base ** d - 1);
        const a = ev(stops[i + 1]);
        const b = ev(stops[i + 3]);
        return Array.isArray(a) ? a.map((v, k) => v + (b[k] - v) * t) : a + (b - a) * t;
      }
      return ev(stops.at(-1));
    }
    default:
      throw new Error(`evaluate: no ${op}`);
  }
}

/**
 * Whether a layer draws at `zoom` (its minzoom and maxzoom: MapLibre shows a
 * layer from minzoom up to, not including, maxzoom) and passes its filter for
 * `props`.
 */
export function drawsAt(layer, zoom, props = {}, state = {}) {
  if (zoom < (layer.minzoom ?? 0) || zoom >= (layer.maxzoom ?? 24)) return false;
  return layer.filter == null || Boolean(evaluate(layer.filter, { zoom, props, state }));
}

/**
 * How strongly a layer draws a feature at `zoom`: 0 where it doesn't, else
 * its paint opacity (icon, circle, fill or line, whichever it has).
 */
export function strengthAt(layer, zoom, props = {}, state = {}) {
  if (!drawsAt(layer, zoom, props, state)) return 0;
  const paint = layer.paint ?? {};
  const key = ['icon-opacity', 'circle-opacity', 'fill-opacity', 'line-opacity'].find((k) => k in paint);
  return key ? num(evaluate(paint[key], { zoom, props, state })) : 1;
}

/**
 * The first zoom, at or above `from`, where a zoom-interpolated number has
 * reached its largest stop: where a fade-in has finished.
 */
export function settledFrom(expr, from = 0) {
  if (!Array.isArray(expr) || expr[0] !== 'interpolate' || !Array.isArray(expr[2]) || expr[2][0] !== 'zoom') return from;
  const stops = expr.slice(3);
  const outs = stops.filter((_, i) => i % 2 === 1);
  if (!outs.every((v) => typeof v === 'number')) return from;
  const top = Math.max(...outs);
  const at = stops[outs.indexOf(top) * 2];
  return Math.max(from, at);
}
