(function () {
  'use strict';

  /**
   * Utility module to work with key-value stores.
   *
   * @module map
   */

  /**
   * Creates a new Map instance.
   *
   * @function
   * @return {Map<any, any>}
   *
   * @function
   */
  const create$6 = () => new Map();

  /**
   * Copy a Map object into a fresh Map object.
   *
   * @function
   * @template X,Y
   * @param {Map<X,Y>} m
   * @return {Map<X,Y>}
   */
  const copy$1 = m => {
    const r = create$6();
    m.forEach((v, k) => { r.set(k, v); });
    return r
  };

  /**
   * Get map property. Create T if property is undefined and set T on map.
   *
   * ```js
   * const listeners = map.setIfUndefined(events, 'eventName', set.create)
   * listeners.add(listener)
   * ```
   *
   * @function
   * @template T,K
   * @param {Map<K, T>} map
   * @param {K} key
   * @param {function():T} createT
   * @return {T}
   */
  const setIfUndefined = (map, key, createT) => {
    let set = map.get(key);
    if (set === undefined) {
      map.set(key, set = createT());
    }
    return set
  };

  /**
   * Creates an Array and populates it with the content of all key-value pairs using the `f(value, key)` function.
   *
   * @function
   * @template K
   * @template V
   * @template R
   * @param {Map<K,V>} m
   * @param {function(V,K):R} f
   * @return {Array<R>}
   */
  const map$1 = (m, f) => {
    const res = [];
    for (const [key, value] of m) {
      res.push(f(value, key));
    }
    return res
  };

  /**
   * Tests whether any key-value pairs pass the test implemented by `f(value, key)`.
   *
   * @todo should rename to some - similarly to Array.some
   *
   * @function
   * @template K
   * @template V
   * @param {Map<K,V>} m
   * @param {function(V,K):boolean} f
   * @return {boolean}
   */
  const any = (m, f) => {
    for (const [key, value] of m) {
      if (f(value, key)) {
        return true
      }
    }
    return false
  };

  /**
   * Utility module to work with strings.
   *
   * @module string
   */

  const fromCharCode = String.fromCharCode;

  /**
   * @param {string} s
   * @return {string}
   */
  const toLowerCase = s => s.toLowerCase();

  const trimLeftRegex = /^\s*/g;

  /**
   * @param {string} s
   * @return {string}
   */
  const trimLeft = s => s.replace(trimLeftRegex, '');

  const fromCamelCaseRegex = /([A-Z])/g;

  /**
   * @param {string} s
   * @param {string} separator
   * @return {string}
   */
  const fromCamelCase = (s, separator) => trimLeft(s.replace(fromCamelCaseRegex, match => `${separator}${toLowerCase(match)}`));

  /**
   * @param {string} str
   * @return {Uint8Array}
   */
  const _encodeUtf8Polyfill = str => {
    const encodedString = unescape(encodeURIComponent(str));
    const len = encodedString.length;
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buf[i] = /** @type {number} */ (encodedString.codePointAt(i));
    }
    return buf
  };

  /* istanbul ignore next */
  const utf8TextEncoder = /** @type {TextEncoder} */ (typeof TextEncoder !== 'undefined' ? new TextEncoder() : null);

  /**
   * @param {string} str
   * @return {Uint8Array}
   */
  const _encodeUtf8Native = str => utf8TextEncoder.encode(str);

  /**
   * @param {string} str
   * @return {Uint8Array}
   */
  /* istanbul ignore next */
  const encodeUtf8 = utf8TextEncoder ? _encodeUtf8Native : _encodeUtf8Polyfill;

  /* istanbul ignore next */
  let utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  /* istanbul ignore next */
  if (utf8TextDecoder && utf8TextDecoder.decode(new Uint8Array()).length === 1) {
    // Safari doesn't handle BOM correctly.
    // This fixes a bug in Safari 13.0.5 where it produces a BOM the first time it is called.
    // utf8TextDecoder.decode(new Uint8Array()).length === 1 on the first call and
    // utf8TextDecoder.decode(new Uint8Array()).length === 1 on the second call
    // Another issue is that from then on no BOM chars are recognized anymore
    /* istanbul ignore next */
    utf8TextDecoder = null;
  }

  /**
   * Often used conditions.
   *
   * @module conditions
   */

  /**
   * @template T
   * @param {T|null|undefined} v
   * @return {T|null}
   */
  /* istanbul ignore next */
  const undefinedToNull = v => v === undefined ? null : v;

  /* global localStorage, addEventListener */

  /**
   * Isomorphic variable storage.
   *
   * Uses LocalStorage in the browser and falls back to in-memory storage.
   *
   * @module storage
   */

  /* istanbul ignore next */
  class VarStoragePolyfill {
    constructor () {
      this.map = new Map();
    }

    /**
     * @param {string} key
     * @param {any} newValue
     */
    setItem (key, newValue) {
      this.map.set(key, newValue);
    }

    /**
     * @param {string} key
     */
    getItem (key) {
      return this.map.get(key)
    }
  }

  /* istanbul ignore next */
  /**
   * @type {any}
   */
  let _localStorage = new VarStoragePolyfill();
  let usePolyfill = true;

  try {
    // if the same-origin rule is violated, accessing localStorage might thrown an error
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      _localStorage = localStorage;
      usePolyfill = false;
    }
  } catch (e) { }

  /* istanbul ignore next */
  /**
   * This is basically localStorage in browser, or a polyfill in nodejs
   */
  const varStorage = _localStorage;

  /**
   * Isomorphic module to work access the environment (query params, env variables).
   *
   * @module map
   */

  /* istanbul ignore next */
  // @ts-ignore
  const isNode = typeof process !== 'undefined' && process.release && /node|io\.js/.test(process.release.name);
  /* istanbul ignore next */
  const isBrowser = typeof window !== 'undefined' && !isNode;
  /* istanbul ignore next */
  typeof navigator !== 'undefined' ? /Mac/.test(navigator.platform) : false;

  /**
   * @type {Map<string,string>}
   */
  let params;

  /* istanbul ignore next */
  const computeParams = () => {
    if (params === undefined) {
      if (isNode) {
        params = create$6();
        const pargs = process.argv;
        let currParamName = null;
        /* istanbul ignore next */
        for (let i = 0; i < pargs.length; i++) {
          const parg = pargs[i];
          if (parg[0] === '-') {
            if (currParamName !== null) {
              params.set(currParamName, '');
            }
            currParamName = parg;
          } else {
            if (currParamName !== null) {
              params.set(currParamName, parg);
              currParamName = null;
            }
          }
        }
        if (currParamName !== null) {
          params.set(currParamName, '');
        }
      // in ReactNative for example this would not be true (unless connected to the Remote Debugger)
      } else if (typeof location === 'object') {
        params = create$6()
        // eslint-disable-next-line no-undef
        ;(location.search || '?').slice(1).split('&').forEach(kv => {
          if (kv.length !== 0) {
            const [key, value] = kv.split('=');
            params.set(`--${fromCamelCase(key, '-')}`, value);
            params.set(`-${fromCamelCase(key, '-')}`, value);
          }
        });
      } else {
        params = create$6();
      }
    }
    return params
  };

  /**
   * @param {string} name
   * @return {boolean}
   */
  /* istanbul ignore next */
  const hasParam = name => computeParams().has(name);

  /**
   * @param {string} name
   * @param {string} defaultVal
   * @return {string}
   */
  /* istanbul ignore next */
  const getParam = (name, defaultVal) => computeParams().get(name) || defaultVal;
  // export const getArgs = name => computeParams() && args

  /**
   * @param {string} name
   * @return {string|null}
   */
  /* istanbul ignore next */
  const getVariable = name => isNode ? undefinedToNull(process.env[name.toUpperCase()]) : undefinedToNull(varStorage.getItem(name));

  /**
   * @param {string} name
   * @return {boolean}
   */
  /* istanbul ignore next */
  const hasConf = name => hasParam('--' + name) || getVariable(name) !== null;

  /* istanbul ignore next */
  hasConf('production');

  /**
   * Utility module to work with EcmaScript Symbols.
   *
   * @module symbol
   */

  /**
   * Return fresh symbol.
   *
   * @return {Symbol}
   */
  const create$5 = Symbol;

  /**
   * Working with value pairs.
   *
   * @module pair
   */

  /**
   * @template L,R
   */
  class Pair {
    /**
     * @param {L} left
     * @param {R} right
     */
    constructor (left, right) {
      this.left = left;
      this.right = right;
    }
  }

  /**
   * @template L,R
   * @param {L} left
   * @param {R} right
   * @return {Pair<L,R>}
   */
  const create$4 = (left, right) => new Pair(left, right);

  /**
   * @template L,R
   * @param {Array<Pair<L,R>>} arr
   * @param {function(L, R):any} f
   */
  const forEach$1 = (arr, f) => arr.forEach(p => f(p.left, p.right));

  /* eslint-env browser */

  /* istanbul ignore next */
  /**
   * @type {Document}
   */
  const doc$2 = /** @type {Document} */ (typeof document !== 'undefined' ? document : {});

  /**
   * @param {string} name
   * @return {HTMLElement}
   */
  /* istanbul ignore next */
  const createElement = name => doc$2.createElement(name);

  /**
   * @return {DocumentFragment}
   */
  /* istanbul ignore next */
  const createDocumentFragment = () => doc$2.createDocumentFragment();

  /**
   * @param {string} text
   * @return {Text}
   */
  /* istanbul ignore next */
  const createTextNode = text => doc$2.createTextNode(text);

  /* istanbul ignore next */
  /** @type {DOMParser} */ (typeof DOMParser !== 'undefined' ? new DOMParser() : null);

  /**
   * @param {Element} el
   * @param {Array<pair.Pair<string,string|boolean>>} attrs Array of key-value pairs
   * @return {Element}
   */
  /* istanbul ignore next */
  const setAttributes = (el, attrs) => {
    forEach$1(attrs, (key, value) => {
      if (value === false) {
        el.removeAttribute(key);
      } else if (value === true) {
        el.setAttribute(key, '');
      } else {
        // @ts-ignore
        el.setAttribute(key, value);
      }
    });
    return el
  };

  /**
   * @param {Array<Node>|HTMLCollection} children
   * @return {DocumentFragment}
   */
  /* istanbul ignore next */
  const fragment = children => {
    const fragment = createDocumentFragment();
    for (let i = 0; i < children.length; i++) {
      appendChild(fragment, children[i]);
    }
    return fragment
  };

  /**
   * @param {Element} parent
   * @param {Array<Node>} nodes
   * @return {Element}
   */
  /* istanbul ignore next */
  const append = (parent, nodes) => {
    appendChild(parent, fragment(nodes));
    return parent
  };

  /**
   * @param {EventTarget} el
   * @param {string} name
   * @param {EventListener} f
   */
  /* istanbul ignore next */
  const addEventListener = (el, name, f) => el.addEventListener(name, f);

  /**
   * @param {string} name
   * @param {Array<pair.Pair<string,string>|pair.Pair<string,boolean>>} attrs Array of key-value pairs
   * @param {Array<Node>} children
   * @return {Element}
   */
  /* istanbul ignore next */
  const element = (name, attrs = [], children = []) =>
    append(setAttributes(createElement(name), attrs), children);

  /**
   * @param {string} t
   * @return {Text}
   */
  /* istanbul ignore next */
  const text = createTextNode;

  /**
   * @param {Map<string,string>} m
   * @return {string}
   */
  /* istanbul ignore next */
  const mapToStyleString = m => map$1(m, (value, key) => `${key}:${value};`).join('');

  /**
   * @param {Node} parent
   * @param {Node} child
   * @return {Node}
   */
  /* istanbul ignore next */
  const appendChild = (parent, child) => parent.appendChild(child);

  doc$2.ELEMENT_NODE;
  doc$2.TEXT_NODE;
  doc$2.CDATA_SECTION_NODE;
  doc$2.COMMENT_NODE;
  doc$2.DOCUMENT_NODE;
  doc$2.DOCUMENT_TYPE_NODE;
  doc$2.DOCUMENT_FRAGMENT_NODE;

  /**
   * JSON utility functions.
   *
   * @module json
   */

  /**
   * Transform JavaScript object to JSON.
   *
   * @param {any} object
   * @return {string}
   */
  const stringify = JSON.stringify;

  /* global requestIdleCallback, requestAnimationFrame, cancelIdleCallback, cancelAnimationFrame */

  /**
   * Utility module to work with EcmaScript's event loop.
   *
   * @module eventloop
   */

  /**
   * @type {Array<function>}
   */
  let queue = [];

  const _runQueue = () => {
    for (let i = 0; i < queue.length; i++) {
      queue[i]();
    }
    queue = [];
  };

  /**
   * @param {function():void} f
   */
  const enqueue = f => {
    queue.push(f);
    if (queue.length === 1) {
      setTimeout(_runQueue, 0);
    }
  };

  /**
   * @typedef {Object} TimeoutObject
   * @property {function} TimeoutObject.destroy
   */

  /**
   * @param {function(number):void} clearFunction
   */
  const createTimeoutClass = clearFunction => class TT {
    /**
     * @param {number} timeoutId
     */
    constructor (timeoutId) {
      this._ = timeoutId;
    }

    destroy () {
      clearFunction(this._);
    }
  };

  const Timeout = createTimeoutClass(clearTimeout);

  /**
   * @param {number} timeout
   * @param {function} callback
   * @return {TimeoutObject}
   */
  const timeout = (timeout, callback) => new Timeout(setTimeout(callback, timeout));

  /**
   * Common Math expressions.
   *
   * @module math
   */

  const floor = Math.floor;
  const ceil = Math.ceil;
  const abs = Math.abs;
  const round = Math.round;
  const log10 = Math.log10;

  /**
   * @function
   * @param {number} a
   * @param {number} b
   * @return {number} The sum of a and b
   */
  const add = (a, b) => a + b;

  /**
   * @function
   * @param {number} a
   * @param {number} b
   * @return {number} The smaller element of a and b
   */
  const min = (a, b) => a < b ? a : b;

  /**
   * @function
   * @param {number} a
   * @param {number} b
   * @return {number} The bigger element of a and b
   */
  const max = (a, b) => a > b ? a : b;
  /**
   * Base 10 exponential function. Returns the value of 10 raised to the power of pow.
   *
   * @param {number} exp
   * @return {number}
   */
  const exp10 = exp => Math.pow(10, exp);

  /**
   * @param {number} n
   * @return {boolean} Wether n is negative. This function also differentiates between -0 and +0
   */
  const isNegativeZero = n => n !== 0 ? n < 0 : 1 / n < 0;

  /**
   * Utility module to convert metric values.
   *
   * @module metric
   */

  const prefixUp = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
  const prefixDown = ['', 'm', 'μ', 'n', 'p', 'f', 'a', 'z', 'y'];

  /**
   * Calculate the metric prefix for a number. Assumes E.g. `prefix(1000) = { n: 1, prefix: 'k' }`
   *
   * @param {number} n
   * @param {number} [baseMultiplier] Multiplier of the base (10^(3*baseMultiplier)). E.g. `convert(time, -3)` if time is already in milli seconds
   * @return {{n:number,prefix:string}}
   */
  const prefix = (n, baseMultiplier = 0) => {
    const nPow = n === 0 ? 0 : log10(n);
    let mult = 0;
    while (nPow < mult * 3 && baseMultiplier > -8) {
      baseMultiplier--;
      mult--;
    }
    while (nPow >= 3 + mult * 3 && baseMultiplier < 8) {
      baseMultiplier++;
      mult++;
    }
    const prefix = baseMultiplier < 0 ? prefixDown[-baseMultiplier] : prefixUp[baseMultiplier];
    return {
      n: round((mult > 0 ? n / exp10(mult * 3) : n * exp10(mult * -3)) * 1e12) / 1e12,
      prefix
    }
  };

  /**
   * Utility module to work with time.
   *
   * @module time
   */

  /**
   * Return current unix time.
   *
   * @return {number}
   */
  const getUnixTime = Date.now;

  /**
   * Transform time (in ms) to a human readable format. E.g. 1100 => 1.1s. 60s => 1min. .001 => 10μs.
   *
   * @param {number} d duration in milliseconds
   * @return {string} humanized approximation of time
   */
  const humanizeDuration = d => {
    if (d < 60000) {
      const p = prefix(d, -1);
      return round(p.n * 100) / 100 + p.prefix + 's'
    }
    d = floor(d / 1000);
    const seconds = d % 60;
    const minutes = floor(d / 60) % 60;
    const hours = floor(d / 3600) % 24;
    const days = floor(d / 86400);
    if (days > 0) {
      return days + 'd' + ((hours > 0 || minutes > 30) ? ' ' + (minutes > 30 ? hours + 1 : hours) + 'h' : '')
    }
    if (hours > 0) {
      /* istanbul ignore next */
      return hours + 'h' + ((minutes > 0 || seconds > 30) ? ' ' + (seconds > 30 ? minutes + 1 : minutes) + 'min' : '')
    }
    return minutes + 'min' + (seconds > 0 ? ' ' + seconds + 's' : '')
  };

  /**
   * Utility module to work with Arrays.
   *
   * @module array
   */

  /**
   * Return the last element of an array. The element must exist
   *
   * @template L
   * @param {Array<L>} arr
   * @return {L}
   */
  const last = arr => arr[arr.length - 1];

  /**
   * Append elements from src to dest
   *
   * @template M
   * @param {Array<M>} dest
   * @param {Array<M>} src
   */
  const appendTo = (dest, src) => {
    for (let i = 0; i < src.length; i++) {
      dest.push(src[i]);
    }
  };

  /**
   * Transforms something array-like to an actual Array.
   *
   * @function
   * @template T
   * @param {ArrayLike<T>|Iterable<T>} arraylike
   * @return {T}
   */
  const from = Array.from;

  const isArray = Array.isArray;

  /**
   * Utility functions for working with EcmaScript objects.
   *
   * @module object
   */

  /**
   * @param {Object<string,any>} obj
   */
  const keys$1 = Object.keys;

  /**
   * @param {Object<string,any>} obj
   * @param {function(any,string):any} f
   */
  const forEach = (obj, f) => {
    for (const key in obj) {
      f(obj[key], key);
    }
  };

  /**
   * @template R
   * @param {Object<string,any>} obj
   * @param {function(any,string):R} f
   * @return {Array<R>}
   */
  const map = (obj, f) => {
    const results = [];
    for (const key in obj) {
      results.push(f(obj[key], key));
    }
    return results
  };

  /**
   * @param {Object<string,any>} obj
   * @return {number}
   */
  const length$1 = obj => keys$1(obj).length;

  /**
   * @param {Object<string,any>} obj
   * @param {function(any,string):boolean} f
   * @return {boolean}
   */
  const every = (obj, f) => {
    for (const key in obj) {
      if (!f(obj[key], key)) {
        return false
      }
    }
    return true
  };

  /**
   * Calls `Object.prototype.hasOwnProperty`.
   *
   * @param {any} obj
   * @param {string|symbol} key
   * @return {boolean}
   */
  const hasProperty = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  /**
   * @param {Object<string,any>} a
   * @param {Object<string,any>} b
   * @return {boolean}
   */
  const equalFlat = (a, b) => a === b || (length$1(a) === length$1(b) && every(a, (val, key) => (val !== undefined || hasProperty(b, key)) && b[key] === val));

  /**
   * Common functions and function call helpers.
   *
   * @module function
   */

  /**
   * Calls all functions in `fs` with args. Only throws after all functions were called.
   *
   * @param {Array<function>} fs
   * @param {Array<any>} args
   */
  const callAll = (fs, args, i = 0) => {
    try {
      for (; i < fs.length; i++) {
        fs[i](...args);
      }
    } finally {
      if (i < fs.length) {
        callAll(fs, args, i + 1);
      }
    }
  };

  /**
   * @template T
   *
   * @param {T} a
   * @param {T} b
   * @return {boolean}
   */
  const equalityStrict = (a, b) => a === b;

  /**
   * @param {any} a
   * @param {any} b
   * @return {boolean}
   */
  const equalityDeep = (a, b) => {
    if (a == null || b == null) {
      return equalityStrict(a, b)
    }
    if (a.constructor !== b.constructor) {
      return false
    }
    if (a === b) {
      return true
    }
    switch (a.constructor) {
      case ArrayBuffer:
        a = new Uint8Array(a);
        b = new Uint8Array(b);
      // eslint-disable-next-line no-fallthrough
      case Uint8Array: {
        if (a.byteLength !== b.byteLength) {
          return false
        }
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            return false
          }
        }
        break
      }
      case Set: {
        if (a.size !== b.size) {
          return false
        }
        for (const value of a) {
          if (!b.has(value)) {
            return false
          }
        }
        break
      }
      case Map: {
        if (a.size !== b.size) {
          return false
        }
        for (const key of a.keys()) {
          if (!b.has(key) || !equalityDeep(a.get(key), b.get(key))) {
            return false
          }
        }
        break
      }
      case Object:
        if (length$1(a) !== length$1(b)) {
          return false
        }
        for (const key in a) {
          if (!hasProperty(a, key) || !equalityDeep(a[key], b[key])) {
            return false
          }
        }
        break
      case Array:
        if (a.length !== b.length) {
          return false
        }
        for (let i = 0; i < a.length; i++) {
          if (!equalityDeep(a[i], b[i])) {
            return false
          }
        }
        break
      default:
        return false
    }
    return true
  };

  /**
   * Isomorphic logging module with support for colors!
   *
   * @module logging
   */

  const BOLD = create$5();
  const UNBOLD = create$5();
  const BLUE = create$5();
  const GREY = create$5();
  const GREEN = create$5();
  const RED = create$5();
  const PURPLE = create$5();
  const ORANGE = create$5();
  const UNCOLOR = create$5();

  /**
   * @type {Object<Symbol,pair.Pair<string,string>>}
   */
  const _browserStyleMap = {
    [BOLD]: create$4('font-weight', 'bold'),
    [UNBOLD]: create$4('font-weight', 'normal'),
    [BLUE]: create$4('color', 'blue'),
    [GREEN]: create$4('color', 'green'),
    [GREY]: create$4('color', 'grey'),
    [RED]: create$4('color', 'red'),
    [PURPLE]: create$4('color', 'purple'),
    [ORANGE]: create$4('color', 'orange'), // not well supported in chrome when debugging node with inspector - TODO: deprecate
    [UNCOLOR]: create$4('color', 'black')
  };

  const _nodeStyleMap = {
    [BOLD]: '\u001b[1m',
    [UNBOLD]: '\u001b[2m',
    [BLUE]: '\x1b[34m',
    [GREEN]: '\x1b[32m',
    [GREY]: '\u001b[37m',
    [RED]: '\x1b[31m',
    [PURPLE]: '\x1b[35m',
    [ORANGE]: '\x1b[38;5;208m',
    [UNCOLOR]: '\x1b[0m'
  };

  /* istanbul ignore next */
  /**
   * @param {Array<string|Symbol|Object|number>} args
   * @return {Array<string|object|number>}
   */
  const computeBrowserLoggingArgs = args => {
    const strBuilder = [];
    const styles = [];
    const currentStyle = create$6();
    /**
     * @type {Array<string|Object|number>}
     */
    let logArgs = [];
    // try with formatting until we find something unsupported
    let i = 0;

    for (; i < args.length; i++) {
      const arg = args[i];
      // @ts-ignore
      const style = _browserStyleMap[arg];
      if (style !== undefined) {
        currentStyle.set(style.left, style.right);
      } else {
        if (arg.constructor === String || arg.constructor === Number) {
          const style = mapToStyleString(currentStyle);
          if (i > 0 || style.length > 0) {
            strBuilder.push('%c' + arg);
            styles.push(style);
          } else {
            strBuilder.push(arg);
          }
        } else {
          break
        }
      }
    }

    if (i > 0) {
      // create logArgs with what we have so far
      logArgs = styles;
      logArgs.unshift(strBuilder.join(''));
    }
    // append the rest
    for (; i < args.length; i++) {
      const arg = args[i];
      if (!(arg instanceof Symbol)) {
        logArgs.push(arg);
      }
    }
    return logArgs
  };

  /**
   * @param {Array<string|Symbol|Object|number>} args
   * @return {Array<string|object|number>}
   */
  const computeNodeLoggingArgs = args => {
    const strBuilder = [];
    const logArgs = [];

    // try with formatting until we find something unsupported
    let i = 0;

    for (; i < args.length; i++) {
      const arg = args[i];
      // @ts-ignore
      const style = _nodeStyleMap[arg];
      if (style !== undefined) {
        strBuilder.push(style);
      } else {
        if (arg.constructor === String || arg.constructor === Number) {
          strBuilder.push(arg);
        } else {
          break
        }
      }
    }
    if (i > 0) {
      // create logArgs with what we have so far
      strBuilder.push('\x1b[0m');
      logArgs.push(strBuilder.join(''));
    }
    // append the rest
    for (; i < args.length; i++) {
      const arg = args[i];
      /* istanbul ignore else */
      if (!(arg instanceof Symbol)) {
        logArgs.push(arg);
      }
    }
    return logArgs
  };

  /* istanbul ignore next */
  const computeLoggingArgs = isNode ? computeNodeLoggingArgs : computeBrowserLoggingArgs;

  /**
   * @param {Array<string|Symbol|Object|number>} args
   */
  const print = (...args) => {
    console.log(...computeLoggingArgs(args));
    /* istanbul ignore next */
    vconsoles.forEach(vc => vc.print(args));
  };

  /* istanbul ignore next */
  /**
   * @param {Error} err
   */
  const printError = err => {
    console.error(err);
    vconsoles.forEach(vc => vc.printError(err));
  };

  /* istanbul ignore next */
  /**
   * @param {string} url image location
   * @param {number} height height of the image in pixel
   */
  const printImg = (url, height) => {
    if (isBrowser) {
      console.log('%c                      ', `font-size: ${height}px; background-size: contain; background-repeat: no-repeat; background-image: url(${url})`);
      // console.log('%c                ', `font-size: ${height}x; background: url(${url}) no-repeat;`)
    }
    vconsoles.forEach(vc => vc.printImg(url, height));
  };

  /* istanbul ignore next */
  /**
   * @param {string} base64
   * @param {number} height
   */
  const printImgBase64 = (base64, height) => printImg(`data:image/gif;base64,${base64}`, height);

  /**
   * @param {Array<string|Symbol|Object|number>} args
   */
  const group = (...args) => {
    console.group(...computeLoggingArgs(args));
    /* istanbul ignore next */
    vconsoles.forEach(vc => vc.group(args));
  };

  /**
   * @param {Array<string|Symbol|Object|number>} args
   */
  const groupCollapsed = (...args) => {
    console.groupCollapsed(...computeLoggingArgs(args));
    /* istanbul ignore next */
    vconsoles.forEach(vc => vc.groupCollapsed(args));
  };

  const groupEnd = () => {
    console.groupEnd();
    /* istanbul ignore next */
    vconsoles.forEach(vc => vc.groupEnd());
  };

  const vconsoles = new Set();

  /* istanbul ignore next */
  /**
   * @param {Array<string|Symbol|Object|number>} args
   * @return {Array<Element>}
   */
  const _computeLineSpans = args => {
    const spans = [];
    const currentStyle = new Map();
    // try with formatting until we find something unsupported
    let i = 0;
    for (; i < args.length; i++) {
      const arg = args[i];
      // @ts-ignore
      const style = _browserStyleMap[arg];
      if (style !== undefined) {
        currentStyle.set(style.left, style.right);
      } else {
        if (arg.constructor === String || arg.constructor === Number) {
          // @ts-ignore
          const span = element('span', [create$4('style', mapToStyleString(currentStyle))], [text(arg)]);
          if (span.innerHTML === '') {
            span.innerHTML = '&nbsp;';
          }
          spans.push(span);
        } else {
          break
        }
      }
    }
    // append the rest
    for (; i < args.length; i++) {
      let content = args[i];
      if (!(content instanceof Symbol)) {
        if (content.constructor !== String && content.constructor !== Number) {
          content = ' ' + stringify(content) + ' ';
        }
        spans.push(element('span', [], [text(/** @type {string} */ (content))]));
      }
    }
    return spans
  };

  const lineStyle = 'font-family:monospace;border-bottom:1px solid #e2e2e2;padding:2px;';

  /* istanbul ignore next */
  class VConsole {
    /**
     * @param {Element} dom
     */
    constructor (dom) {
      this.dom = dom;
      /**
       * @type {Element}
       */
      this.ccontainer = this.dom;
      this.depth = 0;
      vconsoles.add(this);
    }

    /**
     * @param {Array<string|Symbol|Object|number>} args
     * @param {boolean} collapsed
     */
    group (args, collapsed = false) {
      enqueue(() => {
        const triangleDown = element('span', [create$4('hidden', collapsed), create$4('style', 'color:grey;font-size:120%;')], [text('▼')]);
        const triangleRight = element('span', [create$4('hidden', !collapsed), create$4('style', 'color:grey;font-size:125%;')], [text('▶')]);
        const content = element('div', [create$4('style', `${lineStyle};padding-left:${this.depth * 10}px`)], [triangleDown, triangleRight, text(' ')].concat(_computeLineSpans(args)));
        const nextContainer = element('div', [create$4('hidden', collapsed)]);
        const nextLine = element('div', [], [content, nextContainer]);
        append(this.ccontainer, [nextLine]);
        this.ccontainer = nextContainer;
        this.depth++;
        // when header is clicked, collapse/uncollapse container
        addEventListener(content, 'click', event => {
          nextContainer.toggleAttribute('hidden');
          triangleDown.toggleAttribute('hidden');
          triangleRight.toggleAttribute('hidden');
        });
      });
    }

    /**
     * @param {Array<string|Symbol|Object|number>} args
     */
    groupCollapsed (args) {
      this.group(args, true);
    }

    groupEnd () {
      enqueue(() => {
        if (this.depth > 0) {
          this.depth--;
          // @ts-ignore
          this.ccontainer = this.ccontainer.parentElement.parentElement;
        }
      });
    }

    /**
     * @param {Array<string|Symbol|Object|number>} args
     */
    print (args) {
      enqueue(() => {
        append(this.ccontainer, [element('div', [create$4('style', `${lineStyle};padding-left:${this.depth * 10}px`)], _computeLineSpans(args))]);
      });
    }

    /**
     * @param {Error} err
     */
    printError (err) {
      this.print([RED, BOLD, err.toString()]);
    }

    /**
     * @param {string} url
     * @param {number} height
     */
    printImg (url, height) {
      enqueue(() => {
        append(this.ccontainer, [element('img', [create$4('src', url), create$4('height', `${round(height * 1.5)}px`)])]);
      });
    }

    /**
     * @param {Node} node
     */
    printDom (node) {
      enqueue(() => {
        append(this.ccontainer, [node]);
      });
    }

    destroy () {
      enqueue(() => {
        vconsoles.delete(this);
      });
    }
  }

  /* istanbul ignore next */
  /**
   * @param {Element} dom
   */
  const createVConsole = dom => new VConsole(dom);

  /**
   * Efficient diffs.
   *
   * @module diff
   */

  /**
   * A SimpleDiff describes a change on a String.
   *
   * ```js
   * console.log(a) // the old value
   * console.log(b) // the updated value
   * // Apply changes of diff (pseudocode)
   * a.remove(diff.index, diff.remove) // Remove `diff.remove` characters
   * a.insert(diff.index, diff.insert) // Insert `diff.insert`
   * a === b // values match
   * ```
   *
   * @typedef {Object} SimpleDiff
   * @property {Number} index The index where changes were applied
   * @property {Number} remove The number of characters to delete starting
   *                                  at `index`.
   * @property {T} insert The new text to insert at `index` after applying
   *                           `delete`
   *
   * @template T
   */

  /**
   * Create a diff between two strings. This diff implementation is highly
   * efficient, but not very sophisticated.
   *
   * @function
   *
   * @param {string} a The old version of the string
   * @param {string} b The updated version of the string
   * @return {SimpleDiff<string>} The diff description.
   */
  const simpleDiffString = (a, b) => {
    let left = 0; // number of same characters counting from left
    let right = 0; // number of same characters counting from right
    while (left < a.length && left < b.length && a[left] === b[left]) {
      left++;
    }
    while (right + left < a.length && right + left < b.length && a[a.length - right - 1] === b[b.length - right - 1]) {
      right++;
    }
    return {
      index: left,
      remove: a.length - left - right,
      insert: b.slice(left, b.length - right)
    }
  };

  /**
   * @todo Remove in favor of simpleDiffString
   * @deprecated
   */
  const simpleDiff = simpleDiffString;

  /* eslint-env browser */

  /**
   * Binary data constants.
   *
   * @module binary
   */

  /**
   * n-th bit activated.
   *
   * @type {number}
   */
  const BIT1 = 1;
  const BIT2 = 2;
  const BIT3 = 4;
  const BIT4 = 8;
  const BIT6 = 32;
  const BIT7 = 64;
  const BIT8 = 128;
  const BITS5 = 31;
  const BITS6 = 63;
  const BITS7 = 127;
  /**
   * @type {number}
   */
  const BITS31 = 0x7FFFFFFF;
  /**
   * @type {number}
   */
  const BITS32 = 0xFFFFFFFF;

  /* eslint-env browser */
  const performance = typeof window === 'undefined' ? null : (typeof window.performance !== 'undefined' && window.performance) || null;

  const isoCrypto = typeof crypto === 'undefined' ? null : crypto;

  /**
   * @type {function(number):ArrayBuffer}
   */
  const cryptoRandomBuffer = isoCrypto !== null
    ? len => {
      // browser
      const buf = new ArrayBuffer(len);
      const arr = new Uint8Array(buf);
      isoCrypto.getRandomValues(arr);
      return buf
    }
    : len => {
      // polyfill
      const buf = new ArrayBuffer(len);
      const arr = new Uint8Array(buf);
      for (let i = 0; i < len; i++) {
        arr[i] = Math.ceil((Math.random() * 0xFFFFFFFF) >>> 0);
      }
      return buf
    };

  const rand = Math.random;

  const uint32 = () => new Uint32Array(cryptoRandomBuffer(4))[0];

  /**
   * @template T
   * @param {Array<T>} arr
   * @return {T}
   */
  const oneOf$1 = arr => arr[floor(rand() * arr.length)];

  // @ts-ignore
  const uuidv4Template = [1e7] + -1e3 + -4e3 + -8e3 + -1e11;
  const uuidv4 = () => uuidv4Template.replace(/[018]/g, /** @param {number} c */ c =>
    (c ^ uint32() & 15 >> c / 4).toString(16)
  );

  /**
   * @module prng
   */

  /**
   * Xorshift32 is a very simple but elegang PRNG with a period of `2^32-1`.
   */
  class Xorshift32 {
    /**
     * @param {number} seed Unsigned 32 bit number
     */
    constructor (seed) {
      this.seed = seed;
      /**
       * @type {number}
       */
      this._state = seed;
    }

    /**
     * Generate a random signed integer.
     *
     * @return {Number} A 32 bit signed integer.
     */
    next () {
      let x = this._state;
      x ^= x << 13;
      x ^= x >> 17;
      x ^= x << 5;
      this._state = x;
      return (x >>> 0) / (BITS32 + 1)
    }
  }

  /**
   * @module prng
   */

  /**
   * This is a variant of xoroshiro128plus - the fastest full-period generator passing BigCrush without systematic failures.
   *
   * This implementation follows the idea of the original xoroshiro128plus implementation,
   * but is optimized for the JavaScript runtime. I.e.
   * * The operations are performed on 32bit integers (the original implementation works with 64bit values).
   * * The initial 128bit state is computed based on a 32bit seed and Xorshift32.
   * * This implementation returns two 32bit values based on the 64bit value that is computed by xoroshiro128plus.
   *   Caution: The last addition step works slightly different than in the original implementation - the add carry of the
   *   first 32bit addition is not carried over to the last 32bit.
   *
   * [Reference implementation](http://vigna.di.unimi.it/xorshift/xoroshiro128plus.c)
   */
  class Xoroshiro128plus {
    /**
     * @param {number} seed Unsigned 32 bit number
     */
    constructor (seed) {
      this.seed = seed;
      // This is a variant of Xoroshiro128plus to fill the initial state
      const xorshift32 = new Xorshift32(seed);
      this.state = new Uint32Array(4);
      for (let i = 0; i < 4; i++) {
        this.state[i] = xorshift32.next() * BITS32;
      }
      this._fresh = true;
    }

    /**
     * @return {number} Float/Double in [0,1)
     */
    next () {
      const state = this.state;
      if (this._fresh) {
        this._fresh = false;
        return ((state[0] + state[2]) >>> 0) / (BITS32 + 1)
      } else {
        this._fresh = true;
        const s0 = state[0];
        const s1 = state[1];
        const s2 = state[2] ^ s0;
        const s3 = state[3] ^ s1;
        // function js_rotl (x, k) {
        //   k = k - 32
        //   const x1 = x[0]
        //   const x2 = x[1]
        //   x[0] = x2 << k | x1 >>> (32 - k)
        //   x[1] = x1 << k | x2 >>> (32 - k)
        // }
        // rotl(s0, 55) // k = 23 = 55 - 32; j = 9 =  32 - 23
        state[0] = (s1 << 23 | s0 >>> 9) ^ s2 ^ (s2 << 14 | s3 >>> 18);
        state[1] = (s0 << 23 | s1 >>> 9) ^ s3 ^ (s3 << 14);
        // rol(s1, 36) // k = 4 = 36 - 32; j = 23 = 32 - 9
        state[2] = s3 << 4 | s2 >>> 28;
        state[3] = s2 << 4 | s3 >>> 28;
        return (((state[1] + state[3]) >>> 0) / (BITS32 + 1))
      }
    }
  }

  /*
  // Reference implementation
  // Source: http://vigna.di.unimi.it/xorshift/xoroshiro128plus.c
  // By David Blackman and Sebastiano Vigna
  // Who published the reference implementation under Public Domain (CC0)

  #include <stdint.h>
  #include <stdio.h>

  uint64_t s[2];

  static inline uint64_t rotl(const uint64_t x, int k) {
      return (x << k) | (x >> (64 - k));
  }

  uint64_t next(void) {
      const uint64_t s0 = s[0];
      uint64_t s1 = s[1];
      s1 ^= s0;
      s[0] = rotl(s0, 55) ^ s1 ^ (s1 << 14); // a, b
      s[1] = rotl(s1, 36); // c
      return (s[0] + s[1]) & 0xFFFFFFFF;
  }

  int main(void)
  {
      int i;
      s[0] = 1111 | (1337ul << 32);
      s[1] = 1234 | (9999ul << 32);

      printf("1000 outputs of genrand_int31()\n");
      for (i=0; i<100; i++) {
          printf("%10lu ", i);
          printf("%10lu ", next());
          printf("- %10lu ", s[0] >> 32);
          printf("%10lu ", (s[0] << 32) >> 32);
          printf("%10lu ", s[1] >> 32);
          printf("%10lu ", (s[1] << 32) >> 32);
          printf("\n");
          // if (i%5==4) printf("\n");
      }
      return 0;
  }
  */

  /**
   * Utility helpers for working with numbers.
   *
   * @module number
   */

  const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

  /**
   * @module number
   */

  /* istanbul ignore next */
  const isInteger = Number.isInteger || (num => typeof num === 'number' && isFinite(num) && floor(num) === num);

  /**
   * Efficient schema-less binary encoding with support for variable length encoding.
   *
   * Use [lib0/encoding] with [lib0/decoding]. Every encoding function has a corresponding decoding function.
   *
   * Encodes numbers in little-endian order (least to most significant byte order)
   * and is compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
   * which is also used in Protocol Buffers.
   *
   * ```js
   * // encoding step
   * const encoder = new encoding.createEncoder()
   * encoding.writeVarUint(encoder, 256)
   * encoding.writeVarString(encoder, 'Hello world!')
   * const buf = encoding.toUint8Array(encoder)
   * ```
   *
   * ```js
   * // decoding step
   * const decoder = new decoding.createDecoder(buf)
   * decoding.readVarUint(decoder) // => 256
   * decoding.readVarString(decoder) // => 'Hello world!'
   * decoding.hasContent(decoder) // => false - all data is read
   * ```
   *
   * @module encoding
   */

  /**
   * A BinaryEncoder handles the encoding to an Uint8Array.
   */
  class Encoder {
    constructor () {
      this.cpos = 0;
      this.cbuf = new Uint8Array(100);
      /**
       * @type {Array<Uint8Array>}
       */
      this.bufs = [];
    }
  }

  /**
   * @function
   * @return {Encoder}
   */
  const createEncoder = () => new Encoder();

  /**
   * The current length of the encoded data.
   *
   * @function
   * @param {Encoder} encoder
   * @return {number}
   */
  const length = encoder => {
    let len = encoder.cpos;
    for (let i = 0; i < encoder.bufs.length; i++) {
      len += encoder.bufs[i].length;
    }
    return len
  };

  /**
   * Transform to Uint8Array.
   *
   * @function
   * @param {Encoder} encoder
   * @return {Uint8Array} The created ArrayBuffer.
   */
  const toUint8Array = encoder => {
    const uint8arr = new Uint8Array(length(encoder));
    let curPos = 0;
    for (let i = 0; i < encoder.bufs.length; i++) {
      const d = encoder.bufs[i];
      uint8arr.set(d, curPos);
      curPos += d.length;
    }
    uint8arr.set(createUint8ArrayViewFromArrayBuffer(encoder.cbuf.buffer, 0, encoder.cpos), curPos);
    return uint8arr
  };

  /**
   * Verify that it is possible to write `len` bytes wtihout checking. If
   * necessary, a new Buffer with the required length is attached.
   *
   * @param {Encoder} encoder
   * @param {number} len
   */
  const verifyLen = (encoder, len) => {
    const bufferLen = encoder.cbuf.length;
    if (bufferLen - encoder.cpos < len) {
      encoder.bufs.push(createUint8ArrayViewFromArrayBuffer(encoder.cbuf.buffer, 0, encoder.cpos));
      encoder.cbuf = new Uint8Array(max(bufferLen, len) * 2);
      encoder.cpos = 0;
    }
  };

  /**
   * Write one byte to the encoder.
   *
   * @function
   * @param {Encoder} encoder
   * @param {number} num The byte that is to be encoded.
   */
  const write = (encoder, num) => {
    const bufferLen = encoder.cbuf.length;
    if (encoder.cpos === bufferLen) {
      encoder.bufs.push(encoder.cbuf);
      encoder.cbuf = new Uint8Array(bufferLen * 2);
      encoder.cpos = 0;
    }
    encoder.cbuf[encoder.cpos++] = num;
  };

  /**
   * Write one byte as an unsigned integer.
   *
   * @function
   * @param {Encoder} encoder
   * @param {number} num The number that is to be encoded.
   */
  const writeUint8 = write;

  /**
   * Write a variable length unsigned integer. Max encodable integer is 2^53.
   *
   * @function
   * @param {Encoder} encoder
   * @param {number} num The number that is to be encoded.
   */
  const writeVarUint = (encoder, num) => {
    while (num > BITS7) {
      write(encoder, BIT8 | (BITS7 & num));
      num = floor(num / 128); // shift >>> 7
    }
    write(encoder, BITS7 & num);
  };

  /**
   * Write a variable length integer.
   *
   * We use the 7th bit instead for signaling that this is a negative number.
   *
   * @function
   * @param {Encoder} encoder
   * @param {number} num The number that is to be encoded.
   */
  const writeVarInt = (encoder, num) => {
    const isNegative = isNegativeZero(num);
    if (isNegative) {
      num = -num;
    }
    //             |- whether to continue reading         |- whether is negative     |- number
    write(encoder, (num > BITS6 ? BIT8 : 0) | (isNegative ? BIT7 : 0) | (BITS6 & num));
    num = floor(num / 64); // shift >>> 6
    // We don't need to consider the case of num === 0 so we can use a different
    // pattern here than above.
    while (num > 0) {
      write(encoder, (num > BITS7 ? BIT8 : 0) | (BITS7 & num));
      num = floor(num / 128); // shift >>> 7
    }
  };

  /**
   * A cache to store strings temporarily
   */
  const _strBuffer = new Uint8Array(30000);
  const _maxStrBSize = _strBuffer.length / 3;

  /**
   * Write a variable length string.
   *
   * @function
   * @param {Encoder} encoder
   * @param {String} str The string that is to be encoded.
   */
  const _writeVarStringNative = (encoder, str) => {
    if (str.length < _maxStrBSize) {
      // We can encode the string into the existing buffer
      /* istanbul ignore else */
      const written = utf8TextEncoder.encodeInto(str, _strBuffer).written || 0;
      writeVarUint(encoder, written);
      for (let i = 0; i < written; i++) {
        write(encoder, _strBuffer[i]);
      }
    } else {
      writeVarUint8Array(encoder, encodeUtf8(str));
    }
  };

  /**
   * Write a variable length string.
   *
   * @function
   * @param {Encoder} encoder
   * @param {String} str The string that is to be encoded.
   */
  const _writeVarStringPolyfill = (encoder, str) => {
    const encodedString = unescape(encodeURIComponent(str));
    const len = encodedString.length;
    writeVarUint(encoder, len);
    for (let i = 0; i < len; i++) {
      write(encoder, /** @type {number} */ (encodedString.codePointAt(i)));
    }
  };

  /**
   * Write a variable length string.
   *
   * @function
   * @param {Encoder} encoder
   * @param {String} str The string that is to be encoded.
   */
  /* istanbul ignore next */
  const writeVarString = utf8TextEncoder ? _writeVarStringNative : _writeVarStringPolyfill;

  /**
   * Write the content of another Encoder.
   *
   * @TODO: can be improved!
   *        - Note: Should consider that when appending a lot of small Encoders, we should rather clone than referencing the old structure.
   *                Encoders start with a rather big initial buffer.
   *
   * @function
   * @param {Encoder} encoder The enUint8Arr
   * @param {Encoder} append The BinaryEncoder to be written.
   */
  const writeBinaryEncoder = (encoder, append) => writeUint8Array(encoder, toUint8Array(append));

  /**
   * Append fixed-length Uint8Array to the encoder.
   *
   * @function
   * @param {Encoder} encoder
   * @param {Uint8Array} uint8Array
   */
  const writeUint8Array = (encoder, uint8Array) => {
    const bufferLen = encoder.cbuf.length;
    const cpos = encoder.cpos;
    const leftCopyLen = min(bufferLen - cpos, uint8Array.length);
    const rightCopyLen = uint8Array.length - leftCopyLen;
    encoder.cbuf.set(uint8Array.subarray(0, leftCopyLen), cpos);
    encoder.cpos += leftCopyLen;
    if (rightCopyLen > 0) {
      // Still something to write, write right half..
      // Append new buffer
      encoder.bufs.push(encoder.cbuf);
      // must have at least size of remaining buffer
      encoder.cbuf = new Uint8Array(max(bufferLen * 2, rightCopyLen));
      // copy array
      encoder.cbuf.set(uint8Array.subarray(leftCopyLen));
      encoder.cpos = rightCopyLen;
    }
  };

  /**
   * Append an Uint8Array to Encoder.
   *
   * @function
   * @param {Encoder} encoder
   * @param {Uint8Array} uint8Array
   */
  const writeVarUint8Array = (encoder, uint8Array) => {
    writeVarUint(encoder, uint8Array.byteLength);
    writeUint8Array(encoder, uint8Array);
  };

  /**
   * Create an DataView of the next `len` bytes. Use it to write data after
   * calling this function.
   *
   * ```js
   * // write float32 using DataView
   * const dv = writeOnDataView(encoder, 4)
   * dv.setFloat32(0, 1.1)
   * // read float32 using DataView
   * const dv = readFromDataView(encoder, 4)
   * dv.getFloat32(0) // => 1.100000023841858 (leaving it to the reader to find out why this is the correct result)
   * ```
   *
   * @param {Encoder} encoder
   * @param {number} len
   * @return {DataView}
   */
  const writeOnDataView = (encoder, len) => {
    verifyLen(encoder, len);
    const dview = new DataView(encoder.cbuf.buffer, encoder.cpos, len);
    encoder.cpos += len;
    return dview
  };

  /**
   * @param {Encoder} encoder
   * @param {number} num
   */
  const writeFloat32 = (encoder, num) => writeOnDataView(encoder, 4).setFloat32(0, num, false);

  /**
   * @param {Encoder} encoder
   * @param {number} num
   */
  const writeFloat64 = (encoder, num) => writeOnDataView(encoder, 8).setFloat64(0, num, false);

  /**
   * @param {Encoder} encoder
   * @param {bigint} num
   */
  const writeBigInt64 = (encoder, num) => /** @type {any} */ (writeOnDataView(encoder, 8)).setBigInt64(0, num, false);

  const floatTestBed = new DataView(new ArrayBuffer(4));
  /**
   * Check if a number can be encoded as a 32 bit float.
   *
   * @param {number} num
   * @return {boolean}
   */
  const isFloat32 = num => {
    floatTestBed.setFloat32(0, num);
    return floatTestBed.getFloat32(0) === num
  };

  /**
   * Encode data with efficient binary format.
   *
   * Differences to JSON:
   * • Transforms data to a binary format (not to a string)
   * • Encodes undefined, NaN, and ArrayBuffer (these can't be represented in JSON)
   * • Numbers are efficiently encoded either as a variable length integer, as a
   *   32 bit float, as a 64 bit float, or as a 64 bit bigint.
   *
   * Encoding table:
   *
   * | Data Type           | Prefix   | Encoding Method    | Comment |
   * | ------------------- | -------- | ------------------ | ------- |
   * | undefined           | 127      |                    | Functions, symbol, and everything that cannot be identified is encoded as undefined |
   * | null                | 126      |                    | |
   * | integer             | 125      | writeVarInt        | Only encodes 32 bit signed integers |
   * | float32             | 124      | writeFloat32       | |
   * | float64             | 123      | writeFloat64       | |
   * | bigint              | 122      | writeBigInt64      | |
   * | boolean (false)     | 121      |                    | True and false are different data types so we save the following byte |
   * | boolean (true)      | 120      |                    | - 0b01111000 so the last bit determines whether true or false |
   * | string              | 119      | writeVarString     | |
   * | object<string,any>  | 118      | custom             | Writes {length} then {length} key-value pairs |
   * | array<any>          | 117      | custom             | Writes {length} then {length} json values |
   * | Uint8Array          | 116      | writeVarUint8Array | We use Uint8Array for any kind of binary data |
   *
   * Reasons for the decreasing prefix:
   * We need the first bit for extendability (later we may want to encode the
   * prefix with writeVarUint). The remaining 7 bits are divided as follows:
   * [0-30]   the beginning of the data range is used for custom purposes
   *          (defined by the function that uses this library)
   * [31-127] the end of the data range is used for data encoding by
   *          lib0/encoding.js
   *
   * @param {Encoder} encoder
   * @param {undefined|null|number|bigint|boolean|string|Object<string,any>|Array<any>|Uint8Array} data
   */
  const writeAny = (encoder, data) => {
    switch (typeof data) {
      case 'string':
        // TYPE 119: STRING
        write(encoder, 119);
        writeVarString(encoder, data);
        break
      case 'number':
        if (isInteger(data) && abs(data) <= BITS31) {
          // TYPE 125: INTEGER
          write(encoder, 125);
          writeVarInt(encoder, data);
        } else if (isFloat32(data)) {
          // TYPE 124: FLOAT32
          write(encoder, 124);
          writeFloat32(encoder, data);
        } else {
          // TYPE 123: FLOAT64
          write(encoder, 123);
          writeFloat64(encoder, data);
        }
        break
      case 'bigint':
        // TYPE 122: BigInt
        write(encoder, 122);
        writeBigInt64(encoder, data);
        break
      case 'object':
        if (data === null) {
          // TYPE 126: null
          write(encoder, 126);
        } else if (data instanceof Array) {
          // TYPE 117: Array
          write(encoder, 117);
          writeVarUint(encoder, data.length);
          for (let i = 0; i < data.length; i++) {
            writeAny(encoder, data[i]);
          }
        } else if (data instanceof Uint8Array) {
          // TYPE 116: ArrayBuffer
          write(encoder, 116);
          writeVarUint8Array(encoder, data);
        } else {
          // TYPE 118: Object
          write(encoder, 118);
          const keys = Object.keys(data);
          writeVarUint(encoder, keys.length);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            writeVarString(encoder, key);
            writeAny(encoder, data[key]);
          }
        }
        break
      case 'boolean':
        // TYPE 120/121: boolean (true/false)
        write(encoder, data ? 120 : 121);
        break
      default:
        // TYPE 127: undefined
        write(encoder, 127);
    }
  };

  /**
   * Now come a few stateful encoder that have their own classes.
   */

  /**
   * Basic Run Length Encoder - a basic compression implementation.
   *
   * Encodes [1,1,1,7] to [1,3,7,1] (3 times 1, 1 time 7). This encoder might do more harm than good if there are a lot of values that are not repeated.
   *
   * It was originally used for image compression. Cool .. article http://csbruce.com/cbm/transactor/pdfs/trans_v7_i06.pdf
   *
   * @note T must not be null!
   *
   * @template T
   */
  class RleEncoder extends Encoder {
    /**
     * @param {function(Encoder, T):void} writer
     */
    constructor (writer) {
      super();
      /**
       * The writer
       */
      this.w = writer;
      /**
       * Current state
       * @type {T|null}
       */
      this.s = null;
      this.count = 0;
    }

    /**
     * @param {T} v
     */
    write (v) {
      if (this.s === v) {
        this.count++;
      } else {
        if (this.count > 0) {
          // flush counter, unless this is the first value (count = 0)
          writeVarUint(this, this.count - 1); // since count is always > 0, we can decrement by one. non-standard encoding ftw
        }
        this.count = 1;
        // write first value
        this.w(this, v);
        this.s = v;
      }
    }
  }

  /**
   * @param {UintOptRleEncoder} encoder
   */
  const flushUintOptRleEncoder = encoder => {
    /* istanbul ignore else */
    if (encoder.count > 0) {
      // flush counter, unless this is the first value (count = 0)
      // case 1: just a single value. set sign to positive
      // case 2: write several values. set sign to negative to indicate that there is a length coming
      writeVarInt(encoder.encoder, encoder.count === 1 ? encoder.s : -encoder.s);
      if (encoder.count > 1) {
        writeVarUint(encoder.encoder, encoder.count - 2); // since count is always > 1, we can decrement by one. non-standard encoding ftw
      }
    }
  };

  /**
   * Optimized Rle encoder that does not suffer from the mentioned problem of the basic Rle encoder.
   *
   * Internally uses VarInt encoder to write unsigned integers. If the input occurs multiple times, we write
   * write it as a negative number. The UintOptRleDecoder then understands that it needs to read a count.
   *
   * Encodes [1,2,3,3,3] as [1,2,-3,3] (once 1, once 2, three times 3)
   */
  class UintOptRleEncoder {
    constructor () {
      this.encoder = new Encoder();
      /**
       * @type {number}
       */
      this.s = 0;
      this.count = 0;
    }

    /**
     * @param {number} v
     */
    write (v) {
      if (this.s === v) {
        this.count++;
      } else {
        flushUintOptRleEncoder(this);
        this.count = 1;
        this.s = v;
      }
    }

    toUint8Array () {
      flushUintOptRleEncoder(this);
      return toUint8Array(this.encoder)
    }
  }

  /**
   * @param {IntDiffOptRleEncoder} encoder
   */
  const flushIntDiffOptRleEncoder = encoder => {
    if (encoder.count > 0) {
      //          31 bit making up the diff | wether to write the counter
      // const encodedDiff = encoder.diff << 1 | (encoder.count === 1 ? 0 : 1)
      const encodedDiff = encoder.diff * 2 + (encoder.count === 1 ? 0 : 1);
      // flush counter, unless this is the first value (count = 0)
      // case 1: just a single value. set first bit to positive
      // case 2: write several values. set first bit to negative to indicate that there is a length coming
      writeVarInt(encoder.encoder, encodedDiff);
      if (encoder.count > 1) {
        writeVarUint(encoder.encoder, encoder.count - 2); // since count is always > 1, we can decrement by one. non-standard encoding ftw
      }
    }
  };

  /**
   * A combination of the IntDiffEncoder and the UintOptRleEncoder.
   *
   * The count approach is similar to the UintDiffOptRleEncoder, but instead of using the negative bitflag, it encodes
   * in the LSB whether a count is to be read. Therefore this Encoder only supports 31 bit integers!
   *
   * Encodes [1, 2, 3, 2] as [3, 1, 6, -1] (more specifically [(1 << 1) | 1, (3 << 0) | 0, -1])
   *
   * Internally uses variable length encoding. Contrary to normal UintVar encoding, the first byte contains:
   * * 1 bit that denotes whether the next value is a count (LSB)
   * * 1 bit that denotes whether this value is negative (MSB - 1)
   * * 1 bit that denotes whether to continue reading the variable length integer (MSB)
   *
   * Therefore, only five bits remain to encode diff ranges.
   *
   * Use this Encoder only when appropriate. In most cases, this is probably a bad idea.
   */
  class IntDiffOptRleEncoder {
    constructor () {
      this.encoder = new Encoder();
      /**
       * @type {number}
       */
      this.s = 0;
      this.count = 0;
      this.diff = 0;
    }

    /**
     * @param {number} v
     */
    write (v) {
      if (this.diff === v - this.s) {
        this.s = v;
        this.count++;
      } else {
        flushIntDiffOptRleEncoder(this);
        this.count = 1;
        this.diff = v - this.s;
        this.s = v;
      }
    }

    toUint8Array () {
      flushIntDiffOptRleEncoder(this);
      return toUint8Array(this.encoder)
    }
  }

  /**
   * Optimized String Encoder.
   *
   * Encoding many small strings in a simple Encoder is not very efficient. The function call to decode a string takes some time and creates references that must be eventually deleted.
   * In practice, when decoding several million small strings, the GC will kick in more and more often to collect orphaned string objects (or maybe there is another reason?).
   *
   * This string encoder solves the above problem. All strings are concatenated and written as a single string using a single encoding call.
   *
   * The lengths are encoded using a UintOptRleEncoder.
   */
  class StringEncoder {
    constructor () {
      /**
       * @type {Array<string>}
       */
      this.sarr = [];
      this.s = '';
      this.lensE = new UintOptRleEncoder();
    }

    /**
     * @param {string} string
     */
    write (string) {
      this.s += string;
      if (this.s.length > 19) {
        this.sarr.push(this.s);
        this.s = '';
      }
      this.lensE.write(string.length);
    }

    toUint8Array () {
      const encoder = new Encoder();
      this.sarr.push(this.s);
      this.s = '';
      writeVarString(encoder, this.sarr.join(''));
      writeUint8Array(encoder, this.lensE.toUint8Array());
      return toUint8Array(encoder)
    }
  }

  /**
   * Efficient schema-less binary decoding with support for variable length encoding.
   *
   * Use [lib0/decoding] with [lib0/encoding]. Every encoding function has a corresponding decoding function.
   *
   * Encodes numbers in little-endian order (least to most significant byte order)
   * and is compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
   * which is also used in Protocol Buffers.
   *
   * ```js
   * // encoding step
   * const encoder = new encoding.createEncoder()
   * encoding.writeVarUint(encoder, 256)
   * encoding.writeVarString(encoder, 'Hello world!')
   * const buf = encoding.toUint8Array(encoder)
   * ```
   *
   * ```js
   * // decoding step
   * const decoder = new decoding.createDecoder(buf)
   * decoding.readVarUint(decoder) // => 256
   * decoding.readVarString(decoder) // => 'Hello world!'
   * decoding.hasContent(decoder) // => false - all data is read
   * ```
   *
   * @module decoding
   */

  /**
   * A Decoder handles the decoding of an Uint8Array.
   */
  class Decoder {
    /**
     * @param {Uint8Array} uint8Array Binary data to decode
     */
    constructor (uint8Array) {
      /**
       * Decoding target.
       *
       * @type {Uint8Array}
       */
      this.arr = uint8Array;
      /**
       * Current decoding position.
       *
       * @type {number}
       */
      this.pos = 0;
    }
  }

  /**
   * @function
   * @param {Uint8Array} uint8Array
   * @return {Decoder}
   */
  const createDecoder = uint8Array => new Decoder(uint8Array);

  /**
   * @function
   * @param {Decoder} decoder
   * @return {boolean}
   */
  const hasContent = decoder => decoder.pos !== decoder.arr.length;

  /**
   * Create an Uint8Array view of the next `len` bytes and advance the position by `len`.
   *
   * Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
   *            Use `buffer.copyUint8Array` to copy the result into a new Uint8Array.
   *
   * @function
   * @param {Decoder} decoder The decoder instance
   * @param {number} len The length of bytes to read
   * @return {Uint8Array}
   */
  const readUint8Array = (decoder, len) => {
    const view = createUint8ArrayViewFromArrayBuffer(decoder.arr.buffer, decoder.pos + decoder.arr.byteOffset, len);
    decoder.pos += len;
    return view
  };

  /**
   * Read variable length Uint8Array.
   *
   * Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
   *            Use `buffer.copyUint8Array` to copy the result into a new Uint8Array.
   *
   * @function
   * @param {Decoder} decoder
   * @return {Uint8Array}
   */
  const readVarUint8Array = decoder => readUint8Array(decoder, readVarUint(decoder));

  /**
   * Read one byte as unsigned integer.
   * @function
   * @param {Decoder} decoder The decoder instance
   * @return {number} Unsigned 8-bit integer
   */
  const readUint8 = decoder => decoder.arr[decoder.pos++];

  /**
   * Read unsigned integer (32bit) with variable length.
   * 1/8th of the storage is used as encoding overhead.
   *  * numbers < 2^7 is stored in one bytlength
   *  * numbers < 2^14 is stored in two bylength
   *
   * @function
   * @param {Decoder} decoder
   * @return {number} An unsigned integer.length
   */
  const readVarUint = decoder => {
    let num = 0;
    let mult = 1;
    while (true) {
      const r = decoder.arr[decoder.pos++];
      // num = num | ((r & binary.BITS7) << len)
      num = num + (r & BITS7) * mult; // shift $r << (7*#iterations) and add it to num
      mult *= 128; // next iteration, shift 7 "more" to the left
      if (r < BIT8) {
        return num
      }
      /* istanbul ignore if */
      if (num > MAX_SAFE_INTEGER) {
        throw new Error('Integer out of range!')
      }
    }
  };

  /**
   * Read signed integer (32bit) with variable length.
   * 1/8th of the storage is used as encoding overhead.
   *  * numbers < 2^7 is stored in one bytlength
   *  * numbers < 2^14 is stored in two bylength
   * @todo This should probably create the inverse ~num if number is negative - but this would be a breaking change.
   *
   * @function
   * @param {Decoder} decoder
   * @return {number} An unsigned integer.length
   */
  const readVarInt = decoder => {
    let r = decoder.arr[decoder.pos++];
    let num = r & BITS6;
    let mult = 64;
    const sign = (r & BIT7) > 0 ? -1 : 1;
    if ((r & BIT8) === 0) {
      // don't continue reading
      return sign * num
    }
    while (true) {
      r = decoder.arr[decoder.pos++];
      // num = num | ((r & binary.BITS7) << len)
      num = num + (r & BITS7) * mult;
      mult *= 128;
      if (r < BIT8) {
        return sign * num
      }
      /* istanbul ignore if */
      if (num > MAX_SAFE_INTEGER) {
        throw new Error('Integer out of range!')
      }
    }
  };

  /**
   * We don't test this function anymore as we use native decoding/encoding by default now.
   * Better not modify this anymore..
   *
   * Transforming utf8 to a string is pretty expensive. The code performs 10x better
   * when String.fromCodePoint is fed with all characters as arguments.
   * But most environments have a maximum number of arguments per functions.
   * For effiency reasons we apply a maximum of 10000 characters at once.
   *
   * @function
   * @param {Decoder} decoder
   * @return {String} The read String.
   */
  /* istanbul ignore next */
  const _readVarStringPolyfill = decoder => {
    let remainingLen = readVarUint(decoder);
    if (remainingLen === 0) {
      return ''
    } else {
      let encodedString = String.fromCodePoint(readUint8(decoder)); // remember to decrease remainingLen
      if (--remainingLen < 100) { // do not create a Uint8Array for small strings
        while (remainingLen--) {
          encodedString += String.fromCodePoint(readUint8(decoder));
        }
      } else {
        while (remainingLen > 0) {
          const nextLen = remainingLen < 10000 ? remainingLen : 10000;
          // this is dangerous, we create a fresh array view from the existing buffer
          const bytes = decoder.arr.subarray(decoder.pos, decoder.pos + nextLen);
          decoder.pos += nextLen;
          // Starting with ES5.1 we can supply a generic array-like object as arguments
          encodedString += String.fromCodePoint.apply(null, /** @type {any} */ (bytes));
          remainingLen -= nextLen;
        }
      }
      return decodeURIComponent(escape(encodedString))
    }
  };

  /**
   * @function
   * @param {Decoder} decoder
   * @return {String} The read String
   */
  const _readVarStringNative = decoder =>
    /** @type any */ (utf8TextDecoder).decode(readVarUint8Array(decoder));

  /**
   * Read string of variable length
   * * varUint is used to store the length of the string
   *
   * @function
   * @param {Decoder} decoder
   * @return {String} The read String
   *
   */
  /* istanbul ignore next */
  const readVarString = utf8TextDecoder ? _readVarStringNative : _readVarStringPolyfill;

  /**
   * @param {Decoder} decoder
   * @param {number} len
   * @return {DataView}
   */
  const readFromDataView = (decoder, len) => {
    const dv = new DataView(decoder.arr.buffer, decoder.arr.byteOffset + decoder.pos, len);
    decoder.pos += len;
    return dv
  };

  /**
   * @param {Decoder} decoder
   */
  const readFloat32 = decoder => readFromDataView(decoder, 4).getFloat32(0, false);

  /**
   * @param {Decoder} decoder
   */
  const readFloat64 = decoder => readFromDataView(decoder, 8).getFloat64(0, false);

  /**
   * @param {Decoder} decoder
   */
  const readBigInt64 = decoder => /** @type {any} */ (readFromDataView(decoder, 8)).getBigInt64(0, false);

  /**
   * @type {Array<function(Decoder):any>}
   */
  const readAnyLookupTable = [
    decoder => undefined, // CASE 127: undefined
    decoder => null, // CASE 126: null
    readVarInt, // CASE 125: integer
    readFloat32, // CASE 124: float32
    readFloat64, // CASE 123: float64
    readBigInt64, // CASE 122: bigint
    decoder => false, // CASE 121: boolean (false)
    decoder => true, // CASE 120: boolean (true)
    readVarString, // CASE 119: string
    decoder => { // CASE 118: object<string,any>
      const len = readVarUint(decoder);
      /**
       * @type {Object<string,any>}
       */
      const obj = {};
      for (let i = 0; i < len; i++) {
        const key = readVarString(decoder);
        obj[key] = readAny(decoder);
      }
      return obj
    },
    decoder => { // CASE 117: array<any>
      const len = readVarUint(decoder);
      const arr = [];
      for (let i = 0; i < len; i++) {
        arr.push(readAny(decoder));
      }
      return arr
    },
    readVarUint8Array // CASE 116: Uint8Array
  ];

  /**
   * @param {Decoder} decoder
   */
  const readAny = decoder => readAnyLookupTable[127 - readUint8(decoder)](decoder);

  /**
   * T must not be null.
   *
   * @template T
   */
  class RleDecoder extends Decoder {
    /**
     * @param {Uint8Array} uint8Array
     * @param {function(Decoder):T} reader
     */
    constructor (uint8Array, reader) {
      super(uint8Array);
      /**
       * The reader
       */
      this.reader = reader;
      /**
       * Current state
       * @type {T|null}
       */
      this.s = null;
      this.count = 0;
    }

    read () {
      if (this.count === 0) {
        this.s = this.reader(this);
        if (hasContent(this)) {
          this.count = readVarUint(this) + 1; // see encoder implementation for the reason why this is incremented
        } else {
          this.count = -1; // read the current value forever
        }
      }
      this.count--;
      return /** @type {T} */ (this.s)
    }
  }

  class UintOptRleDecoder extends Decoder {
    /**
     * @param {Uint8Array} uint8Array
     */
    constructor (uint8Array) {
      super(uint8Array);
      /**
       * @type {number}
       */
      this.s = 0;
      this.count = 0;
    }

    read () {
      if (this.count === 0) {
        this.s = readVarInt(this);
        // if the sign is negative, we read the count too, otherwise count is 1
        const isNegative = isNegativeZero(this.s);
        this.count = 1;
        if (isNegative) {
          this.s = -this.s;
          this.count = readVarUint(this) + 2;
        }
      }
      this.count--;
      return /** @type {number} */ (this.s)
    }
  }

  class IntDiffOptRleDecoder extends Decoder {
    /**
     * @param {Uint8Array} uint8Array
     */
    constructor (uint8Array) {
      super(uint8Array);
      /**
       * @type {number}
       */
      this.s = 0;
      this.count = 0;
      this.diff = 0;
    }

    /**
     * @return {number}
     */
    read () {
      if (this.count === 0) {
        const diff = readVarInt(this);
        // if the first bit is set, we read more data
        const hasCount = diff & 1;
        this.diff = floor(diff / 2); // shift >> 1
        this.count = 1;
        if (hasCount) {
          this.count = readVarUint(this) + 2;
        }
      }
      this.s += this.diff;
      this.count--;
      return this.s
    }
  }

  class StringDecoder {
    /**
     * @param {Uint8Array} uint8Array
     */
    constructor (uint8Array) {
      this.decoder = new UintOptRleDecoder(uint8Array);
      this.str = readVarString(this.decoder);
      /**
       * @type {number}
       */
      this.spos = 0;
    }

    /**
     * @return {string}
     */
    read () {
      const end = this.spos + this.decoder.read();
      const res = this.str.slice(this.spos, end);
      this.spos = end;
      return res
    }
  }

  /**
   * Utility functions to work with buffers (Uint8Array).
   *
   * @module buffer
   */

  /**
   * @param {number} len
   */
  const createUint8ArrayFromLen = len => new Uint8Array(len);

  /**
   * Create Uint8Array with initial content from buffer
   *
   * @param {ArrayBuffer} buffer
   * @param {number} byteOffset
   * @param {number} length
   */
  const createUint8ArrayViewFromArrayBuffer = (buffer, byteOffset, length) => new Uint8Array(buffer, byteOffset, length);

  /**
   * Copy the content of an Uint8Array view to a new ArrayBuffer.
   *
   * @param {Uint8Array} uint8Array
   * @return {Uint8Array}
   */
  const copyUint8Array = uint8Array => {
    const newBuf = createUint8ArrayFromLen(uint8Array.byteLength);
    newBuf.set(uint8Array);
    return newBuf
  };

  /**
   * Fast Pseudo Random Number Generators.
   *
   * Given a seed a PRNG generates a sequence of numbers that cannot be reasonably predicted.
   * Two PRNGs must generate the same random sequence of numbers if  given the same seed.
   *
   * @module prng
   */

  /**
   * Description of the function
   *  @callback generatorNext
   *  @return {number} A random float in the cange of [0,1)
   */

  /**
   * A random type generator.
   *
   * @typedef {Object} PRNG
   * @property {generatorNext} next Generate new number
   */

  const DefaultPRNG = Xoroshiro128plus;

  /**
   * Create a Xoroshiro128plus Pseudo-Random-Number-Generator.
   * This is the fastest full-period generator passing BigCrush without systematic failures.
   * But there are more PRNGs available in ./PRNG/.
   *
   * @param {number} seed A positive 32bit integer. Do not use negative numbers.
   * @return {PRNG}
   */
  const create$3 = seed => new DefaultPRNG(seed);

  /**
   * Generates a single random bool.
   *
   * @param {PRNG} gen A random number generator.
   * @return {Boolean} A random boolean
   */
  const bool = gen => (gen.next() >= 0.5);

  /**
   * Generates a random integer with 32 bit resolution.
   *
   * @param {PRNG} gen A random number generator.
   * @param {Number} min The lower bound of the allowed return values (inclusive).
   * @param {Number} max The upper bound of the allowed return values (inclusive).
   * @return {Number} A random integer on [min, max]
   */
  const int32 = (gen, min, max) => floor(gen.next() * (max + 1 - min) + min);

  /**
   * @deprecated
   * Optimized version of prng.int32. It has the same precision as prng.int32, but should be preferred when
   * openaring on smaller ranges.
   *
   * @param {PRNG} gen A random number generator.
   * @param {Number} min The lower bound of the allowed return values (inclusive).
   * @param {Number} max The upper bound of the allowed return values (inclusive). The max inclusive number is `binary.BITS31-1`
   * @return {Number} A random integer on [min, max]
   */
  const int31 = (gen, min, max) => int32(gen, min, max);

  /**
   * @param {PRNG} gen
   * @return {string} A single letter (a-z)
   */
  const letter = gen => fromCharCode(int31(gen, 97, 122));

  /**
   * @param {PRNG} gen
   * @param {number} [minLen=0]
   * @param {number} [maxLen=20]
   * @return {string} A random word (0-20 characters) without spaces consisting of letters (a-z)
   */
  const word = (gen, minLen = 0, maxLen = 20) => {
    const len = int31(gen, minLen, maxLen);
    let str = '';
    for (let i = 0; i < len; i++) {
      str += letter(gen);
    }
    return str
  };

  /**
   * Returns one element of a given array.
   *
   * @param {PRNG} gen A random number generator.
   * @param {Array<T>} array Non empty Array of possible values.
   * @return {T} One of the values of the supplied Array.
   * @template T
   */
  const oneOf = (gen, array) => array[int31(gen, 0, array.length - 1)];

  /**
   * Utility helpers for generating statistics.
   *
   * @module statistics
   */

  /**
   * @param {Array<number>} arr Array of values
   * @return {number} Returns null if the array is empty
   */
  const median = arr => arr.length === 0 ? NaN : (arr.length % 2 === 1 ? arr[(arr.length - 1) / 2] : (arr[floor((arr.length - 1) / 2)] + arr[ceil((arr.length - 1) / 2)]) / 2);

  /**
   * @param {Array<number>} arr
   * @return {number}
   */
  const average = arr => arr.reduce(add, 0) / arr.length;

  /**
   * Utility helpers to work with promises.
   *
   * @module promise
   */

  /**
   * @template T
   * @callback PromiseResolve
   * @param {T|PromiseLike<T>} [result]
   */

  /**
   * @template T
   * @param {function(PromiseResolve<T>,function(Error):void):any} f
   * @return {Promise<T>}
   */
  const create$2 = f => /** @type {Promise<T>} */ (new Promise(f));

  /**
   * Checks if an object is a promise using ducktyping.
   *
   * Promises are often polyfilled, so it makes sense to add some additional guarantees if the user of this
   * library has some insane environment where global Promise objects are overwritten.
   *
   * @param {any} p
   * @return {boolean}
   */
  const isPromise = p => p instanceof Promise || (p && p.then && p.catch && p.finally);

  /**
   * Testing framework with support for generating tests.
   *
   * ```js
   * // test.js template for creating a test executable
   * import { runTests } from 'lib0/testing'
   * import * as log from 'lib0/logging'
   * import * as mod1 from './mod1.test.js'
   * import * as mod2 from './mod2.test.js'

   * import { isBrowser, isNode } from 'lib0/environment.js'
   *
   * if (isBrowser) {
   *   // optional: if this is ran in the browser, attach a virtual console to the dom
   *   log.createVConsole(document.body)
   * }
   *
   * runTests({
   *  mod1,
   *  mod2,
   * }).then(success => {
   *   if (isNode) {
   *     process.exit(success ? 0 : 1)
   *   }
   * })
   * ```
   *
   * ```js
   * // mod1.test.js
   * /**
   *  * runTests automatically tests all exported functions that start with "test".
   *  * The name of the function should be in camelCase and is used for the logging output.
   *  *
   *  * @param {t.TestCase} tc
   *  *\/
   * export const testMyFirstTest = tc => {
   *   t.compare({ a: 4 }, { a: 4 }, 'objects are equal')
   * }
   * ```
   *
   * Now you can simply run `node test.js` to run your test or run test.js in the browser.
   *
   * @module testing
   */

  hasConf('extensive');

  /* istanbul ignore next */
  const envSeed = hasParam('--seed') ? Number.parseInt(getParam('--seed', '0')) : null;

  class TestCase {
    /**
     * @param {string} moduleName
     * @param {string} testName
     */
    constructor (moduleName, testName) {
      /**
       * @type {string}
       */
      this.moduleName = moduleName;
      /**
       * @type {string}
       */
      this.testName = testName;
      this._seed = null;
      this._prng = null;
    }

    resetSeed () {
      this._seed = null;
      this._prng = null;
    }

    /**
     * @type {number}
     */
    /* istanbul ignore next */
    get seed () {
      /* istanbul ignore else */
      if (this._seed === null) {
        /* istanbul ignore next */
        this._seed = envSeed === null ? uint32() : envSeed;
      }
      return this._seed
    }

    /**
     * A PRNG for this test case. Use only this PRNG for randomness to make the test case reproducible.
     *
     * @type {prng.PRNG}
     */
    get prng () {
      /* istanbul ignore else */
      if (this._prng === null) {
        this._prng = create$3(this.seed);
      }
      return this._prng
    }
  }

  const repetitionTime = Number(getParam('--repetition-time', '50'));
  /* istanbul ignore next */
  const testFilter = hasParam('--filter') ? getParam('--filter', '') : null;

  /* istanbul ignore next */
  const testFilterRegExp = testFilter !== null ? new RegExp(testFilter) : new RegExp('.*');

  const repeatTestRegex = /^(repeat|repeating)\s/;

  /**
   * @param {string} moduleName
   * @param {string} name
   * @param {function(TestCase):void|Promise<any>} f
   * @param {number} i
   * @param {number} numberOfTests
   */
  const run = async (moduleName, name, f, i, numberOfTests) => {
    const uncamelized = fromCamelCase(name.slice(4), ' ');
    const filtered = !testFilterRegExp.test(`[${i + 1}/${numberOfTests}] ${moduleName}: ${uncamelized}`);
    /* istanbul ignore if */
    if (filtered) {
      return true
    }
    const tc = new TestCase(moduleName, name);
    const repeat = repeatTestRegex.test(uncamelized);
    const groupArgs = [GREY, `[${i + 1}/${numberOfTests}] `, PURPLE, `${moduleName}: `, BLUE, uncamelized];
    /* istanbul ignore next */
    if (testFilter === null) {
      groupCollapsed(...groupArgs);
    } else {
      group(...groupArgs);
    }
    const times = [];
    const start = performance.now();
    let lastTime = start;
    /**
     * @type {any}
     */
    let err = null;
    performance.mark(`${name}-start`);
    do {
      try {
        const p = f(tc);
        if (isPromise(p)) {
          await p;
        }
      } catch (_err) {
        err = _err;
      }
      const currTime = performance.now();
      times.push(currTime - lastTime);
      lastTime = currTime;
      if (repeat && err === null && (lastTime - start) < repetitionTime) {
        tc.resetSeed();
      } else {
        break
      }
    } while (err === null && (lastTime - start) < repetitionTime)
    performance.mark(`${name}-end`);
    /* istanbul ignore if */
    if (err !== null && err.constructor !== SkipError) {
      printError(err);
    }
    performance.measure(name, `${name}-start`, `${name}-end`);
    groupEnd();
    const duration = lastTime - start;
    let success = true;
    times.sort((a, b) => a - b);
    /* istanbul ignore next */
    const againMessage = isBrowser
      ? `     - ${window.location.host + window.location.pathname}?filter=\\[${i + 1}/${tc._seed === null ? '' : `&seed=${tc._seed}`}`
      : `\nrepeat: npm run test -- --filter "\\[${i + 1}/" ${tc._seed === null ? '' : `--seed ${tc._seed}`}`;
    const timeInfo = (repeat && err === null)
      ? ` - ${times.length} repetitions in ${humanizeDuration(duration)} (best: ${humanizeDuration(times[0])}, worst: ${humanizeDuration(last(times))}, median: ${humanizeDuration(median(times))}, average: ${humanizeDuration(average(times))})`
      : ` in ${humanizeDuration(duration)}`;
    if (err !== null) {
      /* istanbul ignore else */
      if (err.constructor === SkipError) {
        print(GREY, BOLD, 'Skipped: ', UNBOLD, uncamelized);
      } else {
        success = false;
        print(RED, BOLD, 'Failure: ', UNBOLD, UNCOLOR, uncamelized, GREY, timeInfo, againMessage);
      }
    } else {
      print(GREEN, BOLD, 'Success: ', UNBOLD, UNCOLOR, uncamelized, GREY, timeInfo, againMessage);
    }
    return success
  };

  /**
   * @param {string} a
   * @param {string} b
   * @param {string} [m]
   * @throws {TestError} Throws if tests fails
   */
  const compareStrings = (a, b, m = 'Strings match') => {
    if (a !== b) {
      const diff = simpleDiffString(a, b);
      print(GREY, a.slice(0, diff.index), RED, a.slice(diff.index, diff.remove), GREEN, diff.insert, GREY, a.slice(diff.index + diff.remove));
      fail(m);
    }
  };

  /**
   * @param {any} constructor
   * @param {any} a
   * @param {any} b
   * @param {string} path
   * @throws {TestError}
   */
  const compareValues = (constructor, a, b, path) => {
    if (a !== b) {
      fail(`Values ${stringify(a)} and ${stringify(b)} don't match (${path})`);
    }
    return true
  };

  /**
   * @param {string?} message
   * @param {string} reason
   * @param {string} path
   * @throws {TestError}
   */
  const _failMessage = (message, reason, path) => fail(
    message === null
      ? `${reason} ${path}`
      : `${message} (${reason}) ${path}`
  );

  /**
   * @param {any} a
   * @param {any} b
   * @param {string} path
   * @param {string?} message
   * @param {function(any,any,any,string,any):boolean} customCompare
   */
  const _compare = (a, b, path, message, customCompare) => {
    // we don't use assert here because we want to test all branches (istanbul errors if one branch is not tested)
    if (a == null || b == null) {
      return compareValues(null, a, b, path)
    }
    if (a.constructor !== b.constructor) {
      _failMessage(message, 'Constructors don\'t match', path);
    }
    let success = true;
    switch (a.constructor) {
      case ArrayBuffer:
        a = new Uint8Array(a);
        b = new Uint8Array(b);
      // eslint-disable-next-line no-fallthrough
      case Uint8Array: {
        if (a.byteLength !== b.byteLength) {
          _failMessage(message, 'ArrayBuffer lengths match', path);
        }
        for (let i = 0; success && i < a.length; i++) {
          success = success && a[i] === b[i];
        }
        break
      }
      case Set: {
        if (a.size !== b.size) {
          _failMessage(message, 'Sets have different number of attributes', path);
        }
        // @ts-ignore
        a.forEach(value => {
          if (!b.has(value)) {
            _failMessage(message, `b.${path} does have ${value}`, path);
          }
        });
        break
      }
      case Map: {
        if (a.size !== b.size) {
          _failMessage(message, 'Maps have different number of attributes', path);
        }
        // @ts-ignore
        a.forEach((value, key) => {
          if (!b.has(key)) {
            _failMessage(message, `Property ${path}["${key}"] does not exist on second argument`, path);
          }
          _compare(value, b.get(key), `${path}["${key}"]`, message, customCompare);
        });
        break
      }
      case Object:
        if (length$1(a) !== length$1(b)) {
          _failMessage(message, 'Objects have a different number of attributes', path);
        }
        forEach(a, (value, key) => {
          if (!hasProperty(b, key)) {
            _failMessage(message, `Property ${path} does not exist on second argument`, path);
          }
          _compare(value, b[key], `${path}["${key}"]`, message, customCompare);
        });
        break
      case Array:
        if (a.length !== b.length) {
          _failMessage(message, 'Arrays have a different number of attributes', path);
        }
        // @ts-ignore
        a.forEach((value, i) => _compare(value, b[i], `${path}[${i}]`, message, customCompare));
        break
      /* istanbul ignore next */
      default:
        if (!customCompare(a.constructor, a, b, path, compareValues)) {
          _failMessage(message, `Values ${stringify(a)} and ${stringify(b)} don't match`, path);
        }
    }
    assert(success, message);
    return true
  };

  /**
   * @template T
   * @param {T} a
   * @param {T} b
   * @param {string?} [message]
   * @param {function(any,T,T,string,any):boolean} [customCompare]
   */
  const compare$1 = (a, b, message = null, customCompare = compareValues) => _compare(a, b, 'obj', message, customCompare);

  /* istanbul ignore next */
  /**
   * @param {boolean} condition
   * @param {string?} [message]
   * @throws {TestError}
   */
  const assert = (condition, message = null) => condition || fail(`Assertion failed${message !== null ? `: ${message}` : ''}`);

  /**
   * @param {Object<string, Object<string, function(TestCase):void|Promise<any>>>} tests
   */
  const runTests = async tests => {
    const numberOfTests = map(tests, mod => map(mod, f => /* istanbul ignore next */ f ? 1 : 0).reduce(add, 0)).reduce(add, 0);
    let successfulTests = 0;
    let testnumber = 0;
    const start = performance.now();
    for (const modName in tests) {
      const mod = tests[modName];
      for (const fname in mod) {
        const f = mod[fname];
        /* istanbul ignore else */
        if (f) {
          const repeatEachTest = 1;
          let success = true;
          for (let i = 0; success && i < repeatEachTest; i++) {
            success = await run(modName, fname, f, testnumber, numberOfTests);
          }
          testnumber++;
          /* istanbul ignore else */
          if (success) {
            successfulTests++;
          }
        }
      }
    }
    const end = performance.now();
    print('');
    const success = successfulTests === numberOfTests;
    /* istanbul ignore next */
    if (success) {
      /* istanbul ignore next */
      print(GREEN, BOLD, 'All tests successful!', GREY, UNBOLD, ` in ${humanizeDuration(end - start)}`);
      /* istanbul ignore next */
      printImgBase64(nyanCatImage, 50);
    } else {
      const failedTests = numberOfTests - successfulTests;
      print(RED, BOLD, `> ${failedTests} test${failedTests > 1 ? 's' : ''} failed`);
    }
    return success
  };

  class TestError extends Error {}

  /**
   * @param {string} reason
   * @throws {TestError}
   */
  const fail = reason => {
    print(RED, BOLD, 'X ', UNBOLD, reason);
    throw new TestError('Test Failed')
  };

  class SkipError extends Error {}

  // eslint-disable-next-line
  const nyanCatImage = 'R0lGODlhjABMAPcAAMiSE0xMTEzMzUKJzjQ0NFsoKPc7//FM/9mH/z9x0HIiIoKCgmBHN+frGSkZLdDQ0LCwsDk71g0KCUzDdrQQEOFz/8yYdelmBdTiHFxcXDU2erR/mLrTHCgoKK5szBQUFNgSCTk6ymfpCB9VZS2Bl+cGBt2N8kWm0uDcGXhZRUvGq94NCFPhDiwsLGVlZTgqIPMDA1g3aEzS5D6xAURERDtG9JmBjJsZGWs2AD1W6Hp6eswyDeJ4CFNTU1LcEoJRmTMzSd14CTg5ser2GmDzBd17/xkZGUzMvoSMDiEhIfKruCwNAJaWlvRzA8kNDXDrCfi0pe1U/+GS6SZrAB4eHpZwVhoabsx9oiYmJt/TGHFxcYyMjOid0+Zl/0rF6j09PeRr/0zU9DxO6j+z0lXtBtp8qJhMAEssLGhoaPL/GVn/AAsWJ/9/AE3Z/zs9/3cAAOlf/+aa2RIyADo85uhh/0i84WtrazQ0UyMlmDMzPwUFBe16BTMmHau0E03X+g8pMEAoS1MBAf++kkzO8pBaqSZoe9uB/zE0BUQ3Sv///4WFheuiyzo880gzNDIyNissBNqF/8RiAOF2qG5ubj0vL1z6Avl5ASsgGkgUSy8vL/8n/z4zJy8lOv96uEssV1csAN5ZCDQ0Wz1a3tbEGHLeDdYKCg4PATE7PiMVFSoqU83eHEi43gUPAOZ8reGogeKU5dBBC8faHEez2lHYF4bQFMukFtl4CzY3kkzBVJfMGZkAAMfSFf27mP0t//g4/9R6Dfsy/1DRIUnSAPRD/0fMAFQ0Q+l7rnbaD0vEntCDD6rSGtO8GNpUCU/MK07LPNEfC7RaABUWWkgtOst+71v9AfD7GfDw8P19ATtA/NJpAONgB9yL+fm6jzIxMdnNGJxht1/2A9x//9jHGOSX3+5tBP27l35+fk5OTvZ9AhYgTjo0PUhGSDs9+LZjCFf2Aw0IDwcVAA8PD5lwg9+Q7YaChC0kJP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh/wtYTVAgRGF0YVhNUDw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzozMjowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpGNEM2MUEyMzE0QTRFMTExOUQzRkE3QTBCRDNBMjdBQyIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpERjQ0NEY0QkI2MTcxMUUxOUJEQkUzNUNGQTkwRTU2MiIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpERjQ0NEY0QUI2MTcxMUUxOUJEQkUzNUNGQTkwRTU2MiIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ1M1IFdpbmRvd3MiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo1OEE3RTIwRjcyQTlFMTExOTQ1QkY2QTU5QzVCQjJBOSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpGNEM2MUEyMzE0QTRFMTExOUQzRkE3QTBCRDNBMjdBQyIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PgH//v38+/r5+Pf29fTz8vHw7+7t7Ovq6ejn5uXk4+Lh4N/e3dzb2tnY19bV1NPS0dDPzs3My8rJyMfGxcTDwsHAv769vLu6ubi3trW0s7KxsK+urayrqqmop6alpKOioaCfnp2cm5qZmJeWlZSTkpGQj46NjIuKiYiHhoWEg4KBgH9+fXx7enl4d3Z1dHNycXBvbm1sa2ppaGdmZWRjYmFgX15dXFtaWVhXVlVUU1JRUE9OTUxLSklIR0ZFRENCQUA/Pj08Ozo5ODc2NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEAACH5BAkKABEAIf4jUmVzaXplZCBvbiBodHRwczovL2V6Z2lmLmNvbS9yZXNpemUALAAAAACMAEwAAAj/ACMIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXLkxEcuXMAm6jElTZaKZNXOOvOnyps6fInECHdpRKNGjSJMqXZrSKNOnC51CnUq1qtWrWLNC9GmQq9avYMOKHUs2aFmmUs8SlcC2rdu3cNWeTEG3rt27eBnIHflBj6C/gAMLHpxCz16QElJw+7tom+PHkCOP+8utiuHDHRP/5WICgefPkIYV8RAjxudtkwVZjqCnNeaMmheZqADm8+coHn5kyPBt2udFvKrc+7A7gITXFzV77hLF9ucYGRaYo+FhWhHPUKokobFgQYbjyCsq/3fuHHr3BV88HMBeZd357+HFpxBEvnz0961b3+8OP37DtgON5xxznpl3ng5aJKiFDud5B55/Ct3TQwY93COQgLZV0AUC39ihRYMggjhJDw9CeNA9kyygxT2G6TGfcxUY8pkeH3YHgTkMNrgFBJOYs8Akl5l4Yoor3mPki6BpUsGMNS6QiA772WjNPR8CSRAjWBI0B5ZYikGQGFwyMseVYWoZppcDhSkmmVyaySWaAqk5pkBbljnQlnNYEZ05fGaAJGieVQAMjd2ZY+R+X2Rgh5FVBhmBG5BGKumklFZq6aWYZqrpppTOIQQNNPjoJ31RbGibIRXQuIExrSSY4wI66P9gToJlGHOFo374MQg2vGLjRa65etErNoMA68ew2Bi7a6+/Aitsr8UCi6yywzYb7LDR5jotsMvyau0qJJCwGw0vdrEkeTRe0UknC7hQYwYMQrmAMZ2U4WgY+Lahbxt+4Ovvvm34i68fAAscBsD9+kvwvgYDHLDACAu8sL4NFwzxvgkP3EYhhYzw52dFhOPZD5Ns0Iok6PUwyaIuTJLBBwuUIckG8RCkhhrUHKHzEUTcfLM7Ox/hjs9qBH0E0ZUE3bPPQO9cCdFGIx300EwH/bTPUfuc9M5U30zEzhN87NkwcDyXgY/oxaP22vFQIR2JBT3xBDhEUyO33FffXMndT1D/QzTfdPts9915qwEO3377DHjdfBd++N2J47y44Ij7PMN85UgBxzCeQQKJbd9wFyKI6jgqUBqoD6G66qinvvoQ1bSexutDyF4N7bLTHnvruLd+++u5v76766vb3jvxM0wxnyBQxHEued8Y8cX01Fc/fQcHZaG97A1or30DsqPgfRbDpzF+FtyPD37r4ns/fDXnp+/9+qif//74KMj/fRp9TEIDAxb4ixIWQcACFrAMFkigAhPIAAmwyHQDYYMEJ0jBClrwghjMoAY3yMEOYhAdQaCBFtBAAD244oQoTKEKV5iCbizEHjCkoCVgCENLULAJNLTHNSZ4jRzaQ4Y5tOEE+X24Qwn2MIdApKEQJUhEHvowiTBkhh7QVqT8GOmKWHwgFiWghR5AkCA+DKMYx0jGMprxjGhMYw5XMEXvGAZF5piEhQyih1CZ4wt6kIARfORFhjwDBoCEQQkIUoJAwmAFBDEkDAhSCkMOciCFDCQiB6JIgoDAkYQ0JAgSaUhLYnIgFLjH9AggkHsQYHo1oyMVptcCgUjvCx34opAWkp/L1BIhtxxILmfJy17KxJcrSQswhykWYRLzI8Y8pjKXycxfNvOZMEkmNC0izWlSpJrWlAg2s8kQnkRgJt7kpja92ZNwivOcNdkmOqOyzoyos50IeSc850nPegIzIAAh+QQJCgARACwAAAAAjABMAAAI/wAjCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJcmKikihTZkx0UqXLlw5ZwpxJ02DLmjhz6twJkqVMnz55Ch1KtGhCmUaTYkSqtKnJm05rMl0aVefUqlhtFryatavXr2DDHoRKkKzYs2jTqpW61exani3jun0rlCvdrhLy6t3Lt+9dlykCCx5MuDCDvyU/6BHEuLHjx5BT6EEsUkIKbowXbdvMubPncYy5VZlM+aNlxlxMIFjNGtKwIggqDGO9DbSg0aVNpxC0yEQFMKxZRwmHoEiU4AgW8cKdu+Pp1V2OI6c9bdq2cLARQGEeIV7zjM+nT//3oEfPNDiztTOXoMf7d4vhxbP+ts6cORrfIK3efq+8FnN2kPbeRPEFF918NCywgBZafLNfFffEM4k5C0wi4IARFchaBV0gqGCFDX6zQQqZZPChhRgSuBtyFRiC3DcJfqgFDTTSYOKJF6boUIGQaFLBizF+KOSQKA7EyJEEzXHkkWIQJMaSjMxBEJSMJAllk0ZCKWWWS1q5JJYCUbllBEpC6SWTEehxzz0rBqdfbL1AEsONQ9b5oQ73DOTGnnz26eefgAYq6KCEFmoooCHccosdk5yzYhQdBmfIj3N++AAEdCqoiDU62LGAOXkK5Icfg2BjKjZejDqqF6diM4iqfrT/ig2spZ6aqqqsnvqqqrLS2uqtq7a666i9qlqrqbeeQEIGN2awYhc/ilepghAssM6JaCwAQQ8ufBpqBGGE28a4bfgR7rnktnFuuH6ku24Y6Zp7brvkvpuuuuvGuy6949rrbr7kmltHIS6Yw6AWjgoyXRHErTYnPRtskMEXdLrQgzlffKHDBjZ8q4Ya1Bwh8hFEfPyxOyMf4Y7JaqR8BMuVpFyyySiPXAnLLsOc8so0p3yzyTmbHPPIK8sxyYJr9tdmcMPAwdqcG3TSyQZ2fniF1N8+8QQ4LFOjtdY/f1zJ109QwzLZXJvs9ddhqwEO2WabjHbXZLf99tdxgzy32k8Y/70gK+5UMsNu5UiB3mqQvIkA1FJLfO0CFH8ajxZXd/JtGpgPobnmmGe++RDVdJ7G50OIXg3popMeeueod37656l/vrrnm5uOOgZIfJECBpr3sZsgUMQRLXLTEJJBxPRkkETGRmSS8T1a2CCPZANlYb3oDVhvfQOio6B9FrOn8X0W2H/Pfefeaz97NeOXr/35mI+//vcouJ9MO7V03gcDFjCmxCIADGAAr1CFG2mBWQhEoA600IMLseGBEIygBCdIwQpa8IIYzKAGMcgDaGTMFSAMoQhDaAE9HOyEKOyBewZijxZG0BItbKElItiEGNrjGhC8hg3t8UIbzhCCO8ThA+Z1aMMexvCHDwxiDndoRBk+8A03Slp/1CTFKpaHiv3JS9IMssMuevGLYAyjGMdIxjJ6EYoK0oNivmCfL+RIINAD0GT0YCI8rdAgz4CBHmFQAoKUYI8wWAFBAAkDgpQCkH0cyB/3KMiBEJIgIECkHwEJgkECEpKSVKQe39CCjH0gTUbIWAsQcg8CZMw78TDlF76lowxdUSBXfONArrhC9pSnlbjMpS7rssuZzKWXPQHKL4HZEWESMyXDPKZHkqnMZjrzLnZ5pjSnSc1qWmQuzLSmQrCpzW5685vfjCY4x0nOcprznB4JCAAh+QQJCgBIACwAAAAAjABMAAAI/wCRCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJcmGiRCVTqsyIcqXLlzBjypxJs6bNmzgPtjR4MqfPn0CDCh1KtKjNnkaTPtyptKlToEyfShUYderTqlaNnkSJNGvTrl6dYg1bdCzZs2jTqvUpoa3bt3DjrnWZoq7du3jzMphb8oMeQYADCx5MOIUeviIlpOAGeNG2x5AjSx4HmFuVw4g/KgbMxQSCz6AhDSuCoMIw0NsoC7qcWXMKQYtMVAADGnSUcAiKRKmNYBEv1q07bv7cZTfvz9OSfw5HGgEU1vHiBdc4/Djvb3refY5y2jlrPeCnY/+sbv1zjAzmzFGZBgnS5+f3PqTvIUG8RfK1i5vPsGDBpB8egPbcF5P0l0F99jV0z4ILCoQfaBV0sV9/C7jwwzcYblAFGhQemGBDX9BAAwH3HKbHa7xVYEht51FYoYgictghgh8iZMQ95vSnBYP3oBiaJhWwyJ+LRLrooUGlwKCkkgSVsCQMKxD0JAwEgfBkCU0+GeVAUxK0wpVZLrmlQF0O9OWSTpRY4ALp0dCjILy5Vxow72hR5J0U2oGZQPb06eefgAYq6KCEFmrooYj6CQMIICgAIw0unINiFBLWZkgFetjZnzU62EEkEw/QoIN/eyLh5zWoXmPJn5akek0TrLr/Cqirq/rZaqqw2ppqrX02QWusuAKr6p++7trnDtAka8o5NKDYRZDHZUohBBkMWaEWTEBwj52TlMrGt+CGK+645JZr7rnopquuuejU9YmPtRWBGwKZ2rCBDV98IeMCPaChRb7ybCBPqVkUnMbBaTRQcMENIJwGCgtnUY3DEWfhsMILN4wwxAtPfHA1EaNwccQaH8xxwR6nAfLCIiOMMcMI9wEvaMPA8VmmV3TSCZ4UGtNJGaV+PMTQQztMNNFGH+1wNUcPkbTSCDe9tNRRH51yGlQLDfXBR8ssSDlSwNFdezdrkfPOX7jAZjzcUrGAz0ATBA44lahhtxrUzD133XdX/6I3ONTcrcbf4Aiet96B9/134nb/zbfdh8/NuBp+I3535HQbvrjdM0zxmiBQxAFtbR74u8EGC3yRSb73qPMFAR8sYIM8KdCIBORH5H4EGYITofsR7gj++xGCV/I773f7rnvwdw9f/O9E9P7742o4f7c70AtOxhEzuEADAxYApsQi5JdPvgUb9udCteyzX2EAtiMRxvxt1N+GH/PP74f9beRPP//+CwP/8Je//dkvgPzrn/8G6D8D1g+BAFyg/QiYv1XQQAtoIIAeXMHBDnqQg1VQhxZGSMISjlCDBvGDHwaBjRZiwwsqVKEXXIiNQcTQDzWg4Q1Z6EIYxnCGLrRhDP9z6MId0tCHMqShEFVIxBYasYc3PIEecrSAHZUIPDzK4hV5pAcJ6IFBCHGDGMdIxjKa8YxoTKMa18jGNqJxDlNcQAYOc49JmGMS9ziIHr6Qni+Axwg56kGpDMKIQhIkAoUs5BwIIoZEMiICBHGkGAgyB0cuciCNTGRBJElJSzLSkZtM5CQHUslECuEe+SKAQO5BgHxJxyB6oEK+WiAQI+SrA4Os0UPAEx4k8DKXAvklQXQwR2DqMiVgOeZLkqnMlTCzmdCcy1aQwJVpRjMk06zmM6/pEbNwEyTb/OZHwinOjpCznNREJzaj4k11TiSZ7XSnPHESz3lW5JnntKc+94kTFnjyUyP1/OdSBErQghr0oB0JCAAh+QQFCgAjACwAAAAAjABMAAAI/wBHCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJkmCikihTWjw5giVLlTBjHkz0UmBNmThz6tzJs6fPkTRn3vxJtKjRo0iTbgxqUqlTiC5tPt05dOXUnkyval2YdatXg12/ih07lmZQs2bJql27NSzbqW7fOo0rN2nViBLy6t3Lt29dmfGqCB5MuLBhBvH+pmSQQpAgKJAjS54M2XEVBopLSmjseBGCz6BDi37lWFAVPZlHbnb8SvRnSL0qIKjQK/Q2y6hTh1z9ahuYKK4rGEJgSHboV1BO697d+HOFLq4/e/j2zTmYz8lR37u3vOPq6KGnEf/68mXaNjrAEWT/QL5b943fwX+OkWGBOT3TQie/92HBggwSvCeRHgQSKFB8osExzHz12UdDddhVQYM5/gEoYET3ZDBJBveghmBoRRhHn38LaKHFDyimYIcWJFp44UP39KCFDhno0WFzocERTmgjkrhhBkCy2GKALzq03Tk6LEADFffg+NowshU3jR1okGjllf658EWRMN7zhX80NCkIeLTpISSWaC4wSW4ElQLDm28SVAKcMKxAEJ0wEAQCnSXISaedA+FJ0Ap8+gknoAIJOhChcPYpUCAdUphBc8PAEZ2ZJCZC45UQWIPpmgTZI+qopJZq6qmopqrqqqy2eioMTtz/QwMNmTRXQRGXnqnIFw0u0EOVC9zDIqgDjXrNsddYQqolyF7TxLLNltqssqMyi+yz1SJLrahNTAvttd8mS2q32pJ6ATTQfCKma10YZ+YGV1wRJIkuzAgkvPKwOQIb/Pbr778AByzwwAQXbPDBBZvxSWNSbBMOrghEAR0CZl7RSSclJlkiheawaEwnZeibxchplJxGAyOP3IDJaaCQchbVsPxyFiyjnPLKJruccswlV/MyCjW/jHPJOo/Mcxo+pwy0yTarbHIfnL2ioGvvaGExxrzaJ+wCdvT3ccgE9TzE2GOzTDbZZp/NcjVnD5G22ia3vbbccZ99dBp0iw13yWdD/10aF5BERx899CzwhQTxxHMP4hL0R08GlxQEDjiVqGG5GtRMPnnll1eiOTjUXK7G5+CInrnmoXf+eeqWf8655adPzroanqN+eeyUm7665TNMsQlnUCgh/PDCu1JFD/6ZqPzyvhJgEOxHRH8EGaITIf0R7oh+/RGiV3I99ZdbL332l2/f/fVEVH/962qYf7k76ItOxhEzuABkBhbkr//++aeQyf0ADKDzDBKGArbhgG3wQwEL6AcEtmGBBnQgBMPgQAUusIEInKADHwjBCkIQgwfUoAQ7iEALMtAPa5iEfbTQIT0YgTxGKJAMvfSFDhDoHgT4AgE6hBA/+GEQ2AgiNvy84EMfekGI2BhEEf1QAyQuEYhCJGIRjyhEJRaxiUJ8IhKlaEQkWtGHWAyiFqO4RC/UIIUl2s4H9PAlw+lrBPHQQ4UCtDU7vJEgbsijHvfIxz768Y+ADKQgB0lIQGJjDdvZjkBstJ3EHCSRRLLRHQnCiEoSJAKVrOQcCCKGTDIiApTMpBgIMgdPbnIgncxkQTw5yoGUMpOnFEgqLRnKSrZSIK/U5Ag+kLjEDaSXCQGmQHzJpWIasyV3OaYyl8nMZi7nLsl0ZkagKc1qWvOa2JxLNLPJzW6+ZZvevAhdwrkStJCTI2gZ5zknos51shOc7oynPOdJz3ra857hDAgAOw==';

  /**
   * Utility module to work with sets.
   *
   * @module set
   */

  const create$1 = () => new Set();

  /**
   * Observable class prototype.
   *
   * @module observable
   */

  /**
   * Handles named events.
   *
   * @template N
   */
  class Observable {
    constructor () {
      /**
       * Some desc.
       * @type {Map<N, any>}
       */
      this._observers = create$6();
    }

    /**
     * @param {N} name
     * @param {function} f
     */
    on (name, f) {
      setIfUndefined(this._observers, name, create$1).add(f);
    }

    /**
     * @param {N} name
     * @param {function} f
     */
    once (name, f) {
      /**
       * @param  {...any} args
       */
      const _f = (...args) => {
        this.off(name, _f);
        f(...args);
      };
      this.on(name, _f);
    }

    /**
     * @param {N} name
     * @param {function} f
     */
    off (name, f) {
      const observers = this._observers.get(name);
      if (observers !== undefined) {
        observers.delete(f);
        if (observers.size === 0) {
          this._observers.delete(name);
        }
      }
    }

    /**
     * Emit a named event. All registered event listeners that listen to the
     * specified name will receive the event.
     *
     * @todo This should catch exceptions
     *
     * @param {N} name The event name.
     * @param {Array<any>} args The arguments that are applied to the event listener.
     */
    emit (name, args) {
      // copy all listeners to an array first to make sure that no event is emitted to listeners that are subscribed while the event handler is called.
      return from((this._observers.get(name) || create$6()).values()).forEach(f => f(...args))
    }

    destroy () {
      this._observers = create$6();
    }
  }

  /**
   * Error helpers.
   *
   * @module error
   */

  /* istanbul ignore next */
  /**
   * @param {string} s
   * @return {Error}
   */
  const create = s => new Error(s);

  /* istanbul ignore next */
  /**
   * @throws {Error}
   * @return {never}
   */
  const methodUnimplemented = () => {
    throw create('Method unimplemented')
  };

  /* istanbul ignore next */
  /**
   * @throws {Error}
   * @return {never}
   */
  const unexpectedCase = () => {
    throw create('Unexpected case')
  };

  /**
   * Utility module to create and manipulate Iterators.
   *
   * @module iterator
   */

  /**
   * @template T
   * @param {function():IteratorResult<T>} next
   * @return {IterableIterator<T>}
   */
  const createIterator = next => ({
    /**
     * @return {IterableIterator<T>}
     */
    [Symbol.iterator] () {
      return this
    },
    // @ts-ignore
    next
  });

  /**
   * @template T
   * @param {Iterator<T>} iterator
   * @param {function(T):boolean} filter
   */
  const iteratorFilter = (iterator, filter) => createIterator(() => {
    let res;
    do {
      res = iterator.next();
    } while (!res.done && !filter(res.value))
    return res
  });

  /**
   * @template T,M
   * @param {Iterator<T>} iterator
   * @param {function(T):M} fmap
   */
  const iteratorMap = (iterator, fmap) => createIterator(() => {
    const { done, value } = iterator.next();
    return { done, value: done ? undefined : fmap(value) }
  });

  /**
   * This is an abstract interface that all Connectors should implement to keep them interchangeable.
   *
   * @note This interface is experimental and it is not advised to actually inherit this class.
   *       It just serves as typing information.
   *
   * @extends {Observable<any>}
   */
  class AbstractConnector extends Observable {
    /**
     * @param {Doc} ydoc
     * @param {any} awareness
     */
    constructor (ydoc, awareness) {
      super();
      this.doc = ydoc;
      this.awareness = awareness;
    }
  }

  class DeleteItem {
    /**
     * @param {number} clock
     * @param {number} len
     */
    constructor (clock, len) {
      /**
       * @type {number}
       */
      this.clock = clock;
      /**
       * @type {number}
       */
      this.len = len;
    }
  }

  /**
   * We no longer maintain a DeleteStore. DeleteSet is a temporary object that is created when needed.
   * - When created in a transaction, it must only be accessed after sorting, and merging
   *   - This DeleteSet is send to other clients
   * - We do not create a DeleteSet when we send a sync message. The DeleteSet message is created directly from StructStore
   * - We read a DeleteSet as part of a sync/update message. In this case the DeleteSet is already sorted and merged.
   */
  class DeleteSet {
    constructor () {
      /**
       * @type {Map<number,Array<DeleteItem>>}
       */
      this.clients = new Map();
    }
  }

  /**
   * Iterate over all structs that the DeleteSet gc's.
   *
   * @param {Transaction} transaction
   * @param {DeleteSet} ds
   * @param {function(GC|Item):void} f
   *
   * @function
   */
  const iterateDeletedStructs = (transaction, ds, f) =>
    ds.clients.forEach((deletes, clientid) => {
      const structs = /** @type {Array<GC|Item>} */ (transaction.doc.store.clients.get(clientid));
      for (let i = 0; i < deletes.length; i++) {
        const del = deletes[i];
        iterateStructs(transaction, structs, del.clock, del.len, f);
      }
    });

  /**
   * @param {Array<DeleteItem>} dis
   * @param {number} clock
   * @return {number|null}
   *
   * @private
   * @function
   */
  const findIndexDS = (dis, clock) => {
    let left = 0;
    let right = dis.length - 1;
    while (left <= right) {
      const midindex = floor((left + right) / 2);
      const mid = dis[midindex];
      const midclock = mid.clock;
      if (midclock <= clock) {
        if (clock < midclock + mid.len) {
          return midindex
        }
        left = midindex + 1;
      } else {
        right = midindex - 1;
      }
    }
    return null
  };

  /**
   * @param {DeleteSet} ds
   * @param {ID} id
   * @return {boolean}
   *
   * @private
   * @function
   */
  const isDeleted = (ds, id) => {
    const dis = ds.clients.get(id.client);
    return dis !== undefined && findIndexDS(dis, id.clock) !== null
  };

  /**
   * @param {DeleteSet} ds
   *
   * @private
   * @function
   */
  const sortAndMergeDeleteSet = ds => {
    ds.clients.forEach(dels => {
      dels.sort((a, b) => a.clock - b.clock);
      // merge items without filtering or splicing the array
      // i is the current pointer
      // j refers to the current insert position for the pointed item
      // try to merge dels[i] into dels[j-1] or set dels[j]=dels[i]
      let i, j;
      for (i = 1, j = 1; i < dels.length; i++) {
        const left = dels[j - 1];
        const right = dels[i];
        if (left.clock + left.len >= right.clock) {
          left.len = max(left.len, right.clock + right.len - left.clock);
        } else {
          if (j < i) {
            dels[j] = right;
          }
          j++;
        }
      }
      dels.length = j;
    });
  };

  /**
   * @param {Array<DeleteSet>} dss
   * @return {DeleteSet} A fresh DeleteSet
   */
  const mergeDeleteSets = dss => {
    const merged = new DeleteSet();
    for (let dssI = 0; dssI < dss.length; dssI++) {
      dss[dssI].clients.forEach((delsLeft, client) => {
        if (!merged.clients.has(client)) {
          // Write all missing keys from current ds and all following.
          // If merged already contains `client` current ds has already been added.
          /**
           * @type {Array<DeleteItem>}
           */
          const dels = delsLeft.slice();
          for (let i = dssI + 1; i < dss.length; i++) {
            appendTo(dels, dss[i].clients.get(client) || []);
          }
          merged.clients.set(client, dels);
        }
      });
    }
    sortAndMergeDeleteSet(merged);
    return merged
  };

  /**
   * @param {DeleteSet} ds
   * @param {number} client
   * @param {number} clock
   * @param {number} length
   *
   * @private
   * @function
   */
  const addToDeleteSet = (ds, client, clock, length) => {
    setIfUndefined(ds.clients, client, () => []).push(new DeleteItem(clock, length));
  };

  const createDeleteSet = () => new DeleteSet();

  /**
   * @param {StructStore} ss
   * @return {DeleteSet} Merged and sorted DeleteSet
   *
   * @private
   * @function
   */
  const createDeleteSetFromStructStore = ss => {
    const ds = createDeleteSet();
    ss.clients.forEach((structs, client) => {
      /**
       * @type {Array<DeleteItem>}
       */
      const dsitems = [];
      for (let i = 0; i < structs.length; i++) {
        const struct = structs[i];
        if (struct.deleted) {
          const clock = struct.id.clock;
          let len = struct.length;
          if (i + 1 < structs.length) {
            for (let next = structs[i + 1]; i + 1 < structs.length && next.deleted; next = structs[++i + 1]) {
              len += next.length;
            }
          }
          dsitems.push(new DeleteItem(clock, len));
        }
      }
      if (dsitems.length > 0) {
        ds.clients.set(client, dsitems);
      }
    });
    return ds
  };

  /**
   * @param {DSEncoderV1 | DSEncoderV2} encoder
   * @param {DeleteSet} ds
   *
   * @private
   * @function
   */
  const writeDeleteSet = (encoder, ds) => {
    writeVarUint(encoder.restEncoder, ds.clients.size);
    ds.clients.forEach((dsitems, client) => {
      encoder.resetDsCurVal();
      writeVarUint(encoder.restEncoder, client);
      const len = dsitems.length;
      writeVarUint(encoder.restEncoder, len);
      for (let i = 0; i < len; i++) {
        const item = dsitems[i];
        encoder.writeDsClock(item.clock);
        encoder.writeDsLen(item.len);
      }
    });
  };

  /**
   * @param {DSDecoderV1 | DSDecoderV2} decoder
   * @return {DeleteSet}
   *
   * @private
   * @function
   */
  const readDeleteSet = decoder => {
    const ds = new DeleteSet();
    const numClients = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numClients; i++) {
      decoder.resetDsCurVal();
      const client = readVarUint(decoder.restDecoder);
      const numberOfDeletes = readVarUint(decoder.restDecoder);
      if (numberOfDeletes > 0) {
        const dsField = setIfUndefined(ds.clients, client, () => []);
        for (let i = 0; i < numberOfDeletes; i++) {
          dsField.push(new DeleteItem(decoder.readDsClock(), decoder.readDsLen()));
        }
      }
    }
    return ds
  };

  /**
   * @todo YDecoder also contains references to String and other Decoders. Would make sense to exchange YDecoder.toUint8Array for YDecoder.DsToUint8Array()..
   */

  /**
   * @param {DSDecoderV1 | DSDecoderV2} decoder
   * @param {Transaction} transaction
   * @param {StructStore} store
   * @return {Uint8Array|null} Returns a v2 update containing all deletes that couldn't be applied yet; or null if all deletes were applied successfully.
   *
   * @private
   * @function
   */
  const readAndApplyDeleteSet = (decoder, transaction, store) => {
    const unappliedDS = new DeleteSet();
    const numClients = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numClients; i++) {
      decoder.resetDsCurVal();
      const client = readVarUint(decoder.restDecoder);
      const numberOfDeletes = readVarUint(decoder.restDecoder);
      const structs = store.clients.get(client) || [];
      const state = getState(store, client);
      for (let i = 0; i < numberOfDeletes; i++) {
        const clock = decoder.readDsClock();
        const clockEnd = clock + decoder.readDsLen();
        if (clock < state) {
          if (state < clockEnd) {
            addToDeleteSet(unappliedDS, client, state, clockEnd - state);
          }
          let index = findIndexSS(structs, clock);
          /**
           * We can ignore the case of GC and Delete structs, because we are going to skip them
           * @type {Item}
           */
          // @ts-ignore
          let struct = structs[index];
          // split the first item if necessary
          if (!struct.deleted && struct.id.clock < clock) {
            structs.splice(index + 1, 0, splitItem(transaction, struct, clock - struct.id.clock));
            index++; // increase we now want to use the next struct
          }
          while (index < structs.length) {
            // @ts-ignore
            struct = structs[index++];
            if (struct.id.clock < clockEnd) {
              if (!struct.deleted) {
                if (clockEnd < struct.id.clock + struct.length) {
                  structs.splice(index, 0, splitItem(transaction, struct, clockEnd - struct.id.clock));
                }
                struct.delete(transaction);
              }
            } else {
              break
            }
          }
        } else {
          addToDeleteSet(unappliedDS, client, clock, clockEnd - clock);
        }
      }
    }
    if (unappliedDS.clients.size > 0) {
      const ds = new UpdateEncoderV2();
      writeVarUint(ds.restEncoder, 0); // encode 0 structs
      writeDeleteSet(ds, unappliedDS);
      return ds.toUint8Array()
    }
    return null
  };

  /**
   * @module Y
   */

  const generateNewClientId = uint32;

  /**
   * @typedef {Object} DocOpts
   * @property {boolean} [DocOpts.gc=true] Disable garbage collection (default: gc=true)
   * @property {function(Item):boolean} [DocOpts.gcFilter] Will be called before an Item is garbage collected. Return false to keep the Item.
   * @property {string} [DocOpts.guid] Define a globally unique identifier for this document
   * @property {string | null} [DocOpts.collectionid] Associate this document with a collection. This only plays a role if your provider has a concept of collection.
   * @property {any} [DocOpts.meta] Any kind of meta information you want to associate with this document. If this is a subdocument, remote peers will store the meta information as well.
   * @property {boolean} [DocOpts.autoLoad] If a subdocument, automatically load document. If this is a subdocument, remote peers will load the document as well automatically.
   * @property {boolean} [DocOpts.shouldLoad] Whether the document should be synced by the provider now. This is toggled to true when you call ydoc.load()
   */

  /**
   * A Yjs instance handles the state of shared data.
   * @extends Observable<string>
   */
  class Doc extends Observable {
    /**
     * @param {DocOpts} [opts] configuration
     */
    constructor ({ guid = uuidv4(), collectionid = null, gc = true, gcFilter = () => true, meta = null, autoLoad = false, shouldLoad = true } = {}) {
      super();
      this.gc = gc;
      this.gcFilter = gcFilter;
      this.clientID = generateNewClientId();
      this.guid = guid;
      this.collectionid = collectionid;
      /**
       * @type {Map<string, AbstractType<YEvent<any>>>}
       */
      this.share = new Map();
      this.store = new StructStore();
      /**
       * @type {Transaction | null}
       */
      this._transaction = null;
      /**
       * @type {Array<Transaction>}
       */
      this._transactionCleanups = [];
      /**
       * @type {Set<Doc>}
       */
      this.subdocs = new Set();
      /**
       * If this document is a subdocument - a document integrated into another document - then _item is defined.
       * @type {Item?}
       */
      this._item = null;
      this.shouldLoad = shouldLoad;
      this.autoLoad = autoLoad;
      this.meta = meta;
      this.isLoaded = false;
      this.whenLoaded = create$2(resolve => {
        this.on('load', () => {
          this.isLoaded = true;
          resolve(this);
        });
      });
    }

    /**
     * Notify the parent document that you request to load data into this subdocument (if it is a subdocument).
     *
     * `load()` might be used in the future to request any provider to load the most current data.
     *
     * It is safe to call `load()` multiple times.
     */
    load () {
      const item = this._item;
      if (item !== null && !this.shouldLoad) {
        transact(/** @type {any} */ (item.parent).doc, transaction => {
          transaction.subdocsLoaded.add(this);
        }, null, true);
      }
      this.shouldLoad = true;
    }

    getSubdocs () {
      return this.subdocs
    }

    getSubdocGuids () {
      return new Set(Array.from(this.subdocs).map(doc => doc.guid))
    }

    /**
     * Changes that happen inside of a transaction are bundled. This means that
     * the observer fires _after_ the transaction is finished and that all changes
     * that happened inside of the transaction are sent as one message to the
     * other peers.
     *
     * @param {function(Transaction):void} f The function that should be executed as a transaction
     * @param {any} [origin] Origin of who started the transaction. Will be stored on transaction.origin
     *
     * @public
     */
    transact (f, origin = null) {
      transact(this, f, origin);
    }

    /**
     * Define a shared data type.
     *
     * Multiple calls of `y.get(name, TypeConstructor)` yield the same result
     * and do not overwrite each other. I.e.
     * `y.define(name, Y.Array) === y.define(name, Y.Array)`
     *
     * After this method is called, the type is also available on `y.share.get(name)`.
     *
     * *Best Practices:*
     * Define all types right after the Yjs instance is created and store them in a separate object.
     * Also use the typed methods `getText(name)`, `getArray(name)`, ..
     *
     * @example
     *   const y = new Y(..)
     *   const appState = {
     *     document: y.getText('document')
     *     comments: y.getArray('comments')
     *   }
     *
     * @param {string} name
     * @param {Function} TypeConstructor The constructor of the type definition. E.g. Y.Text, Y.Array, Y.Map, ...
     * @return {AbstractType<any>} The created type. Constructed with TypeConstructor
     *
     * @public
     */
    get (name, TypeConstructor = AbstractType) {
      const type = setIfUndefined(this.share, name, () => {
        // @ts-ignore
        const t = new TypeConstructor();
        t._integrate(this, null);
        return t
      });
      const Constr = type.constructor;
      if (TypeConstructor !== AbstractType && Constr !== TypeConstructor) {
        if (Constr === AbstractType) {
          // @ts-ignore
          const t = new TypeConstructor();
          t._map = type._map;
          type._map.forEach(/** @param {Item?} n */ n => {
            for (; n !== null; n = n.left) {
              // @ts-ignore
              n.parent = t;
            }
          });
          t._start = type._start;
          for (let n = t._start; n !== null; n = n.right) {
            n.parent = t;
          }
          t._length = type._length;
          this.share.set(name, t);
          t._integrate(this, null);
          return t
        } else {
          throw new Error(`Type with the name ${name} has already been defined with a different constructor`)
        }
      }
      return type
    }

    /**
     * @template T
     * @param {string} [name]
     * @return {YArray<T>}
     *
     * @public
     */
    getArray (name = '') {
      // @ts-ignore
      return this.get(name, YArray)
    }

    /**
     * @param {string} [name]
     * @return {YText}
     *
     * @public
     */
    getText (name = '') {
      // @ts-ignore
      return this.get(name, YText)
    }

    /**
     * @template T
     * @param {string} [name]
     * @return {YMap<T>}
     *
     * @public
     */
    getMap (name = '') {
      // @ts-ignore
      return this.get(name, YMap)
    }

    /**
     * @param {string} [name]
     * @return {YXmlFragment}
     *
     * @public
     */
    getXmlFragment (name = '') {
      // @ts-ignore
      return this.get(name, YXmlFragment)
    }

    /**
     * Converts the entire document into a js object, recursively traversing each yjs type
     * Doesn't log types that have not been defined (using ydoc.getType(..)).
     *
     * @deprecated Do not use this method and rather call toJSON directly on the shared types.
     *
     * @return {Object<string, any>}
     */
    toJSON () {
      /**
       * @type {Object<string, any>}
       */
      const doc = {};

      this.share.forEach((value, key) => {
        doc[key] = value.toJSON();
      });

      return doc
    }

    /**
     * Emit `destroy` event and unregister all event handlers.
     */
    destroy () {
      from(this.subdocs).forEach(subdoc => subdoc.destroy());
      const item = this._item;
      if (item !== null) {
        this._item = null;
        const content = /** @type {ContentDoc} */ (item.content);
        content.doc = new Doc({ guid: this.guid, ...content.opts, shouldLoad: false });
        content.doc._item = item;
        transact(/** @type {any} */ (item).parent.doc, transaction => {
          const doc = content.doc;
          if (!item.deleted) {
            transaction.subdocsAdded.add(doc);
          }
          transaction.subdocsRemoved.add(this);
        }, null, true);
      }
      this.emit('destroyed', [true]);
      this.emit('destroy', [this]);
      super.destroy();
    }

    /**
     * @param {string} eventName
     * @param {function(...any):any} f
     */
    on (eventName, f) {
      super.on(eventName, f);
    }

    /**
     * @param {string} eventName
     * @param {function} f
     */
    off (eventName, f) {
      super.off(eventName, f);
    }
  }

  class DSDecoderV1 {
    /**
     * @param {decoding.Decoder} decoder
     */
    constructor (decoder) {
      this.restDecoder = decoder;
    }

    resetDsCurVal () {
      // nop
    }

    /**
     * @return {number}
     */
    readDsClock () {
      return readVarUint(this.restDecoder)
    }

    /**
     * @return {number}
     */
    readDsLen () {
      return readVarUint(this.restDecoder)
    }
  }

  class UpdateDecoderV1 extends DSDecoderV1 {
    /**
     * @return {ID}
     */
    readLeftID () {
      return createID(readVarUint(this.restDecoder), readVarUint(this.restDecoder))
    }

    /**
     * @return {ID}
     */
    readRightID () {
      return createID(readVarUint(this.restDecoder), readVarUint(this.restDecoder))
    }

    /**
     * Read the next client id.
     * Use this in favor of readID whenever possible to reduce the number of objects created.
     */
    readClient () {
      return readVarUint(this.restDecoder)
    }

    /**
     * @return {number} info An unsigned 8-bit integer
     */
    readInfo () {
      return readUint8(this.restDecoder)
    }

    /**
     * @return {string}
     */
    readString () {
      return readVarString(this.restDecoder)
    }

    /**
     * @return {boolean} isKey
     */
    readParentInfo () {
      return readVarUint(this.restDecoder) === 1
    }

    /**
     * @return {number} info An unsigned 8-bit integer
     */
    readTypeRef () {
      return readVarUint(this.restDecoder)
    }

    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @return {number} len
     */
    readLen () {
      return readVarUint(this.restDecoder)
    }

    /**
     * @return {any}
     */
    readAny () {
      return readAny(this.restDecoder)
    }

    /**
     * @return {Uint8Array}
     */
    readBuf () {
      return copyUint8Array(readVarUint8Array(this.restDecoder))
    }

    /**
     * Legacy implementation uses JSON parse. We use any-decoding in v2.
     *
     * @return {any}
     */
    readJSON () {
      return JSON.parse(readVarString(this.restDecoder))
    }

    /**
     * @return {string}
     */
    readKey () {
      return readVarString(this.restDecoder)
    }
  }

  class DSDecoderV2 {
    /**
     * @param {decoding.Decoder} decoder
     */
    constructor (decoder) {
      /**
       * @private
       */
      this.dsCurrVal = 0;
      this.restDecoder = decoder;
    }

    resetDsCurVal () {
      this.dsCurrVal = 0;
    }

    /**
     * @return {number}
     */
    readDsClock () {
      this.dsCurrVal += readVarUint(this.restDecoder);
      return this.dsCurrVal
    }

    /**
     * @return {number}
     */
    readDsLen () {
      const diff = readVarUint(this.restDecoder) + 1;
      this.dsCurrVal += diff;
      return diff
    }
  }

  class UpdateDecoderV2 extends DSDecoderV2 {
    /**
     * @param {decoding.Decoder} decoder
     */
    constructor (decoder) {
      super(decoder);
      /**
       * List of cached keys. If the keys[id] does not exist, we read a new key
       * from stringEncoder and push it to keys.
       *
       * @type {Array<string>}
       */
      this.keys = [];
      readVarUint(decoder); // read feature flag - currently unused
      this.keyClockDecoder = new IntDiffOptRleDecoder(readVarUint8Array(decoder));
      this.clientDecoder = new UintOptRleDecoder(readVarUint8Array(decoder));
      this.leftClockDecoder = new IntDiffOptRleDecoder(readVarUint8Array(decoder));
      this.rightClockDecoder = new IntDiffOptRleDecoder(readVarUint8Array(decoder));
      this.infoDecoder = new RleDecoder(readVarUint8Array(decoder), readUint8);
      this.stringDecoder = new StringDecoder(readVarUint8Array(decoder));
      this.parentInfoDecoder = new RleDecoder(readVarUint8Array(decoder), readUint8);
      this.typeRefDecoder = new UintOptRleDecoder(readVarUint8Array(decoder));
      this.lenDecoder = new UintOptRleDecoder(readVarUint8Array(decoder));
    }

    /**
     * @return {ID}
     */
    readLeftID () {
      return new ID(this.clientDecoder.read(), this.leftClockDecoder.read())
    }

    /**
     * @return {ID}
     */
    readRightID () {
      return new ID(this.clientDecoder.read(), this.rightClockDecoder.read())
    }

    /**
     * Read the next client id.
     * Use this in favor of readID whenever possible to reduce the number of objects created.
     */
    readClient () {
      return this.clientDecoder.read()
    }

    /**
     * @return {number} info An unsigned 8-bit integer
     */
    readInfo () {
      return /** @type {number} */ (this.infoDecoder.read())
    }

    /**
     * @return {string}
     */
    readString () {
      return this.stringDecoder.read()
    }

    /**
     * @return {boolean}
     */
    readParentInfo () {
      return this.parentInfoDecoder.read() === 1
    }

    /**
     * @return {number} An unsigned 8-bit integer
     */
    readTypeRef () {
      return this.typeRefDecoder.read()
    }

    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @return {number}
     */
    readLen () {
      return this.lenDecoder.read()
    }

    /**
     * @return {any}
     */
    readAny () {
      return readAny(this.restDecoder)
    }

    /**
     * @return {Uint8Array}
     */
    readBuf () {
      return readVarUint8Array(this.restDecoder)
    }

    /**
     * This is mainly here for legacy purposes.
     *
     * Initial we incoded objects using JSON. Now we use the much faster lib0/any-encoder. This method mainly exists for legacy purposes for the v1 encoder.
     *
     * @return {any}
     */
    readJSON () {
      return readAny(this.restDecoder)
    }

    /**
     * @return {string}
     */
    readKey () {
      const keyClock = this.keyClockDecoder.read();
      if (keyClock < this.keys.length) {
        return this.keys[keyClock]
      } else {
        const key = this.stringDecoder.read();
        this.keys.push(key);
        return key
      }
    }
  }

  class DSEncoderV1 {
    constructor () {
      this.restEncoder = createEncoder();
    }

    toUint8Array () {
      return toUint8Array(this.restEncoder)
    }

    resetDsCurVal () {
      // nop
    }

    /**
     * @param {number} clock
     */
    writeDsClock (clock) {
      writeVarUint(this.restEncoder, clock);
    }

    /**
     * @param {number} len
     */
    writeDsLen (len) {
      writeVarUint(this.restEncoder, len);
    }
  }

  class UpdateEncoderV1 extends DSEncoderV1 {
    /**
     * @param {ID} id
     */
    writeLeftID (id) {
      writeVarUint(this.restEncoder, id.client);
      writeVarUint(this.restEncoder, id.clock);
    }

    /**
     * @param {ID} id
     */
    writeRightID (id) {
      writeVarUint(this.restEncoder, id.client);
      writeVarUint(this.restEncoder, id.clock);
    }

    /**
     * Use writeClient and writeClock instead of writeID if possible.
     * @param {number} client
     */
    writeClient (client) {
      writeVarUint(this.restEncoder, client);
    }

    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeInfo (info) {
      writeUint8(this.restEncoder, info);
    }

    /**
     * @param {string} s
     */
    writeString (s) {
      writeVarString(this.restEncoder, s);
    }

    /**
     * @param {boolean} isYKey
     */
    writeParentInfo (isYKey) {
      writeVarUint(this.restEncoder, isYKey ? 1 : 0);
    }

    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeTypeRef (info) {
      writeVarUint(this.restEncoder, info);
    }

    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @param {number} len
     */
    writeLen (len) {
      writeVarUint(this.restEncoder, len);
    }

    /**
     * @param {any} any
     */
    writeAny (any) {
      writeAny(this.restEncoder, any);
    }

    /**
     * @param {Uint8Array} buf
     */
    writeBuf (buf) {
      writeVarUint8Array(this.restEncoder, buf);
    }

    /**
     * @param {any} embed
     */
    writeJSON (embed) {
      writeVarString(this.restEncoder, JSON.stringify(embed));
    }

    /**
     * @param {string} key
     */
    writeKey (key) {
      writeVarString(this.restEncoder, key);
    }
  }

  class DSEncoderV2 {
    constructor () {
      this.restEncoder = createEncoder(); // encodes all the rest / non-optimized
      this.dsCurrVal = 0;
    }

    toUint8Array () {
      return toUint8Array(this.restEncoder)
    }

    resetDsCurVal () {
      this.dsCurrVal = 0;
    }

    /**
     * @param {number} clock
     */
    writeDsClock (clock) {
      const diff = clock - this.dsCurrVal;
      this.dsCurrVal = clock;
      writeVarUint(this.restEncoder, diff);
    }

    /**
     * @param {number} len
     */
    writeDsLen (len) {
      if (len === 0) {
        unexpectedCase();
      }
      writeVarUint(this.restEncoder, len - 1);
      this.dsCurrVal += len;
    }
  }

  class UpdateEncoderV2 extends DSEncoderV2 {
    constructor () {
      super();
      /**
       * @type {Map<string,number>}
       */
      this.keyMap = new Map();
      /**
       * Refers to the next uniqe key-identifier to me used.
       * See writeKey method for more information.
       *
       * @type {number}
       */
      this.keyClock = 0;
      this.keyClockEncoder = new IntDiffOptRleEncoder();
      this.clientEncoder = new UintOptRleEncoder();
      this.leftClockEncoder = new IntDiffOptRleEncoder();
      this.rightClockEncoder = new IntDiffOptRleEncoder();
      this.infoEncoder = new RleEncoder(writeUint8);
      this.stringEncoder = new StringEncoder();
      this.parentInfoEncoder = new RleEncoder(writeUint8);
      this.typeRefEncoder = new UintOptRleEncoder();
      this.lenEncoder = new UintOptRleEncoder();
    }

    toUint8Array () {
      const encoder = createEncoder();
      writeVarUint(encoder, 0); // this is a feature flag that we might use in the future
      writeVarUint8Array(encoder, this.keyClockEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.clientEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.leftClockEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.rightClockEncoder.toUint8Array());
      writeVarUint8Array(encoder, toUint8Array(this.infoEncoder));
      writeVarUint8Array(encoder, this.stringEncoder.toUint8Array());
      writeVarUint8Array(encoder, toUint8Array(this.parentInfoEncoder));
      writeVarUint8Array(encoder, this.typeRefEncoder.toUint8Array());
      writeVarUint8Array(encoder, this.lenEncoder.toUint8Array());
      // @note The rest encoder is appended! (note the missing var)
      writeUint8Array(encoder, toUint8Array(this.restEncoder));
      return toUint8Array(encoder)
    }

    /**
     * @param {ID} id
     */
    writeLeftID (id) {
      this.clientEncoder.write(id.client);
      this.leftClockEncoder.write(id.clock);
    }

    /**
     * @param {ID} id
     */
    writeRightID (id) {
      this.clientEncoder.write(id.client);
      this.rightClockEncoder.write(id.clock);
    }

    /**
     * @param {number} client
     */
    writeClient (client) {
      this.clientEncoder.write(client);
    }

    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeInfo (info) {
      this.infoEncoder.write(info);
    }

    /**
     * @param {string} s
     */
    writeString (s) {
      this.stringEncoder.write(s);
    }

    /**
     * @param {boolean} isYKey
     */
    writeParentInfo (isYKey) {
      this.parentInfoEncoder.write(isYKey ? 1 : 0);
    }

    /**
     * @param {number} info An unsigned 8-bit integer
     */
    writeTypeRef (info) {
      this.typeRefEncoder.write(info);
    }

    /**
     * Write len of a struct - well suited for Opt RLE encoder.
     *
     * @param {number} len
     */
    writeLen (len) {
      this.lenEncoder.write(len);
    }

    /**
     * @param {any} any
     */
    writeAny (any) {
      writeAny(this.restEncoder, any);
    }

    /**
     * @param {Uint8Array} buf
     */
    writeBuf (buf) {
      writeVarUint8Array(this.restEncoder, buf);
    }

    /**
     * This is mainly here for legacy purposes.
     *
     * Initial we incoded objects using JSON. Now we use the much faster lib0/any-encoder. This method mainly exists for legacy purposes for the v1 encoder.
     *
     * @param {any} embed
     */
    writeJSON (embed) {
      writeAny(this.restEncoder, embed);
    }

    /**
     * Property keys are often reused. For example, in y-prosemirror the key `bold` might
     * occur very often. For a 3d application, the key `position` might occur very often.
     *
     * We cache these keys in a Map and refer to them via a unique number.
     *
     * @param {string} key
     */
    writeKey (key) {
      const clock = this.keyMap.get(key);
      if (clock === undefined) {
        /**
         * @todo uncomment to introduce this feature finally
         *
         * Background. The ContentFormat object was always encoded using writeKey, but the decoder used to use readString.
         * Furthermore, I forgot to set the keyclock. So everything was working fine.
         *
         * However, this feature here is basically useless as it is not being used (it actually only consumes extra memory).
         *
         * I don't know yet how to reintroduce this feature..
         *
         * Older clients won't be able to read updates when we reintroduce this feature. So this should probably be done using a flag.
         *
         */
        // this.keyMap.set(key, this.keyClock)
        this.keyClockEncoder.write(this.keyClock++);
        this.stringEncoder.write(key);
      } else {
        this.keyClockEncoder.write(clock);
      }
    }
  }

  /**
   * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
   * @param {Array<GC|Item>} structs All structs by `client`
   * @param {number} client
   * @param {number} clock write structs starting with `ID(client,clock)`
   *
   * @function
   */
  const writeStructs = (encoder, structs, client, clock) => {
    // write first id
    clock = max(clock, structs[0].id.clock); // make sure the first id exists
    const startNewStructs = findIndexSS(structs, clock);
    // write # encoded structs
    writeVarUint(encoder.restEncoder, structs.length - startNewStructs);
    encoder.writeClient(client);
    writeVarUint(encoder.restEncoder, clock);
    const firstStruct = structs[startNewStructs];
    // write first struct with an offset
    firstStruct.write(encoder, clock - firstStruct.id.clock);
    for (let i = startNewStructs + 1; i < structs.length; i++) {
      structs[i].write(encoder, 0);
    }
  };

  /**
   * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
   * @param {StructStore} store
   * @param {Map<number,number>} _sm
   *
   * @private
   * @function
   */
  const writeClientsStructs = (encoder, store, _sm) => {
    // we filter all valid _sm entries into sm
    const sm = new Map();
    _sm.forEach((clock, client) => {
      // only write if new structs are available
      if (getState(store, client) > clock) {
        sm.set(client, clock);
      }
    });
    getStateVector(store).forEach((clock, client) => {
      if (!_sm.has(client)) {
        sm.set(client, 0);
      }
    });
    // write # states that were updated
    writeVarUint(encoder.restEncoder, sm.size);
    // Write items with higher client ids first
    // This heavily improves the conflict algorithm.
    Array.from(sm.entries()).sort((a, b) => b[0] - a[0]).forEach(([client, clock]) => {
      // @ts-ignore
      writeStructs(encoder, store.clients.get(client), client, clock);
    });
  };

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder The decoder object to read data from.
   * @param {Doc} doc
   * @return {Map<number, { i: number, refs: Array<Item | GC> }>}
   *
   * @private
   * @function
   */
  const readClientsStructRefs = (decoder, doc) => {
    /**
     * @type {Map<number, { i: number, refs: Array<Item | GC> }>}
     */
    const clientRefs = create$6();
    const numOfStateUpdates = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numOfStateUpdates; i++) {
      const numberOfStructs = readVarUint(decoder.restDecoder);
      /**
       * @type {Array<GC|Item>}
       */
      const refs = new Array(numberOfStructs);
      const client = decoder.readClient();
      let clock = readVarUint(decoder.restDecoder);
      // const start = performance.now()
      clientRefs.set(client, { i: 0, refs });
      for (let i = 0; i < numberOfStructs; i++) {
        const info = decoder.readInfo();
        switch (BITS5 & info) {
          case 0: { // GC
            const len = decoder.readLen();
            refs[i] = new GC(createID(client, clock), len);
            clock += len;
            break
          }
          case 10: { // Skip Struct (nothing to apply)
            // @todo we could reduce the amount of checks by adding Skip struct to clientRefs so we know that something is missing.
            const len = readVarUint(decoder.restDecoder);
            refs[i] = new Skip(createID(client, clock), len);
            clock += len;
            break
          }
          default: { // Item with content
            /**
             * The optimized implementation doesn't use any variables because inlining variables is faster.
             * Below a non-optimized version is shown that implements the basic algorithm with
             * a few comments
             */
            const cantCopyParentInfo = (info & (BIT7 | BIT8)) === 0;
            // If parent = null and neither left nor right are defined, then we know that `parent` is child of `y`
            // and we read the next string as parentYKey.
            // It indicates how we store/retrieve parent from `y.share`
            // @type {string|null}
            const struct = new Item(
              createID(client, clock),
              null, // leftd
              (info & BIT8) === BIT8 ? decoder.readLeftID() : null, // origin
              null, // right
              (info & BIT7) === BIT7 ? decoder.readRightID() : null, // right origin
              cantCopyParentInfo ? (decoder.readParentInfo() ? doc.get(decoder.readString()) : decoder.readLeftID()) : null, // parent
              cantCopyParentInfo && (info & BIT6) === BIT6 ? decoder.readString() : null, // parentSub
              readItemContent(decoder, info) // item content
            );
            /* A non-optimized implementation of the above algorithm:

            // The item that was originally to the left of this item.
            const origin = (info & binary.BIT8) === binary.BIT8 ? decoder.readLeftID() : null
            // The item that was originally to the right of this item.
            const rightOrigin = (info & binary.BIT7) === binary.BIT7 ? decoder.readRightID() : null
            const cantCopyParentInfo = (info & (binary.BIT7 | binary.BIT8)) === 0
            const hasParentYKey = cantCopyParentInfo ? decoder.readParentInfo() : false
            // If parent = null and neither left nor right are defined, then we know that `parent` is child of `y`
            // and we read the next string as parentYKey.
            // It indicates how we store/retrieve parent from `y.share`
            // @type {string|null}
            const parentYKey = cantCopyParentInfo && hasParentYKey ? decoder.readString() : null

            const struct = new Item(
              createID(client, clock),
              null, // leftd
              origin, // origin
              null, // right
              rightOrigin, // right origin
              cantCopyParentInfo && !hasParentYKey ? decoder.readLeftID() : (parentYKey !== null ? doc.get(parentYKey) : null), // parent
              cantCopyParentInfo && (info & binary.BIT6) === binary.BIT6 ? decoder.readString() : null, // parentSub
              readItemContent(decoder, info) // item content
            )
            */
            refs[i] = struct;
            clock += struct.length;
          }
        }
      }
      // console.log('time to read: ', performance.now() - start) // @todo remove
    }
    return clientRefs
  };

  /**
   * Resume computing structs generated by struct readers.
   *
   * While there is something to do, we integrate structs in this order
   * 1. top element on stack, if stack is not empty
   * 2. next element from current struct reader (if empty, use next struct reader)
   *
   * If struct causally depends on another struct (ref.missing), we put next reader of
   * `ref.id.client` on top of stack.
   *
   * At some point we find a struct that has no causal dependencies,
   * then we start emptying the stack.
   *
   * It is not possible to have circles: i.e. struct1 (from client1) depends on struct2 (from client2)
   * depends on struct3 (from client1). Therefore the max stack size is eqaul to `structReaders.length`.
   *
   * This method is implemented in a way so that we can resume computation if this update
   * causally depends on another update.
   *
   * @param {Transaction} transaction
   * @param {StructStore} store
   * @param {Map<number, { i: number, refs: (GC | Item)[] }>} clientsStructRefs
   * @return { null | { update: Uint8Array, missing: Map<number,number> } }
   *
   * @private
   * @function
   */
  const integrateStructs = (transaction, store, clientsStructRefs) => {
    /**
     * @type {Array<Item | GC>}
     */
    const stack = [];
    // sort them so that we take the higher id first, in case of conflicts the lower id will probably not conflict with the id from the higher user.
    let clientsStructRefsIds = Array.from(clientsStructRefs.keys()).sort((a, b) => a - b);
    if (clientsStructRefsIds.length === 0) {
      return null
    }
    const getNextStructTarget = () => {
      if (clientsStructRefsIds.length === 0) {
        return null
      }
      let nextStructsTarget = /** @type {{i:number,refs:Array<GC|Item>}} */ (clientsStructRefs.get(clientsStructRefsIds[clientsStructRefsIds.length - 1]));
      while (nextStructsTarget.refs.length === nextStructsTarget.i) {
        clientsStructRefsIds.pop();
        if (clientsStructRefsIds.length > 0) {
          nextStructsTarget = /** @type {{i:number,refs:Array<GC|Item>}} */ (clientsStructRefs.get(clientsStructRefsIds[clientsStructRefsIds.length - 1]));
        } else {
          return null
        }
      }
      return nextStructsTarget
    };
    let curStructsTarget = getNextStructTarget();
    if (curStructsTarget === null && stack.length === 0) {
      return null
    }

    /**
     * @type {StructStore}
     */
    const restStructs = new StructStore();
    const missingSV = new Map();
    /**
     * @param {number} client
     * @param {number} clock
     */
    const updateMissingSv = (client, clock) => {
      const mclock = missingSV.get(client);
      if (mclock == null || mclock > clock) {
        missingSV.set(client, clock);
      }
    };
    /**
     * @type {GC|Item}
     */
    let stackHead = /** @type {any} */ (curStructsTarget).refs[/** @type {any} */ (curStructsTarget).i++];
    // caching the state because it is used very often
    const state = new Map();

    const addStackToRestSS = () => {
      for (const item of stack) {
        const client = item.id.client;
        const unapplicableItems = clientsStructRefs.get(client);
        if (unapplicableItems) {
          // decrement because we weren't able to apply previous operation
          unapplicableItems.i--;
          restStructs.clients.set(client, unapplicableItems.refs.slice(unapplicableItems.i));
          clientsStructRefs.delete(client);
          unapplicableItems.i = 0;
          unapplicableItems.refs = [];
        } else {
          // item was the last item on clientsStructRefs and the field was already cleared. Add item to restStructs and continue
          restStructs.clients.set(client, [item]);
        }
        // remove client from clientsStructRefsIds to prevent users from applying the same update again
        clientsStructRefsIds = clientsStructRefsIds.filter(c => c !== client);
      }
      stack.length = 0;
    };

    // iterate over all struct readers until we are done
    while (true) {
      if (stackHead.constructor !== Skip) {
        const localClock = setIfUndefined(state, stackHead.id.client, () => getState(store, stackHead.id.client));
        const offset = localClock - stackHead.id.clock;
        if (offset < 0) {
          // update from the same client is missing
          stack.push(stackHead);
          updateMissingSv(stackHead.id.client, stackHead.id.clock - 1);
          // hid a dead wall, add all items from stack to restSS
          addStackToRestSS();
        } else {
          const missing = stackHead.getMissing(transaction, store);
          if (missing !== null) {
            stack.push(stackHead);
            // get the struct reader that has the missing struct
            /**
             * @type {{ refs: Array<GC|Item>, i: number }}
             */
            const structRefs = clientsStructRefs.get(/** @type {number} */ (missing)) || { refs: [], i: 0 };
            if (structRefs.refs.length === structRefs.i) {
              // This update message causally depends on another update message that doesn't exist yet
              updateMissingSv(/** @type {number} */ (missing), getState(store, missing));
              addStackToRestSS();
            } else {
              stackHead = structRefs.refs[structRefs.i++];
              continue
            }
          } else if (offset === 0 || offset < stackHead.length) {
            // all fine, apply the stackhead
            stackHead.integrate(transaction, offset);
            state.set(stackHead.id.client, stackHead.id.clock + stackHead.length);
          }
        }
      }
      // iterate to next stackHead
      if (stack.length > 0) {
        stackHead = /** @type {GC|Item} */ (stack.pop());
      } else if (curStructsTarget !== null && curStructsTarget.i < curStructsTarget.refs.length) {
        stackHead = /** @type {GC|Item} */ (curStructsTarget.refs[curStructsTarget.i++]);
      } else {
        curStructsTarget = getNextStructTarget();
        if (curStructsTarget === null) {
          // we are done!
          break
        } else {
          stackHead = /** @type {GC|Item} */ (curStructsTarget.refs[curStructsTarget.i++]);
        }
      }
    }
    if (restStructs.clients.size > 0) {
      const encoder = new UpdateEncoderV2();
      writeClientsStructs(encoder, restStructs, new Map());
      // write empty deleteset
      // writeDeleteSet(encoder, new DeleteSet())
      writeVarUint(encoder.restEncoder, 0); // => no need for an extra function call, just write 0 deletes
      return { missing: missingSV, update: encoder.toUint8Array() }
    }
    return null
  };

  /**
   * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
   * @param {Transaction} transaction
   *
   * @private
   * @function
   */
  const writeStructsFromTransaction = (encoder, transaction) => writeClientsStructs(encoder, transaction.doc.store, transaction.beforeState);

  /**
   * Read and apply a document update.
   *
   * This function has the same effect as `applyUpdate` but accepts an decoder.
   *
   * @param {decoding.Decoder} decoder
   * @param {Doc} ydoc
   * @param {any} [transactionOrigin] This will be stored on `transaction.origin` and `.on('update', (update, origin))`
   * @param {UpdateDecoderV1 | UpdateDecoderV2} [structDecoder]
   *
   * @function
   */
  const readUpdateV2 = (decoder, ydoc, transactionOrigin, structDecoder = new UpdateDecoderV2(decoder)) =>
    transact(ydoc, transaction => {
      // force that transaction.local is set to non-local
      transaction.local = false;
      let retry = false;
      const doc = transaction.doc;
      const store = doc.store;
      // let start = performance.now()
      const ss = readClientsStructRefs(structDecoder, doc);
      // console.log('time to read structs: ', performance.now() - start) // @todo remove
      // start = performance.now()
      // console.log('time to merge: ', performance.now() - start) // @todo remove
      // start = performance.now()
      const restStructs = integrateStructs(transaction, store, ss);
      const pending = store.pendingStructs;
      if (pending) {
        // check if we can apply something
        for (const [client, clock] of pending.missing) {
          if (clock < getState(store, client)) {
            retry = true;
            break
          }
        }
        if (restStructs) {
          // merge restStructs into store.pending
          for (const [client, clock] of restStructs.missing) {
            const mclock = pending.missing.get(client);
            if (mclock == null || mclock > clock) {
              pending.missing.set(client, clock);
            }
          }
          pending.update = mergeUpdatesV2([pending.update, restStructs.update]);
        }
      } else {
        store.pendingStructs = restStructs;
      }
      // console.log('time to integrate: ', performance.now() - start) // @todo remove
      // start = performance.now()
      const dsRest = readAndApplyDeleteSet(structDecoder, transaction, store);
      if (store.pendingDs) {
        // @todo we could make a lower-bound state-vector check as we do above
        const pendingDSUpdate = new UpdateDecoderV2(createDecoder(store.pendingDs));
        readVarUint(pendingDSUpdate.restDecoder); // read 0 structs, because we only encode deletes in pendingdsupdate
        const dsRest2 = readAndApplyDeleteSet(pendingDSUpdate, transaction, store);
        if (dsRest && dsRest2) {
          // case 1: ds1 != null && ds2 != null
          store.pendingDs = mergeUpdatesV2([dsRest, dsRest2]);
        } else {
          // case 2: ds1 != null
          // case 3: ds2 != null
          // case 4: ds1 == null && ds2 == null
          store.pendingDs = dsRest || dsRest2;
        }
      } else {
        // Either dsRest == null && pendingDs == null OR dsRest != null
        store.pendingDs = dsRest;
      }
      // console.log('time to cleanup: ', performance.now() - start) // @todo remove
      // start = performance.now()

      // console.log('time to resume delete readers: ', performance.now() - start) // @todo remove
      // start = performance.now()
      if (retry) {
        const update = /** @type {{update: Uint8Array}} */ (store.pendingStructs).update;
        store.pendingStructs = null;
        applyUpdateV2(transaction.doc, update);
      }
    }, transactionOrigin, false);

  /**
   * Read and apply a document update.
   *
   * This function has the same effect as `applyUpdate` but accepts an decoder.
   *
   * @param {decoding.Decoder} decoder
   * @param {Doc} ydoc
   * @param {any} [transactionOrigin] This will be stored on `transaction.origin` and `.on('update', (update, origin))`
   *
   * @function
   */
  const readUpdate$1 = (decoder, ydoc, transactionOrigin) => readUpdateV2(decoder, ydoc, transactionOrigin, new UpdateDecoderV1(decoder));

  /**
   * Apply a document update created by, for example, `y.on('update', update => ..)` or `update = encodeStateAsUpdate()`.
   *
   * This function has the same effect as `readUpdate` but accepts an Uint8Array instead of a Decoder.
   *
   * @param {Doc} ydoc
   * @param {Uint8Array} update
   * @param {any} [transactionOrigin] This will be stored on `transaction.origin` and `.on('update', (update, origin))`
   * @param {typeof UpdateDecoderV1 | typeof UpdateDecoderV2} [YDecoder]
   *
   * @function
   */
  const applyUpdateV2 = (ydoc, update, transactionOrigin, YDecoder = UpdateDecoderV2) => {
    const decoder = createDecoder(update);
    readUpdateV2(decoder, ydoc, transactionOrigin, new YDecoder(decoder));
  };

  /**
   * Apply a document update created by, for example, `y.on('update', update => ..)` or `update = encodeStateAsUpdate()`.
   *
   * This function has the same effect as `readUpdate` but accepts an Uint8Array instead of a Decoder.
   *
   * @param {Doc} ydoc
   * @param {Uint8Array} update
   * @param {any} [transactionOrigin] This will be stored on `transaction.origin` and `.on('update', (update, origin))`
   *
   * @function
   */
  const applyUpdate = (ydoc, update, transactionOrigin) => applyUpdateV2(ydoc, update, transactionOrigin, UpdateDecoderV1);

  /**
   * Write all the document as a single update message. If you specify the state of the remote client (`targetStateVector`) it will
   * only write the operations that are missing.
   *
   * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
   * @param {Doc} doc
   * @param {Map<number,number>} [targetStateVector] The state of the target that receives the update. Leave empty to write all known structs
   *
   * @function
   */
  const writeStateAsUpdate = (encoder, doc, targetStateVector = new Map()) => {
    writeClientsStructs(encoder, doc.store, targetStateVector);
    writeDeleteSet(encoder, createDeleteSetFromStructStore(doc.store));
  };

  /**
   * Write all the document as a single update message that can be applied on the remote document. If you specify the state of the remote client (`targetState`) it will
   * only write the operations that are missing.
   *
   * Use `writeStateAsUpdate` instead if you are working with lib0/encoding.js#Encoder
   *
   * @param {Doc} doc
   * @param {Uint8Array} [encodedTargetStateVector] The state of the target that receives the update. Leave empty to write all known structs
   * @param {UpdateEncoderV1 | UpdateEncoderV2} [encoder]
   * @return {Uint8Array}
   *
   * @function
   */
  const encodeStateAsUpdateV2 = (doc, encodedTargetStateVector = new Uint8Array([0]), encoder = new UpdateEncoderV2()) => {
    const targetStateVector = decodeStateVector(encodedTargetStateVector);
    writeStateAsUpdate(encoder, doc, targetStateVector);
    const updates = [encoder.toUint8Array()];
    // also add the pending updates (if there are any)
    if (doc.store.pendingDs) {
      updates.push(doc.store.pendingDs);
    }
    if (doc.store.pendingStructs) {
      updates.push(diffUpdateV2(doc.store.pendingStructs.update, encodedTargetStateVector));
    }
    if (updates.length > 1) {
      if (encoder.constructor === UpdateEncoderV1) {
        return mergeUpdates(updates.map((update, i) => i === 0 ? update : convertUpdateFormatV2ToV1(update)))
      } else if (encoder.constructor === UpdateEncoderV2) {
        return mergeUpdatesV2(updates)
      }
    }
    return updates[0]
  };

  /**
   * Write all the document as a single update message that can be applied on the remote document. If you specify the state of the remote client (`targetState`) it will
   * only write the operations that are missing.
   *
   * Use `writeStateAsUpdate` instead if you are working with lib0/encoding.js#Encoder
   *
   * @param {Doc} doc
   * @param {Uint8Array} [encodedTargetStateVector] The state of the target that receives the update. Leave empty to write all known structs
   * @return {Uint8Array}
   *
   * @function
   */
  const encodeStateAsUpdate = (doc, encodedTargetStateVector) => encodeStateAsUpdateV2(doc, encodedTargetStateVector, new UpdateEncoderV1());

  /**
   * Read state vector from Decoder and return as Map
   *
   * @param {DSDecoderV1 | DSDecoderV2} decoder
   * @return {Map<number,number>} Maps `client` to the number next expected `clock` from that client.
   *
   * @function
   */
  const readStateVector = decoder => {
    const ss = new Map();
    const ssLength = readVarUint(decoder.restDecoder);
    for (let i = 0; i < ssLength; i++) {
      const client = readVarUint(decoder.restDecoder);
      const clock = readVarUint(decoder.restDecoder);
      ss.set(client, clock);
    }
    return ss
  };

  /**
   * Read decodedState and return State as Map.
   *
   * @param {Uint8Array} decodedState
   * @return {Map<number,number>} Maps `client` to the number next expected `clock` from that client.
   *
   * @function
   */
  // export const decodeStateVectorV2 = decodedState => readStateVector(new DSDecoderV2(decoding.createDecoder(decodedState)))

  /**
   * Read decodedState and return State as Map.
   *
   * @param {Uint8Array} decodedState
   * @return {Map<number,number>} Maps `client` to the number next expected `clock` from that client.
   *
   * @function
   */
  const decodeStateVector = decodedState => readStateVector(new DSDecoderV1(createDecoder(decodedState)));

  /**
   * @param {DSEncoderV1 | DSEncoderV2} encoder
   * @param {Map<number,number>} sv
   * @function
   */
  const writeStateVector = (encoder, sv) => {
    writeVarUint(encoder.restEncoder, sv.size);
    Array.from(sv.entries()).sort((a, b) => b[0] - a[0]).forEach(([client, clock]) => {
      writeVarUint(encoder.restEncoder, client); // @todo use a special client decoder that is based on mapping
      writeVarUint(encoder.restEncoder, clock);
    });
    return encoder
  };

  /**
   * @param {DSEncoderV1 | DSEncoderV2} encoder
   * @param {Doc} doc
   *
   * @function
   */
  const writeDocumentStateVector = (encoder, doc) => writeStateVector(encoder, getStateVector(doc.store));

  /**
   * Encode State as Uint8Array.
   *
   * @param {Doc|Map<number,number>} doc
   * @param {DSEncoderV1 | DSEncoderV2} [encoder]
   * @return {Uint8Array}
   *
   * @function
   */
  const encodeStateVectorV2 = (doc, encoder = new DSEncoderV2()) => {
    if (doc instanceof Map) {
      writeStateVector(encoder, doc);
    } else {
      writeDocumentStateVector(encoder, doc);
    }
    return encoder.toUint8Array()
  };

  /**
   * Encode State as Uint8Array.
   *
   * @param {Doc|Map<number,number>} doc
   * @return {Uint8Array}
   *
   * @function
   */
  const encodeStateVector = doc => encodeStateVectorV2(doc, new DSEncoderV1());

  /**
   * General event handler implementation.
   *
   * @template ARG0, ARG1
   *
   * @private
   */
  class EventHandler {
    constructor () {
      /**
       * @type {Array<function(ARG0, ARG1):void>}
       */
      this.l = [];
    }
  }

  /**
   * @template ARG0,ARG1
   * @returns {EventHandler<ARG0,ARG1>}
   *
   * @private
   * @function
   */
  const createEventHandler = () => new EventHandler();

  /**
   * Adds an event listener that is called when
   * {@link EventHandler#callEventListeners} is called.
   *
   * @template ARG0,ARG1
   * @param {EventHandler<ARG0,ARG1>} eventHandler
   * @param {function(ARG0,ARG1):void} f The event handler.
   *
   * @private
   * @function
   */
  const addEventHandlerListener = (eventHandler, f) =>
    eventHandler.l.push(f);

  /**
   * Removes an event listener.
   *
   * @template ARG0,ARG1
   * @param {EventHandler<ARG0,ARG1>} eventHandler
   * @param {function(ARG0,ARG1):void} f The event handler that was added with
   *                     {@link EventHandler#addEventListener}
   *
   * @private
   * @function
   */
  const removeEventHandlerListener = (eventHandler, f) => {
    const l = eventHandler.l;
    const len = l.length;
    eventHandler.l = l.filter(g => f !== g);
    if (len === eventHandler.l.length) {
      console.error('[yjs] Tried to remove event handler that doesn\'t exist.');
    }
  };

  /**
   * Call all event listeners that were added via
   * {@link EventHandler#addEventListener}.
   *
   * @template ARG0,ARG1
   * @param {EventHandler<ARG0,ARG1>} eventHandler
   * @param {ARG0} arg0
   * @param {ARG1} arg1
   *
   * @private
   * @function
   */
  const callEventHandlerListeners = (eventHandler, arg0, arg1) =>
    callAll(eventHandler.l, [arg0, arg1]);

  class ID {
    /**
     * @param {number} client client id
     * @param {number} clock unique per client id, continuous number
     */
    constructor (client, clock) {
      /**
       * Client id
       * @type {number}
       */
      this.client = client;
      /**
       * unique per client id, continuous number
       * @type {number}
       */
      this.clock = clock;
    }
  }

  /**
   * @param {ID | null} a
   * @param {ID | null} b
   * @return {boolean}
   *
   * @function
   */
  const compareIDs = (a, b) => a === b || (a !== null && b !== null && a.client === b.client && a.clock === b.clock);

  /**
   * @param {number} client
   * @param {number} clock
   *
   * @private
   * @function
   */
  const createID = (client, clock) => new ID(client, clock);

  /**
   * @param {encoding.Encoder} encoder
   * @param {ID} id
   *
   * @private
   * @function
   */
  const writeID = (encoder, id) => {
    writeVarUint(encoder, id.client);
    writeVarUint(encoder, id.clock);
  };

  /**
   * Read ID.
   * * If first varUint read is 0xFFFFFF a RootID is returned.
   * * Otherwise an ID is returned
   *
   * @param {decoding.Decoder} decoder
   * @return {ID}
   *
   * @private
   * @function
   */
  const readID = decoder =>
    createID(readVarUint(decoder), readVarUint(decoder));

  /**
   * The top types are mapped from y.share.get(keyname) => type.
   * `type` does not store any information about the `keyname`.
   * This function finds the correct `keyname` for `type` and throws otherwise.
   *
   * @param {AbstractType<any>} type
   * @return {string}
   *
   * @private
   * @function
   */
  const findRootTypeKey = type => {
    // @ts-ignore _y must be defined, otherwise unexpected case
    for (const [key, value] of type.doc.share.entries()) {
      if (value === type) {
        return key
      }
    }
    throw unexpectedCase()
  };

  /**
   * Check if `parent` is a parent of `child`.
   *
   * @param {AbstractType<any>} parent
   * @param {Item|null} child
   * @return {Boolean} Whether `parent` is a parent of `child`.
   *
   * @private
   * @function
   */
  const isParentOf = (parent, child) => {
    while (child !== null) {
      if (child.parent === parent) {
        return true
      }
      child = /** @type {AbstractType<any>} */ (child.parent)._item;
    }
    return false
  };

  /**
   * Convenient helper to log type information.
   *
   * Do not use in productive systems as the output can be immense!
   *
   * @param {AbstractType<any>} type
   */
  const logType = type => {
    const res = [];
    let n = type._start;
    while (n) {
      res.push(n);
      n = n.right;
    }
    console.log('Children: ', res);
    console.log('Children content: ', res.filter(m => !m.deleted).map(m => m.content));
  };

  class PermanentUserData {
    /**
     * @param {Doc} doc
     * @param {YMap<any>} [storeType]
     */
    constructor (doc, storeType = doc.getMap('users')) {
      /**
       * @type {Map<string,DeleteSet>}
       */
      const dss = new Map();
      this.yusers = storeType;
      this.doc = doc;
      /**
       * Maps from clientid to userDescription
       *
       * @type {Map<number,string>}
       */
      this.clients = new Map();
      this.dss = dss;
      /**
       * @param {YMap<any>} user
       * @param {string} userDescription
       */
      const initUser = (user, userDescription) => {
        /**
         * @type {YArray<Uint8Array>}
         */
        const ds = user.get('ds');
        const ids = user.get('ids');
        const addClientId = /** @param {number} clientid */ clientid => this.clients.set(clientid, userDescription);
        ds.observe(/** @param {YArrayEvent<any>} event */ event => {
          event.changes.added.forEach(item => {
            item.content.getContent().forEach(encodedDs => {
              if (encodedDs instanceof Uint8Array) {
                this.dss.set(userDescription, mergeDeleteSets([this.dss.get(userDescription) || createDeleteSet(), readDeleteSet(new DSDecoderV1(createDecoder(encodedDs)))]));
              }
            });
          });
        });
        this.dss.set(userDescription, mergeDeleteSets(ds.map(encodedDs => readDeleteSet(new DSDecoderV1(createDecoder(encodedDs))))));
        ids.observe(/** @param {YArrayEvent<any>} event */ event =>
          event.changes.added.forEach(item => item.content.getContent().forEach(addClientId))
        );
        ids.forEach(addClientId);
      };
      // observe users
      storeType.observe(event => {
        event.keysChanged.forEach(userDescription =>
          initUser(storeType.get(userDescription), userDescription)
        );
      });
      // add intial data
      storeType.forEach(initUser);
    }

    /**
     * @param {Doc} doc
     * @param {number} clientid
     * @param {string} userDescription
     * @param {Object} [conf]
     * @param {function(Transaction, DeleteSet):boolean} [conf.filter]
     */
    setUserMapping (doc, clientid, userDescription, { filter = () => true } = {}) {
      const users = this.yusers;
      let user = users.get(userDescription);
      if (!user) {
        user = new YMap();
        user.set('ids', new YArray());
        user.set('ds', new YArray());
        users.set(userDescription, user);
      }
      user.get('ids').push([clientid]);
      users.observe(event => {
        setTimeout(() => {
          const userOverwrite = users.get(userDescription);
          if (userOverwrite !== user) {
            // user was overwritten, port all data over to the next user object
            // @todo Experiment with Y.Sets here
            user = userOverwrite;
            // @todo iterate over old type
            this.clients.forEach((_userDescription, clientid) => {
              if (userDescription === _userDescription) {
                user.get('ids').push([clientid]);
              }
            });
            const encoder = new DSEncoderV1();
            const ds = this.dss.get(userDescription);
            if (ds) {
              writeDeleteSet(encoder, ds);
              user.get('ds').push([encoder.toUint8Array()]);
            }
          }
        }, 0);
      });
      doc.on('afterTransaction', /** @param {Transaction} transaction */ transaction => {
        setTimeout(() => {
          const yds = user.get('ds');
          const ds = transaction.deleteSet;
          if (transaction.local && ds.clients.size > 0 && filter(transaction, ds)) {
            const encoder = new DSEncoderV1();
            writeDeleteSet(encoder, ds);
            yds.push([encoder.toUint8Array()]);
          }
        });
      });
    }

    /**
     * @param {number} clientid
     * @return {any}
     */
    getUserByClientId (clientid) {
      return this.clients.get(clientid) || null
    }

    /**
     * @param {ID} id
     * @return {string | null}
     */
    getUserByDeletedId (id) {
      for (const [userDescription, ds] of this.dss.entries()) {
        if (isDeleted(ds, id)) {
          return userDescription
        }
      }
      return null
    }
  }

  /**
   * A relative position is based on the Yjs model and is not affected by document changes.
   * E.g. If you place a relative position before a certain character, it will always point to this character.
   * If you place a relative position at the end of a type, it will always point to the end of the type.
   *
   * A numeric position is often unsuited for user selections, because it does not change when content is inserted
   * before or after.
   *
   * ```Insert(0, 'x')('a|bc') = 'xa|bc'``` Where | is the relative position.
   *
   * One of the properties must be defined.
   *
   * @example
   *   // Current cursor position is at position 10
   *   const relativePosition = createRelativePositionFromIndex(yText, 10)
   *   // modify yText
   *   yText.insert(0, 'abc')
   *   yText.delete(3, 10)
   *   // Compute the cursor position
   *   const absolutePosition = createAbsolutePositionFromRelativePosition(y, relativePosition)
   *   absolutePosition.type === yText // => true
   *   console.log('cursor location is ' + absolutePosition.index) // => cursor location is 3
   *
   */
  class RelativePosition {
    /**
     * @param {ID|null} type
     * @param {string|null} tname
     * @param {ID|null} item
     * @param {number} assoc
     */
    constructor (type, tname, item, assoc = 0) {
      /**
       * @type {ID|null}
       */
      this.type = type;
      /**
       * @type {string|null}
       */
      this.tname = tname;
      /**
       * @type {ID | null}
       */
      this.item = item;
      /**
       * A relative position is associated to a specific character. By default
       * assoc >= 0, the relative position is associated to the character
       * after the meant position.
       * I.e. position 1 in 'ab' is associated to character 'b'.
       *
       * If assoc < 0, then the relative position is associated to the caharacter
       * before the meant position.
       *
       * @type {number}
       */
      this.assoc = assoc;
    }
  }

  /**
   * @param {RelativePosition} rpos
   * @return {any}
   */
  const relativePositionToJSON = rpos => {
    const json = {};
    if (rpos.type) {
      json.type = rpos.type;
    }
    if (rpos.tname) {
      json.tname = rpos.tname;
    }
    if (rpos.item) {
      json.item = rpos.item;
    }
    if (rpos.assoc != null) {
      json.assoc = rpos.assoc;
    }
    return json
  };

  /**
   * @param {any} json
   * @return {RelativePosition}
   *
   * @function
   */
  const createRelativePositionFromJSON = json => new RelativePosition(json.type == null ? null : createID(json.type.client, json.type.clock), json.tname || null, json.item == null ? null : createID(json.item.client, json.item.clock), json.assoc == null ? 0 : json.assoc);

  class AbsolutePosition {
    /**
     * @param {AbstractType<any>} type
     * @param {number} index
     * @param {number} [assoc]
     */
    constructor (type, index, assoc = 0) {
      /**
       * @type {AbstractType<any>}
       */
      this.type = type;
      /**
       * @type {number}
       */
      this.index = index;
      this.assoc = assoc;
    }
  }

  /**
   * @param {AbstractType<any>} type
   * @param {number} index
   * @param {number} [assoc]
   *
   * @function
   */
  const createAbsolutePosition = (type, index, assoc = 0) => new AbsolutePosition(type, index, assoc);

  /**
   * @param {AbstractType<any>} type
   * @param {ID|null} item
   * @param {number} [assoc]
   *
   * @function
   */
  const createRelativePosition$1 = (type, item, assoc) => {
    let typeid = null;
    let tname = null;
    if (type._item === null) {
      tname = findRootTypeKey(type);
    } else {
      typeid = createID(type._item.id.client, type._item.id.clock);
    }
    return new RelativePosition(typeid, tname, item, assoc)
  };

  /**
   * Create a relativePosition based on a absolute position.
   *
   * @param {AbstractType<any>} type The base type (e.g. YText or YArray).
   * @param {number} index The absolute position.
   * @param {number} [assoc]
   * @return {RelativePosition}
   *
   * @function
   */
  const createRelativePositionFromTypeIndex = (type, index, assoc = 0) => {
    let t = type._start;
    if (assoc < 0) {
      // associated to the left character or the beginning of a type, increment index if possible.
      if (index === 0) {
        return createRelativePosition$1(type, null, assoc)
      }
      index--;
    }
    while (t !== null) {
      if (!t.deleted && t.countable) {
        if (t.length > index) {
          // case 1: found position somewhere in the linked list
          return createRelativePosition$1(type, createID(t.id.client, t.id.clock + index), assoc)
        }
        index -= t.length;
      }
      if (t.right === null && assoc < 0) {
        // left-associated position, return last available id
        return createRelativePosition$1(type, t.lastId, assoc)
      }
      t = t.right;
    }
    return createRelativePosition$1(type, null, assoc)
  };

  /**
   * @param {encoding.Encoder} encoder
   * @param {RelativePosition} rpos
   *
   * @function
   */
  const writeRelativePosition = (encoder, rpos) => {
    const { type, tname, item, assoc } = rpos;
    if (item !== null) {
      writeVarUint(encoder, 0);
      writeID(encoder, item);
    } else if (tname !== null) {
      // case 2: found position at the end of the list and type is stored in y.share
      writeUint8(encoder, 1);
      writeVarString(encoder, tname);
    } else if (type !== null) {
      // case 3: found position at the end of the list and type is attached to an item
      writeUint8(encoder, 2);
      writeID(encoder, type);
    } else {
      throw unexpectedCase()
    }
    writeVarInt(encoder, assoc);
    return encoder
  };

  /**
   * @param {RelativePosition} rpos
   * @return {Uint8Array}
   */
  const encodeRelativePosition = rpos => {
    const encoder = createEncoder();
    writeRelativePosition(encoder, rpos);
    return toUint8Array(encoder)
  };

  /**
   * @param {decoding.Decoder} decoder
   * @return {RelativePosition}
   *
   * @function
   */
  const readRelativePosition = decoder => {
    let type = null;
    let tname = null;
    let itemID = null;
    switch (readVarUint(decoder)) {
      case 0:
        // case 1: found position somewhere in the linked list
        itemID = readID(decoder);
        break
      case 1:
        // case 2: found position at the end of the list and type is stored in y.share
        tname = readVarString(decoder);
        break
      case 2: {
        // case 3: found position at the end of the list and type is attached to an item
        type = readID(decoder);
      }
    }
    const assoc = hasContent(decoder) ? readVarInt(decoder) : 0;
    return new RelativePosition(type, tname, itemID, assoc)
  };

  /**
   * @param {Uint8Array} uint8Array
   * @return {RelativePosition}
   */
  const decodeRelativePosition = uint8Array => readRelativePosition(createDecoder(uint8Array));

  /**
   * @param {RelativePosition} rpos
   * @param {Doc} doc
   * @return {AbsolutePosition|null}
   *
   * @function
   */
  const createAbsolutePositionFromRelativePosition = (rpos, doc) => {
    const store = doc.store;
    const rightID = rpos.item;
    const typeID = rpos.type;
    const tname = rpos.tname;
    const assoc = rpos.assoc;
    let type = null;
    let index = 0;
    if (rightID !== null) {
      if (getState(store, rightID.client) <= rightID.clock) {
        return null
      }
      const res = followRedone(store, rightID);
      const right = res.item;
      if (!(right instanceof Item)) {
        return null
      }
      type = /** @type {AbstractType<any>} */ (right.parent);
      if (type._item === null || !type._item.deleted) {
        index = (right.deleted || !right.countable) ? 0 : (res.diff + (assoc >= 0 ? 0 : 1)); // adjust position based on left association if necessary
        let n = right.left;
        while (n !== null) {
          if (!n.deleted && n.countable) {
            index += n.length;
          }
          n = n.left;
        }
      }
    } else {
      if (tname !== null) {
        type = doc.get(tname);
      } else if (typeID !== null) {
        if (getState(store, typeID.client) <= typeID.clock) {
          // type does not exist yet
          return null
        }
        const { item } = followRedone(store, typeID);
        if (item instanceof Item && item.content instanceof ContentType) {
          type = item.content.type;
        } else {
          // struct is garbage collected
          return null
        }
      } else {
        throw unexpectedCase()
      }
      if (assoc >= 0) {
        index = type._length;
      } else {
        index = 0;
      }
    }
    return createAbsolutePosition(type, index, rpos.assoc)
  };

  /**
   * @param {RelativePosition|null} a
   * @param {RelativePosition|null} b
   * @return {boolean}
   *
   * @function
   */
  const compareRelativePositions = (a, b) => a === b || (
    a !== null && b !== null && a.tname === b.tname && compareIDs(a.item, b.item) && compareIDs(a.type, b.type) && a.assoc === b.assoc
  );

  class Snapshot {
    /**
     * @param {DeleteSet} ds
     * @param {Map<number,number>} sv state map
     */
    constructor (ds, sv) {
      /**
       * @type {DeleteSet}
       */
      this.ds = ds;
      /**
       * State Map
       * @type {Map<number,number>}
       */
      this.sv = sv;
    }
  }

  /**
   * @param {Snapshot} snap1
   * @param {Snapshot} snap2
   * @return {boolean}
   */
  const equalSnapshots = (snap1, snap2) => {
    const ds1 = snap1.ds.clients;
    const ds2 = snap2.ds.clients;
    const sv1 = snap1.sv;
    const sv2 = snap2.sv;
    if (sv1.size !== sv2.size || ds1.size !== ds2.size) {
      return false
    }
    for (const [key, value] of sv1.entries()) {
      if (sv2.get(key) !== value) {
        return false
      }
    }
    for (const [client, dsitems1] of ds1.entries()) {
      const dsitems2 = ds2.get(client) || [];
      if (dsitems1.length !== dsitems2.length) {
        return false
      }
      for (let i = 0; i < dsitems1.length; i++) {
        const dsitem1 = dsitems1[i];
        const dsitem2 = dsitems2[i];
        if (dsitem1.clock !== dsitem2.clock || dsitem1.len !== dsitem2.len) {
          return false
        }
      }
    }
    return true
  };

  /**
   * @param {Snapshot} snapshot
   * @param {DSEncoderV1 | DSEncoderV2} [encoder]
   * @return {Uint8Array}
   */
  const encodeSnapshotV2 = (snapshot, encoder = new DSEncoderV2()) => {
    writeDeleteSet(encoder, snapshot.ds);
    writeStateVector(encoder, snapshot.sv);
    return encoder.toUint8Array()
  };

  /**
   * @param {Snapshot} snapshot
   * @return {Uint8Array}
   */
  const encodeSnapshot = snapshot => encodeSnapshotV2(snapshot, new DSEncoderV1());

  /**
   * @param {Uint8Array} buf
   * @param {DSDecoderV1 | DSDecoderV2} [decoder]
   * @return {Snapshot}
   */
  const decodeSnapshotV2 = (buf, decoder = new DSDecoderV2(createDecoder(buf))) => {
    return new Snapshot(readDeleteSet(decoder), readStateVector(decoder))
  };

  /**
   * @param {Uint8Array} buf
   * @return {Snapshot}
   */
  const decodeSnapshot = buf => decodeSnapshotV2(buf, new DSDecoderV1(createDecoder(buf)));

  /**
   * @param {DeleteSet} ds
   * @param {Map<number,number>} sm
   * @return {Snapshot}
   */
  const createSnapshot = (ds, sm) => new Snapshot(ds, sm);

  const emptySnapshot = createSnapshot(createDeleteSet(), new Map());

  /**
   * @param {Doc} doc
   * @return {Snapshot}
   */
  const snapshot = doc => createSnapshot(createDeleteSetFromStructStore(doc.store), getStateVector(doc.store));

  /**
   * @param {Item} item
   * @param {Snapshot|undefined} snapshot
   *
   * @protected
   * @function
   */
  const isVisible$1 = (item, snapshot) => snapshot === undefined
    ? !item.deleted
    : snapshot.sv.has(item.id.client) && (snapshot.sv.get(item.id.client) || 0) > item.id.clock && !isDeleted(snapshot.ds, item.id);

  /**
   * @param {Transaction} transaction
   * @param {Snapshot} snapshot
   */
  const splitSnapshotAffectedStructs = (transaction, snapshot) => {
    const meta = setIfUndefined(transaction.meta, splitSnapshotAffectedStructs, create$1);
    const store = transaction.doc.store;
    // check if we already split for this snapshot
    if (!meta.has(snapshot)) {
      snapshot.sv.forEach((clock, client) => {
        if (clock < getState(store, client)) {
          getItemCleanStart(transaction, createID(client, clock));
        }
      });
      iterateDeletedStructs(transaction, snapshot.ds, item => {});
      meta.add(snapshot);
    }
  };

  /**
   * @param {Doc} originDoc
   * @param {Snapshot} snapshot
   * @param {Doc} [newDoc] Optionally, you may define the Yjs document that receives the data from originDoc
   * @return {Doc}
   */
  const createDocFromSnapshot = (originDoc, snapshot, newDoc = new Doc()) => {
    if (originDoc.gc) {
      // we should not try to restore a GC-ed document, because some of the restored items might have their content deleted
      throw new Error('originDoc must not be garbage collected')
    }
    const { sv, ds } = snapshot;

    const encoder = new UpdateEncoderV2();
    originDoc.transact(transaction => {
      let size = 0;
      sv.forEach(clock => {
        if (clock > 0) {
          size++;
        }
      });
      writeVarUint(encoder.restEncoder, size);
      // splitting the structs before writing them to the encoder
      for (const [client, clock] of sv) {
        if (clock === 0) {
          continue
        }
        if (clock < getState(originDoc.store, client)) {
          getItemCleanStart(transaction, createID(client, clock));
        }
        const structs = originDoc.store.clients.get(client) || [];
        const lastStructIndex = findIndexSS(structs, clock - 1);
        // write # encoded structs
        writeVarUint(encoder.restEncoder, lastStructIndex + 1);
        encoder.writeClient(client);
        // first clock written is 0
        writeVarUint(encoder.restEncoder, 0);
        for (let i = 0; i <= lastStructIndex; i++) {
          structs[i].write(encoder, 0);
        }
      }
      writeDeleteSet(encoder, ds);
    });

    applyUpdateV2(newDoc, encoder.toUint8Array(), 'snapshot');
    return newDoc
  };

  class StructStore {
    constructor () {
      /**
       * @type {Map<number,Array<GC|Item>>}
       */
      this.clients = new Map();
      /**
       * @type {null | { missing: Map<number, number>, update: Uint8Array }}
       */
      this.pendingStructs = null;
      /**
       * @type {null | Uint8Array}
       */
      this.pendingDs = null;
    }
  }

  /**
   * Return the states as a Map<client,clock>.
   * Note that clock refers to the next expected clock id.
   *
   * @param {StructStore} store
   * @return {Map<number,number>}
   *
   * @public
   * @function
   */
  const getStateVector = store => {
    const sm = new Map();
    store.clients.forEach((structs, client) => {
      const struct = structs[structs.length - 1];
      sm.set(client, struct.id.clock + struct.length);
    });
    return sm
  };

  /**
   * @param {StructStore} store
   * @param {number} client
   * @return {number}
   *
   * @public
   * @function
   */
  const getState = (store, client) => {
    const structs = store.clients.get(client);
    if (structs === undefined) {
      return 0
    }
    const lastStruct = structs[structs.length - 1];
    return lastStruct.id.clock + lastStruct.length
  };

  /**
   * @param {StructStore} store
   * @param {GC|Item} struct
   *
   * @private
   * @function
   */
  const addStruct = (store, struct) => {
    let structs = store.clients.get(struct.id.client);
    if (structs === undefined) {
      structs = [];
      store.clients.set(struct.id.client, structs);
    } else {
      const lastStruct = structs[structs.length - 1];
      if (lastStruct.id.clock + lastStruct.length !== struct.id.clock) {
        throw unexpectedCase()
      }
    }
    structs.push(struct);
  };

  /**
   * Perform a binary search on a sorted array
   * @param {Array<Item|GC>} structs
   * @param {number} clock
   * @return {number}
   *
   * @private
   * @function
   */
  const findIndexSS = (structs, clock) => {
    let left = 0;
    let right = structs.length - 1;
    let mid = structs[right];
    let midclock = mid.id.clock;
    if (midclock === clock) {
      return right
    }
    // @todo does it even make sense to pivot the search?
    // If a good split misses, it might actually increase the time to find the correct item.
    // Currently, the only advantage is that search with pivoting might find the item on the first try.
    let midindex = floor((clock / (midclock + mid.length - 1)) * right); // pivoting the search
    while (left <= right) {
      mid = structs[midindex];
      midclock = mid.id.clock;
      if (midclock <= clock) {
        if (clock < midclock + mid.length) {
          return midindex
        }
        left = midindex + 1;
      } else {
        right = midindex - 1;
      }
      midindex = floor((left + right) / 2);
    }
    // Always check state before looking for a struct in StructStore
    // Therefore the case of not finding a struct is unexpected
    throw unexpectedCase()
  };

  /**
   * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
   *
   * @param {StructStore} store
   * @param {ID} id
   * @return {GC|Item}
   *
   * @private
   * @function
   */
  const find = (store, id) => {
    /**
     * @type {Array<GC|Item>}
     */
    // @ts-ignore
    const structs = store.clients.get(id.client);
    return structs[findIndexSS(structs, id.clock)]
  };

  /**
   * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
   * @private
   * @function
   */
  const getItem = /** @type {function(StructStore,ID):Item} */ (find);

  /**
   * @param {Transaction} transaction
   * @param {Array<Item|GC>} structs
   * @param {number} clock
   */
  const findIndexCleanStart = (transaction, structs, clock) => {
    const index = findIndexSS(structs, clock);
    const struct = structs[index];
    if (struct.id.clock < clock && struct instanceof Item) {
      structs.splice(index + 1, 0, splitItem(transaction, struct, clock - struct.id.clock));
      return index + 1
    }
    return index
  };

  /**
   * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
   *
   * @param {Transaction} transaction
   * @param {ID} id
   * @return {Item}
   *
   * @private
   * @function
   */
  const getItemCleanStart = (transaction, id) => {
    const structs = /** @type {Array<Item>} */ (transaction.doc.store.clients.get(id.client));
    return structs[findIndexCleanStart(transaction, structs, id.clock)]
  };

  /**
   * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
   *
   * @param {Transaction} transaction
   * @param {StructStore} store
   * @param {ID} id
   * @return {Item}
   *
   * @private
   * @function
   */
  const getItemCleanEnd = (transaction, store, id) => {
    /**
     * @type {Array<Item>}
     */
    // @ts-ignore
    const structs = store.clients.get(id.client);
    const index = findIndexSS(structs, id.clock);
    const struct = structs[index];
    if (id.clock !== struct.id.clock + struct.length - 1 && struct.constructor !== GC) {
      structs.splice(index + 1, 0, splitItem(transaction, struct, id.clock - struct.id.clock + 1));
    }
    return struct
  };

  /**
   * Replace `item` with `newitem` in store
   * @param {StructStore} store
   * @param {GC|Item} struct
   * @param {GC|Item} newStruct
   *
   * @private
   * @function
   */
  const replaceStruct = (store, struct, newStruct) => {
    const structs = /** @type {Array<GC|Item>} */ (store.clients.get(struct.id.client));
    structs[findIndexSS(structs, struct.id.clock)] = newStruct;
  };

  /**
   * Iterate over a range of structs
   *
   * @param {Transaction} transaction
   * @param {Array<Item|GC>} structs
   * @param {number} clockStart Inclusive start
   * @param {number} len
   * @param {function(GC|Item):void} f
   *
   * @function
   */
  const iterateStructs = (transaction, structs, clockStart, len, f) => {
    if (len === 0) {
      return
    }
    const clockEnd = clockStart + len;
    let index = findIndexCleanStart(transaction, structs, clockStart);
    let struct;
    do {
      struct = structs[index++];
      if (clockEnd < struct.id.clock + struct.length) {
        findIndexCleanStart(transaction, structs, clockEnd);
      }
      f(struct);
    } while (index < structs.length && structs[index].id.clock < clockEnd)
  };

  /**
   * A transaction is created for every change on the Yjs model. It is possible
   * to bundle changes on the Yjs model in a single transaction to
   * minimize the number on messages sent and the number of observer calls.
   * If possible the user of this library should bundle as many changes as
   * possible. Here is an example to illustrate the advantages of bundling:
   *
   * @example
   * const map = y.define('map', YMap)
   * // Log content when change is triggered
   * map.observe(() => {
   *   console.log('change triggered')
   * })
   * // Each change on the map type triggers a log message:
   * map.set('a', 0) // => "change triggered"
   * map.set('b', 0) // => "change triggered"
   * // When put in a transaction, it will trigger the log after the transaction:
   * y.transact(() => {
   *   map.set('a', 1)
   *   map.set('b', 1)
   * }) // => "change triggered"
   *
   * @public
   */
  class Transaction$1 {
    /**
     * @param {Doc} doc
     * @param {any} origin
     * @param {boolean} local
     */
    constructor (doc, origin, local) {
      /**
       * The Yjs instance.
       * @type {Doc}
       */
      this.doc = doc;
      /**
       * Describes the set of deleted items by ids
       * @type {DeleteSet}
       */
      this.deleteSet = new DeleteSet();
      /**
       * Holds the state before the transaction started.
       * @type {Map<Number,Number>}
       */
      this.beforeState = getStateVector(doc.store);
      /**
       * Holds the state after the transaction.
       * @type {Map<Number,Number>}
       */
      this.afterState = new Map();
      /**
       * All types that were directly modified (property added or child
       * inserted/deleted). New types are not included in this Set.
       * Maps from type to parentSubs (`item.parentSub = null` for YArray)
       * @type {Map<AbstractType<YEvent<any>>,Set<String|null>>}
       */
      this.changed = new Map();
      /**
       * Stores the events for the types that observe also child elements.
       * It is mainly used by `observeDeep`.
       * @type {Map<AbstractType<YEvent<any>>,Array<YEvent<any>>>}
       */
      this.changedParentTypes = new Map();
      /**
       * @type {Array<AbstractStruct>}
       */
      this._mergeStructs = [];
      /**
       * @type {any}
       */
      this.origin = origin;
      /**
       * Stores meta information on the transaction
       * @type {Map<any,any>}
       */
      this.meta = new Map();
      /**
       * Whether this change originates from this doc.
       * @type {boolean}
       */
      this.local = local;
      /**
       * @type {Set<Doc>}
       */
      this.subdocsAdded = new Set();
      /**
       * @type {Set<Doc>}
       */
      this.subdocsRemoved = new Set();
      /**
       * @type {Set<Doc>}
       */
      this.subdocsLoaded = new Set();
    }
  }

  /**
   * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
   * @param {Transaction} transaction
   * @return {boolean} Whether data was written.
   */
  const writeUpdateMessageFromTransaction = (encoder, transaction) => {
    if (transaction.deleteSet.clients.size === 0 && !any(transaction.afterState, (clock, client) => transaction.beforeState.get(client) !== clock)) {
      return false
    }
    sortAndMergeDeleteSet(transaction.deleteSet);
    writeStructsFromTransaction(encoder, transaction);
    writeDeleteSet(encoder, transaction.deleteSet);
    return true
  };

  /**
   * If `type.parent` was added in current transaction, `type` technically
   * did not change, it was just added and we should not fire events for `type`.
   *
   * @param {Transaction} transaction
   * @param {AbstractType<YEvent<any>>} type
   * @param {string|null} parentSub
   */
  const addChangedTypeToTransaction = (transaction, type, parentSub) => {
    const item = type._item;
    if (item === null || (item.id.clock < (transaction.beforeState.get(item.id.client) || 0) && !item.deleted)) {
      setIfUndefined(transaction.changed, type, create$1).add(parentSub);
    }
  };

  /**
   * @param {Array<AbstractStruct>} structs
   * @param {number} pos
   */
  const tryToMergeWithLeft = (structs, pos) => {
    const left = structs[pos - 1];
    const right = structs[pos];
    if (left.deleted === right.deleted && left.constructor === right.constructor) {
      if (left.mergeWith(right)) {
        structs.splice(pos, 1);
        if (right instanceof Item && right.parentSub !== null && /** @type {AbstractType<any>} */ (right.parent)._map.get(right.parentSub) === right) {
          /** @type {AbstractType<any>} */ (right.parent)._map.set(right.parentSub, /** @type {Item} */ (left));
        }
      }
    }
  };

  /**
   * @param {DeleteSet} ds
   * @param {StructStore} store
   * @param {function(Item):boolean} gcFilter
   */
  const tryGcDeleteSet = (ds, store, gcFilter) => {
    for (const [client, deleteItems] of ds.clients.entries()) {
      const structs = /** @type {Array<GC|Item>} */ (store.clients.get(client));
      for (let di = deleteItems.length - 1; di >= 0; di--) {
        const deleteItem = deleteItems[di];
        const endDeleteItemClock = deleteItem.clock + deleteItem.len;
        for (
          let si = findIndexSS(structs, deleteItem.clock), struct = structs[si];
          si < structs.length && struct.id.clock < endDeleteItemClock;
          struct = structs[++si]
        ) {
          const struct = structs[si];
          if (deleteItem.clock + deleteItem.len <= struct.id.clock) {
            break
          }
          if (struct instanceof Item && struct.deleted && !struct.keep && gcFilter(struct)) {
            struct.gc(store, false);
          }
        }
      }
    }
  };

  /**
   * @param {DeleteSet} ds
   * @param {StructStore} store
   */
  const tryMergeDeleteSet = (ds, store) => {
    // try to merge deleted / gc'd items
    // merge from right to left for better efficiecy and so we don't miss any merge targets
    ds.clients.forEach((deleteItems, client) => {
      const structs = /** @type {Array<GC|Item>} */ (store.clients.get(client));
      for (let di = deleteItems.length - 1; di >= 0; di--) {
        const deleteItem = deleteItems[di];
        // start with merging the item next to the last deleted item
        const mostRightIndexToCheck = min(structs.length - 1, 1 + findIndexSS(structs, deleteItem.clock + deleteItem.len - 1));
        for (
          let si = mostRightIndexToCheck, struct = structs[si];
          si > 0 && struct.id.clock >= deleteItem.clock;
          struct = structs[--si]
        ) {
          tryToMergeWithLeft(structs, si);
        }
      }
    });
  };

  /**
   * @param {DeleteSet} ds
   * @param {StructStore} store
   * @param {function(Item):boolean} gcFilter
   */
  const tryGc = (ds, store, gcFilter) => {
    tryGcDeleteSet(ds, store, gcFilter);
    tryMergeDeleteSet(ds, store);
  };

  /**
   * @param {Array<Transaction>} transactionCleanups
   * @param {number} i
   */
  const cleanupTransactions = (transactionCleanups, i) => {
    if (i < transactionCleanups.length) {
      const transaction = transactionCleanups[i];
      const doc = transaction.doc;
      const store = doc.store;
      const ds = transaction.deleteSet;
      const mergeStructs = transaction._mergeStructs;
      try {
        sortAndMergeDeleteSet(ds);
        transaction.afterState = getStateVector(transaction.doc.store);
        doc._transaction = null;
        doc.emit('beforeObserverCalls', [transaction, doc]);
        /**
         * An array of event callbacks.
         *
         * Each callback is called even if the other ones throw errors.
         *
         * @type {Array<function():void>}
         */
        const fs = [];
        // observe events on changed types
        transaction.changed.forEach((subs, itemtype) =>
          fs.push(() => {
            if (itemtype._item === null || !itemtype._item.deleted) {
              itemtype._callObserver(transaction, subs);
            }
          })
        );
        fs.push(() => {
          // deep observe events
          transaction.changedParentTypes.forEach((events, type) =>
            fs.push(() => {
              // We need to think about the possibility that the user transforms the
              // Y.Doc in the event.
              if (type._item === null || !type._item.deleted) {
                events = events
                  .filter(event =>
                    event.target._item === null || !event.target._item.deleted
                  );
                events
                  .forEach(event => {
                    event.currentTarget = type;
                  });
                // sort events by path length so that top-level events are fired first.
                events
                  .sort((event1, event2) => event1.path.length - event2.path.length);
                // We don't need to check for events.length
                // because we know it has at least one element
                callEventHandlerListeners(type._dEH, events, transaction);
              }
            })
          );
          fs.push(() => doc.emit('afterTransaction', [transaction, doc]));
        });
        callAll(fs, []);
      } finally {
        // Replace deleted items with ItemDeleted / GC.
        // This is where content is actually remove from the Yjs Doc.
        if (doc.gc) {
          tryGcDeleteSet(ds, store, doc.gcFilter);
        }
        tryMergeDeleteSet(ds, store);

        // on all affected store.clients props, try to merge
        transaction.afterState.forEach((clock, client) => {
          const beforeClock = transaction.beforeState.get(client) || 0;
          if (beforeClock !== clock) {
            const structs = /** @type {Array<GC|Item>} */ (store.clients.get(client));
            // we iterate from right to left so we can safely remove entries
            const firstChangePos = max(findIndexSS(structs, beforeClock), 1);
            for (let i = structs.length - 1; i >= firstChangePos; i--) {
              tryToMergeWithLeft(structs, i);
            }
          }
        });
        // try to merge mergeStructs
        // @todo: it makes more sense to transform mergeStructs to a DS, sort it, and merge from right to left
        //        but at the moment DS does not handle duplicates
        for (let i = 0; i < mergeStructs.length; i++) {
          const { client, clock } = mergeStructs[i].id;
          const structs = /** @type {Array<GC|Item>} */ (store.clients.get(client));
          const replacedStructPos = findIndexSS(structs, clock);
          if (replacedStructPos + 1 < structs.length) {
            tryToMergeWithLeft(structs, replacedStructPos + 1);
          }
          if (replacedStructPos > 0) {
            tryToMergeWithLeft(structs, replacedStructPos);
          }
        }
        if (!transaction.local && transaction.afterState.get(doc.clientID) !== transaction.beforeState.get(doc.clientID)) {
          print(ORANGE, BOLD, '[yjs] ', UNBOLD, RED, 'Changed the client-id because another client seems to be using it.');
          doc.clientID = generateNewClientId();
        }
        // @todo Merge all the transactions into one and provide send the data as a single update message
        doc.emit('afterTransactionCleanup', [transaction, doc]);
        if (doc._observers.has('update')) {
          const encoder = new UpdateEncoderV1();
          const hasContent = writeUpdateMessageFromTransaction(encoder, transaction);
          if (hasContent) {
            doc.emit('update', [encoder.toUint8Array(), transaction.origin, doc, transaction]);
          }
        }
        if (doc._observers.has('updateV2')) {
          const encoder = new UpdateEncoderV2();
          const hasContent = writeUpdateMessageFromTransaction(encoder, transaction);
          if (hasContent) {
            doc.emit('updateV2', [encoder.toUint8Array(), transaction.origin, doc, transaction]);
          }
        }
        const { subdocsAdded, subdocsLoaded, subdocsRemoved } = transaction;
        if (subdocsAdded.size > 0 || subdocsRemoved.size > 0 || subdocsLoaded.size > 0) {
          subdocsAdded.forEach(subdoc => {
            subdoc.clientID = doc.clientID;
            if (subdoc.collectionid == null) {
              subdoc.collectionid = doc.collectionid;
            }
            doc.subdocs.add(subdoc);
          });
          subdocsRemoved.forEach(subdoc => doc.subdocs.delete(subdoc));
          doc.emit('subdocs', [{ loaded: subdocsLoaded, added: subdocsAdded, removed: subdocsRemoved }, doc, transaction]);
          subdocsRemoved.forEach(subdoc => subdoc.destroy());
        }

        if (transactionCleanups.length <= i + 1) {
          doc._transactionCleanups = [];
          doc.emit('afterAllTransactions', [doc, transactionCleanups]);
        } else {
          cleanupTransactions(transactionCleanups, i + 1);
        }
      }
    }
  };

  /**
   * Implements the functionality of `y.transact(()=>{..})`
   *
   * @param {Doc} doc
   * @param {function(Transaction):void} f
   * @param {any} [origin=true]
   *
   * @function
   */
  const transact = (doc, f, origin = null, local = true) => {
    const transactionCleanups = doc._transactionCleanups;
    let initialCall = false;
    if (doc._transaction === null) {
      initialCall = true;
      doc._transaction = new Transaction$1(doc, origin, local);
      transactionCleanups.push(doc._transaction);
      if (transactionCleanups.length === 1) {
        doc.emit('beforeAllTransactions', [doc]);
      }
      doc.emit('beforeTransaction', [doc._transaction, doc]);
    }
    try {
      f(doc._transaction);
    } finally {
      if (initialCall && transactionCleanups[0] === doc._transaction) {
        // The first transaction ended, now process observer calls.
        // Observer call may create new transactions for which we need to call the observers and do cleanup.
        // We don't want to nest these calls, so we execute these calls one after
        // another.
        // Also we need to ensure that all cleanups are called, even if the
        // observes throw errors.
        // This file is full of hacky try {} finally {} blocks to ensure that an
        // event can throw errors and also that the cleanup is called.
        cleanupTransactions(transactionCleanups, 0);
      }
    }
  };

  class StackItem {
    /**
     * @param {DeleteSet} deletions
     * @param {DeleteSet} insertions
     */
    constructor (deletions, insertions) {
      this.insertions = insertions;
      this.deletions = deletions;
      /**
       * Use this to save and restore metadata like selection range
       */
      this.meta = new Map();
    }
  }
  /**
   * @param {Transaction} tr
   * @param {UndoManager} um
   * @param {StackItem} stackItem
   */
  const clearUndoManagerStackItem = (tr, um, stackItem) => {
    iterateDeletedStructs(tr, stackItem.deletions, item => {
      if (item instanceof Item && um.scope.some(type => isParentOf(type, item))) {
        keepItem(item, false);
      }
    });
  };

  /**
   * @param {UndoManager} undoManager
   * @param {Array<StackItem>} stack
   * @param {string} eventType
   * @return {StackItem?}
   */
  const popStackItem = (undoManager, stack, eventType) => {
    /**
     * Whether a change happened
     * @type {StackItem?}
     */
    let result = null;
    /**
     * Keep a reference to the transaction so we can fire the event with the changedParentTypes
     * @type {any}
     */
    let _tr = null;
    const doc = undoManager.doc;
    const scope = undoManager.scope;
    transact(doc, transaction => {
      while (stack.length > 0 && result === null) {
        const store = doc.store;
        const stackItem = /** @type {StackItem} */ (stack.pop());
        /**
         * @type {Set<Item>}
         */
        const itemsToRedo = new Set();
        /**
         * @type {Array<Item>}
         */
        const itemsToDelete = [];
        let performedChange = false;
        iterateDeletedStructs(transaction, stackItem.insertions, struct => {
          if (struct instanceof Item) {
            if (struct.redone !== null) {
              let { item, diff } = followRedone(store, struct.id);
              if (diff > 0) {
                item = getItemCleanStart(transaction, createID(item.id.client, item.id.clock + diff));
              }
              struct = item;
            }
            if (!struct.deleted && scope.some(type => isParentOf(type, /** @type {Item} */ (struct)))) {
              itemsToDelete.push(struct);
            }
          }
        });
        iterateDeletedStructs(transaction, stackItem.deletions, struct => {
          if (
            struct instanceof Item &&
            scope.some(type => isParentOf(type, struct)) &&
            // Never redo structs in stackItem.insertions because they were created and deleted in the same capture interval.
            !isDeleted(stackItem.insertions, struct.id)
          ) {
            itemsToRedo.add(struct);
          }
        });
        itemsToRedo.forEach(struct => {
          performedChange = redoItem(transaction, struct, itemsToRedo, stackItem.insertions, undoManager.ignoreRemoteMapChanges) !== null || performedChange;
        });
        // We want to delete in reverse order so that children are deleted before
        // parents, so we have more information available when items are filtered.
        for (let i = itemsToDelete.length - 1; i >= 0; i--) {
          const item = itemsToDelete[i];
          if (undoManager.deleteFilter(item)) {
            item.delete(transaction);
            performedChange = true;
          }
        }
        result = performedChange ? stackItem : null;
      }
      transaction.changed.forEach((subProps, type) => {
        // destroy search marker if necessary
        if (subProps.has(null) && type._searchMarker) {
          type._searchMarker.length = 0;
        }
      });
      _tr = transaction;
    }, undoManager);
    if (result != null) {
      const changedParentTypes = _tr.changedParentTypes;
      undoManager.emit('stack-item-popped', [{ stackItem: result, type: eventType, changedParentTypes }, undoManager]);
    }
    return result
  };

  /**
   * @typedef {Object} UndoManagerOptions
   * @property {number} [UndoManagerOptions.captureTimeout=500]
   * @property {function(Transaction):boolean} [UndoManagerOptions.captureTransaction] Do not capture changes of a Transaction if result false.
   * @property {function(Item):boolean} [UndoManagerOptions.deleteFilter=()=>true] Sometimes
   * it is necessary to filter whan an Undo/Redo operation can delete. If this
   * filter returns false, the type/item won't be deleted even it is in the
   * undo/redo scope.
   * @property {Set<any>} [UndoManagerOptions.trackedOrigins=new Set([null])]
   * @property {boolean} [ignoreRemoteMapChanges] Experimental. By default, the UndoManager will never overwrite remote changes. Enable this property to enable overwriting remote changes on key-value changes (Y.Map, properties on Y.Xml, etc..).
   * @property {Doc} [doc] The document that this UndoManager operates on. Only needed if typeScope is empty.
   */

  /**
   * Fires 'stack-item-added' event when a stack item was added to either the undo- or
   * the redo-stack. You may store additional stack information via the
   * metadata property on `event.stackItem.meta` (it is a `Map` of metadata properties).
   * Fires 'stack-item-popped' event when a stack item was popped from either the
   * undo- or the redo-stack. You may restore the saved stack information from `event.stackItem.meta`.
   *
   * @extends {Observable<'stack-item-added'|'stack-item-popped'|'stack-cleared'|'stack-item-updated'>}
   */
  class UndoManager extends Observable {
    /**
     * @param {AbstractType<any>|Array<AbstractType<any>>} typeScope Accepts either a single type, or an array of types
     * @param {UndoManagerOptions} options
     */
    constructor (typeScope, {
      captureTimeout = 500,
      captureTransaction = tr => true,
      deleteFilter = () => true,
      trackedOrigins = new Set([null]),
      ignoreRemoteMapChanges = false,
      doc = /** @type {Doc} */ (isArray(typeScope) ? typeScope[0].doc : typeScope.doc)
    } = {}) {
      super();
      /**
       * @type {Array<AbstractType<any>>}
       */
      this.scope = [];
      this.addToScope(typeScope);
      this.deleteFilter = deleteFilter;
      trackedOrigins.add(this);
      this.trackedOrigins = trackedOrigins;
      this.captureTransaction = captureTransaction;
      /**
       * @type {Array<StackItem>}
       */
      this.undoStack = [];
      /**
       * @type {Array<StackItem>}
       */
      this.redoStack = [];
      /**
       * Whether the client is currently undoing (calling UndoManager.undo)
       *
       * @type {boolean}
       */
      this.undoing = false;
      this.redoing = false;
      this.doc = doc;
      this.lastChange = 0;
      this.ignoreRemoteMapChanges = ignoreRemoteMapChanges;
      /**
       * @param {Transaction} transaction
       */
      this.afterTransactionHandler = transaction => {
        // Only track certain transactions
        if (
          !this.captureTransaction(transaction) ||
          !this.scope.some(type => transaction.changedParentTypes.has(type)) ||
          (!this.trackedOrigins.has(transaction.origin) && (!transaction.origin || !this.trackedOrigins.has(transaction.origin.constructor)))
        ) {
          return
        }
        const undoing = this.undoing;
        const redoing = this.redoing;
        const stack = undoing ? this.redoStack : this.undoStack;
        if (undoing) {
          this.stopCapturing(); // next undo should not be appended to last stack item
        } else if (!redoing) {
          // neither undoing nor redoing: delete redoStack
          this.clear(false, true);
        }
        const insertions = new DeleteSet();
        transaction.afterState.forEach((endClock, client) => {
          const startClock = transaction.beforeState.get(client) || 0;
          const len = endClock - startClock;
          if (len > 0) {
            addToDeleteSet(insertions, client, startClock, len);
          }
        });
        const now = getUnixTime();
        let didAdd = false;
        if (now - this.lastChange < captureTimeout && stack.length > 0 && !undoing && !redoing) {
          // append change to last stack op
          const lastOp = stack[stack.length - 1];
          lastOp.deletions = mergeDeleteSets([lastOp.deletions, transaction.deleteSet]);
          lastOp.insertions = mergeDeleteSets([lastOp.insertions, insertions]);
        } else {
          // create a new stack op
          stack.push(new StackItem(transaction.deleteSet, insertions));
          didAdd = true;
        }
        if (!undoing && !redoing) {
          this.lastChange = now;
        }
        // make sure that deleted structs are not gc'd
        iterateDeletedStructs(transaction, transaction.deleteSet, /** @param {Item|GC} item */ item => {
          if (item instanceof Item && this.scope.some(type => isParentOf(type, item))) {
            keepItem(item, true);
          }
        });
        const changeEvent = [{ stackItem: stack[stack.length - 1], origin: transaction.origin, type: undoing ? 'redo' : 'undo', changedParentTypes: transaction.changedParentTypes }, this];
        if (didAdd) {
          this.emit('stack-item-added', changeEvent);
        } else {
          this.emit('stack-item-updated', changeEvent);
        }
      };
      this.doc.on('afterTransaction', this.afterTransactionHandler);
      this.doc.on('destroy', () => {
        this.destroy();
      });
    }

    /**
     * @param {Array<AbstractType<any>> | AbstractType<any>} ytypes
     */
    addToScope (ytypes) {
      ytypes = isArray(ytypes) ? ytypes : [ytypes];
      ytypes.forEach(ytype => {
        if (this.scope.every(yt => yt !== ytype)) {
          this.scope.push(ytype);
        }
      });
    }

    /**
     * @param {any} origin
     */
    addTrackedOrigin (origin) {
      this.trackedOrigins.add(origin);
    }

    /**
     * @param {any} origin
     */
    removeTrackedOrigin (origin) {
      this.trackedOrigins.delete(origin);
    }

    clear (clearUndoStack = true, clearRedoStack = true) {
      if ((clearUndoStack && this.canUndo()) || (clearRedoStack && this.canRedo())) {
        this.doc.transact(tr => {
          if (clearUndoStack) {
            this.undoStack.forEach(item => clearUndoManagerStackItem(tr, this, item));
            this.undoStack = [];
          }
          if (clearRedoStack) {
            this.redoStack.forEach(item => clearUndoManagerStackItem(tr, this, item));
            this.redoStack = [];
          }
          this.emit('stack-cleared', [{ undoStackCleared: clearUndoStack, redoStackCleared: clearRedoStack }]);
        });
      }
    }

    /**
     * UndoManager merges Undo-StackItem if they are created within time-gap
     * smaller than `options.captureTimeout`. Call `um.stopCapturing()` so that the next
     * StackItem won't be merged.
     *
     *
     * @example
     *     // without stopCapturing
     *     ytext.insert(0, 'a')
     *     ytext.insert(1, 'b')
     *     um.undo()
     *     ytext.toString() // => '' (note that 'ab' was removed)
     *     // with stopCapturing
     *     ytext.insert(0, 'a')
     *     um.stopCapturing()
     *     ytext.insert(0, 'b')
     *     um.undo()
     *     ytext.toString() // => 'a' (note that only 'b' was removed)
     *
     */
    stopCapturing () {
      this.lastChange = 0;
    }

    /**
     * Undo last changes on type.
     *
     * @return {StackItem?} Returns StackItem if a change was applied
     */
    undo () {
      this.undoing = true;
      let res;
      try {
        res = popStackItem(this, this.undoStack, 'undo');
      } finally {
        this.undoing = false;
      }
      return res
    }

    /**
     * Redo last undo operation.
     *
     * @return {StackItem?} Returns StackItem if a change was applied
     */
    redo () {
      this.redoing = true;
      let res;
      try {
        res = popStackItem(this, this.redoStack, 'redo');
      } finally {
        this.redoing = false;
      }
      return res
    }

    /**
     * Are undo steps available?
     *
     * @return {boolean} `true` if undo is possible
     */
    canUndo () {
      return this.undoStack.length > 0
    }

    /**
     * Are redo steps available?
     *
     * @return {boolean} `true` if redo is possible
     */
    canRedo () {
      return this.redoStack.length > 0
    }

    destroy () {
      this.trackedOrigins.delete(this);
      this.doc.off('afterTransaction', this.afterTransactionHandler);
      super.destroy();
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   */
  function * lazyStructReaderGenerator (decoder) {
    const numOfStateUpdates = readVarUint(decoder.restDecoder);
    for (let i = 0; i < numOfStateUpdates; i++) {
      const numberOfStructs = readVarUint(decoder.restDecoder);
      const client = decoder.readClient();
      let clock = readVarUint(decoder.restDecoder);
      for (let i = 0; i < numberOfStructs; i++) {
        const info = decoder.readInfo();
        // @todo use switch instead of ifs
        if (info === 10) {
          const len = readVarUint(decoder.restDecoder);
          yield new Skip(createID(client, clock), len);
          clock += len;
        } else if ((BITS5 & info) !== 0) {
          const cantCopyParentInfo = (info & (BIT7 | BIT8)) === 0;
          // If parent = null and neither left nor right are defined, then we know that `parent` is child of `y`
          // and we read the next string as parentYKey.
          // It indicates how we store/retrieve parent from `y.share`
          // @type {string|null}
          const struct = new Item(
            createID(client, clock),
            null, // left
            (info & BIT8) === BIT8 ? decoder.readLeftID() : null, // origin
            null, // right
            (info & BIT7) === BIT7 ? decoder.readRightID() : null, // right origin
            // @ts-ignore Force writing a string here.
            cantCopyParentInfo ? (decoder.readParentInfo() ? decoder.readString() : decoder.readLeftID()) : null, // parent
            cantCopyParentInfo && (info & BIT6) === BIT6 ? decoder.readString() : null, // parentSub
            readItemContent(decoder, info) // item content
          );
          yield struct;
          clock += struct.length;
        } else {
          const len = decoder.readLen();
          yield new GC(createID(client, clock), len);
          clock += len;
        }
      }
    }
  }

  class LazyStructReader {
    /**
     * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
     * @param {boolean} filterSkips
     */
    constructor (decoder, filterSkips) {
      this.gen = lazyStructReaderGenerator(decoder);
      /**
       * @type {null | Item | Skip | GC}
       */
      this.curr = null;
      this.done = false;
      this.filterSkips = filterSkips;
      this.next();
    }

    /**
     * @return {Item | GC | Skip |null}
     */
    next () {
      // ignore "Skip" structs
      do {
        this.curr = this.gen.next().value || null;
      } while (this.filterSkips && this.curr !== null && this.curr.constructor === Skip)
      return this.curr
    }
  }

  /**
   * @param {Uint8Array} update
   *
   */
  const logUpdate = update => logUpdateV2(update, UpdateDecoderV1);

  /**
   * @param {Uint8Array} update
   * @param {typeof UpdateDecoderV2 | typeof UpdateDecoderV1} [YDecoder]
   *
   */
  const logUpdateV2 = (update, YDecoder = UpdateDecoderV2) => {
    const structs = [];
    const updateDecoder = new YDecoder(createDecoder(update));
    const lazyDecoder = new LazyStructReader(updateDecoder, false);
    for (let curr = lazyDecoder.curr; curr !== null; curr = lazyDecoder.next()) {
      structs.push(curr);
    }
    print('Structs: ', structs);
    const ds = readDeleteSet(updateDecoder);
    print('DeleteSet: ', ds);
  };

  /**
   * @param {Uint8Array} update
   *
   */
  const decodeUpdate = (update) => decodeUpdateV2(update, UpdateDecoderV1);

  /**
   * @param {Uint8Array} update
   * @param {typeof UpdateDecoderV2 | typeof UpdateDecoderV1} [YDecoder]
   *
   */
  const decodeUpdateV2 = (update, YDecoder = UpdateDecoderV2) => {
    const structs = [];
    const updateDecoder = new YDecoder(createDecoder(update));
    const lazyDecoder = new LazyStructReader(updateDecoder, false);
    for (let curr = lazyDecoder.curr; curr !== null; curr = lazyDecoder.next()) {
      structs.push(curr);
    }
    return {
      structs,
      ds: readDeleteSet(updateDecoder)
    }
  };

  class LazyStructWriter {
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    constructor (encoder) {
      this.currClient = 0;
      this.startClock = 0;
      this.written = 0;
      this.encoder = encoder;
      /**
       * We want to write operations lazily, but also we need to know beforehand how many operations we want to write for each client.
       *
       * This kind of meta-information (#clients, #structs-per-client-written) is written to the restEncoder.
       *
       * We fragment the restEncoder and store a slice of it per-client until we know how many clients there are.
       * When we flush (toUint8Array) we write the restEncoder using the fragments and the meta-information.
       *
       * @type {Array<{ written: number, restEncoder: Uint8Array }>}
       */
      this.clientStructs = [];
    }
  }

  /**
   * @param {Array<Uint8Array>} updates
   * @return {Uint8Array}
   */
  const mergeUpdates = updates => mergeUpdatesV2(updates, UpdateDecoderV1, UpdateEncoderV1);

  /**
   * @param {Uint8Array} update
   * @param {typeof DSEncoderV1 | typeof DSEncoderV2} YEncoder
   * @param {typeof UpdateDecoderV1 | typeof UpdateDecoderV2} YDecoder
   * @return {Uint8Array}
   */
  const encodeStateVectorFromUpdateV2 = (update, YEncoder = DSEncoderV2, YDecoder = UpdateDecoderV2) => {
    const encoder = new YEncoder();
    const updateDecoder = new LazyStructReader(new YDecoder(createDecoder(update)), false);
    let curr = updateDecoder.curr;
    if (curr !== null) {
      let size = 0;
      let currClient = curr.id.client;
      let stopCounting = curr.id.clock !== 0; // must start at 0
      let currClock = stopCounting ? 0 : curr.id.clock + curr.length;
      for (; curr !== null; curr = updateDecoder.next()) {
        if (currClient !== curr.id.client) {
          if (currClock !== 0) {
            size++;
            // We found a new client
            // write what we have to the encoder
            writeVarUint(encoder.restEncoder, currClient);
            writeVarUint(encoder.restEncoder, currClock);
          }
          currClient = curr.id.client;
          currClock = 0;
          stopCounting = curr.id.clock !== 0;
        }
        // we ignore skips
        if (curr.constructor === Skip) {
          stopCounting = true;
        }
        if (!stopCounting) {
          currClock = curr.id.clock + curr.length;
        }
      }
      // write what we have
      if (currClock !== 0) {
        size++;
        writeVarUint(encoder.restEncoder, currClient);
        writeVarUint(encoder.restEncoder, currClock);
      }
      // prepend the size of the state vector
      const enc = createEncoder();
      writeVarUint(enc, size);
      writeBinaryEncoder(enc, encoder.restEncoder);
      encoder.restEncoder = enc;
      return encoder.toUint8Array()
    } else {
      writeVarUint(encoder.restEncoder, 0);
      return encoder.toUint8Array()
    }
  };

  /**
   * @param {Uint8Array} update
   * @return {Uint8Array}
   */
  const encodeStateVectorFromUpdate = update => encodeStateVectorFromUpdateV2(update, DSEncoderV1, UpdateDecoderV1);

  /**
   * @param {Uint8Array} update
   * @param {typeof UpdateDecoderV1 | typeof UpdateDecoderV2} YDecoder
   * @return {{ from: Map<number,number>, to: Map<number,number> }}
   */
  const parseUpdateMetaV2 = (update, YDecoder = UpdateDecoderV2) => {
    /**
     * @type {Map<number, number>}
     */
    const from = new Map();
    /**
     * @type {Map<number, number>}
     */
    const to = new Map();
    const updateDecoder = new LazyStructReader(new YDecoder(createDecoder(update)), false);
    let curr = updateDecoder.curr;
    if (curr !== null) {
      let currClient = curr.id.client;
      let currClock = curr.id.clock;
      // write the beginning to `from`
      from.set(currClient, currClock);
      for (; curr !== null; curr = updateDecoder.next()) {
        if (currClient !== curr.id.client) {
          // We found a new client
          // write the end to `to`
          to.set(currClient, currClock);
          // write the beginning to `from`
          from.set(curr.id.client, curr.id.clock);
          // update currClient
          currClient = curr.id.client;
        }
        currClock = curr.id.clock + curr.length;
      }
      // write the end to `to`
      to.set(currClient, currClock);
    }
    return { from, to }
  };

  /**
   * @param {Uint8Array} update
   * @return {{ from: Map<number,number>, to: Map<number,number> }}
   */
  const parseUpdateMeta = update => parseUpdateMetaV2(update, UpdateDecoderV1);

  /**
   * This method is intended to slice any kind of struct and retrieve the right part.
   * It does not handle side-effects, so it should only be used by the lazy-encoder.
   *
   * @param {Item | GC | Skip} left
   * @param {number} diff
   * @return {Item | GC}
   */
  const sliceStruct = (left, diff) => {
    if (left.constructor === GC) {
      const { client, clock } = left.id;
      return new GC(createID(client, clock + diff), left.length - diff)
    } else if (left.constructor === Skip) {
      const { client, clock } = left.id;
      return new Skip(createID(client, clock + diff), left.length - diff)
    } else {
      const leftItem = /** @type {Item} */ (left);
      const { client, clock } = leftItem.id;
      return new Item(
        createID(client, clock + diff),
        null,
        createID(client, clock + diff - 1),
        null,
        leftItem.rightOrigin,
        leftItem.parent,
        leftItem.parentSub,
        leftItem.content.splice(diff)
      )
    }
  };

  /**
   *
   * This function works similarly to `readUpdateV2`.
   *
   * @param {Array<Uint8Array>} updates
   * @param {typeof UpdateDecoderV1 | typeof UpdateDecoderV2} [YDecoder]
   * @param {typeof UpdateEncoderV1 | typeof UpdateEncoderV2} [YEncoder]
   * @return {Uint8Array}
   */
  const mergeUpdatesV2 = (updates, YDecoder = UpdateDecoderV2, YEncoder = UpdateEncoderV2) => {
    if (updates.length === 1) {
      return updates[0]
    }
    const updateDecoders = updates.map(update => new YDecoder(createDecoder(update)));
    let lazyStructDecoders = updateDecoders.map(decoder => new LazyStructReader(decoder, true));

    /**
     * @todo we don't need offset because we always slice before
     * @type {null | { struct: Item | GC | Skip, offset: number }}
     */
    let currWrite = null;

    const updateEncoder = new YEncoder();
    // write structs lazily
    const lazyStructEncoder = new LazyStructWriter(updateEncoder);

    // Note: We need to ensure that all lazyStructDecoders are fully consumed
    // Note: Should merge document updates whenever possible - even from different updates
    // Note: Should handle that some operations cannot be applied yet ()

    while (true) {
      // Write higher clients first ⇒ sort by clientID & clock and remove decoders without content
      lazyStructDecoders = lazyStructDecoders.filter(dec => dec.curr !== null);
      lazyStructDecoders.sort(
        /** @type {function(any,any):number} */ (dec1, dec2) => {
          if (dec1.curr.id.client === dec2.curr.id.client) {
            const clockDiff = dec1.curr.id.clock - dec2.curr.id.clock;
            if (clockDiff === 0) {
              // @todo remove references to skip since the structDecoders must filter Skips.
              return dec1.curr.constructor === dec2.curr.constructor
                ? 0
                : dec1.curr.constructor === Skip ? 1 : -1 // we are filtering skips anyway.
            } else {
              return clockDiff
            }
          } else {
            return dec2.curr.id.client - dec1.curr.id.client
          }
        }
      );
      if (lazyStructDecoders.length === 0) {
        break
      }
      const currDecoder = lazyStructDecoders[0];
      // write from currDecoder until the next operation is from another client or if filler-struct
      // then we need to reorder the decoders and find the next operation to write
      const firstClient = /** @type {Item | GC} */ (currDecoder.curr).id.client;

      if (currWrite !== null) {
        let curr = /** @type {Item | GC | null} */ (currDecoder.curr);
        let iterated = false;

        // iterate until we find something that we haven't written already
        // remember: first the high client-ids are written
        while (curr !== null && curr.id.clock + curr.length <= currWrite.struct.id.clock + currWrite.struct.length && curr.id.client >= currWrite.struct.id.client) {
          curr = currDecoder.next();
          iterated = true;
        }
        if (
          curr === null || // current decoder is empty
          curr.id.client !== firstClient || // check whether there is another decoder that has has updates from `firstClient`
          (iterated && curr.id.clock > currWrite.struct.id.clock + currWrite.struct.length) // the above while loop was used and we are potentially missing updates
        ) {
          continue
        }

        if (firstClient !== currWrite.struct.id.client) {
          writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
          currWrite = { struct: curr, offset: 0 };
          currDecoder.next();
        } else {
          if (currWrite.struct.id.clock + currWrite.struct.length < curr.id.clock) {
            // @todo write currStruct & set currStruct = Skip(clock = currStruct.id.clock + currStruct.length, length = curr.id.clock - self.clock)
            if (currWrite.struct.constructor === Skip) {
              // extend existing skip
              currWrite.struct.length = curr.id.clock + curr.length - currWrite.struct.id.clock;
            } else {
              writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
              const diff = curr.id.clock - currWrite.struct.id.clock - currWrite.struct.length;
              /**
               * @type {Skip}
               */
              const struct = new Skip(createID(firstClient, currWrite.struct.id.clock + currWrite.struct.length), diff);
              currWrite = { struct, offset: 0 };
            }
          } else { // if (currWrite.struct.id.clock + currWrite.struct.length >= curr.id.clock) {
            const diff = currWrite.struct.id.clock + currWrite.struct.length - curr.id.clock;
            if (diff > 0) {
              if (currWrite.struct.constructor === Skip) {
                // prefer to slice Skip because the other struct might contain more information
                currWrite.struct.length -= diff;
              } else {
                curr = sliceStruct(curr, diff);
              }
            }
            if (!currWrite.struct.mergeWith(/** @type {any} */ (curr))) {
              writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
              currWrite = { struct: curr, offset: 0 };
              currDecoder.next();
            }
          }
        }
      } else {
        currWrite = { struct: /** @type {Item | GC} */ (currDecoder.curr), offset: 0 };
        currDecoder.next();
      }
      for (
        let next = currDecoder.curr;
        next !== null && next.id.client === firstClient && next.id.clock === currWrite.struct.id.clock + currWrite.struct.length && next.constructor !== Skip;
        next = currDecoder.next()
      ) {
        writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
        currWrite = { struct: next, offset: 0 };
      }
    }
    if (currWrite !== null) {
      writeStructToLazyStructWriter(lazyStructEncoder, currWrite.struct, currWrite.offset);
      currWrite = null;
    }
    finishLazyStructWriting(lazyStructEncoder);

    const dss = updateDecoders.map(decoder => readDeleteSet(decoder));
    const ds = mergeDeleteSets(dss);
    writeDeleteSet(updateEncoder, ds);
    return updateEncoder.toUint8Array()
  };

  /**
   * @param {Uint8Array} update
   * @param {Uint8Array} sv
   * @param {typeof UpdateDecoderV1 | typeof UpdateDecoderV2} [YDecoder]
   * @param {typeof UpdateEncoderV1 | typeof UpdateEncoderV2} [YEncoder]
   */
  const diffUpdateV2 = (update, sv, YDecoder = UpdateDecoderV2, YEncoder = UpdateEncoderV2) => {
    const state = decodeStateVector(sv);
    const encoder = new YEncoder();
    const lazyStructWriter = new LazyStructWriter(encoder);
    const decoder = new YDecoder(createDecoder(update));
    const reader = new LazyStructReader(decoder, false);
    while (reader.curr) {
      const curr = reader.curr;
      const currClient = curr.id.client;
      const svClock = state.get(currClient) || 0;
      if (reader.curr.constructor === Skip) {
        // the first written struct shouldn't be a skip
        reader.next();
        continue
      }
      if (curr.id.clock + curr.length > svClock) {
        writeStructToLazyStructWriter(lazyStructWriter, curr, max(svClock - curr.id.clock, 0));
        reader.next();
        while (reader.curr && reader.curr.id.client === currClient) {
          writeStructToLazyStructWriter(lazyStructWriter, reader.curr, 0);
          reader.next();
        }
      } else {
        // read until something new comes up
        while (reader.curr && reader.curr.id.client === currClient && reader.curr.id.clock + reader.curr.length <= svClock) {
          reader.next();
        }
      }
    }
    finishLazyStructWriting(lazyStructWriter);
    // write ds
    const ds = readDeleteSet(decoder);
    writeDeleteSet(encoder, ds);
    return encoder.toUint8Array()
  };

  /**
   * @param {Uint8Array} update
   * @param {Uint8Array} sv
   */
  const diffUpdate = (update, sv) => diffUpdateV2(update, sv, UpdateDecoderV1, UpdateEncoderV1);

  /**
   * @param {LazyStructWriter} lazyWriter
   */
  const flushLazyStructWriter = lazyWriter => {
    if (lazyWriter.written > 0) {
      lazyWriter.clientStructs.push({ written: lazyWriter.written, restEncoder: toUint8Array(lazyWriter.encoder.restEncoder) });
      lazyWriter.encoder.restEncoder = createEncoder();
      lazyWriter.written = 0;
    }
  };

  /**
   * @param {LazyStructWriter} lazyWriter
   * @param {Item | GC} struct
   * @param {number} offset
   */
  const writeStructToLazyStructWriter = (lazyWriter, struct, offset) => {
    // flush curr if we start another client
    if (lazyWriter.written > 0 && lazyWriter.currClient !== struct.id.client) {
      flushLazyStructWriter(lazyWriter);
    }
    if (lazyWriter.written === 0) {
      lazyWriter.currClient = struct.id.client;
      // write next client
      lazyWriter.encoder.writeClient(struct.id.client);
      // write startClock
      writeVarUint(lazyWriter.encoder.restEncoder, struct.id.clock + offset);
    }
    struct.write(lazyWriter.encoder, offset);
    lazyWriter.written++;
  };
  /**
   * Call this function when we collected all parts and want to
   * put all the parts together. After calling this method,
   * you can continue using the UpdateEncoder.
   *
   * @param {LazyStructWriter} lazyWriter
   */
  const finishLazyStructWriting = (lazyWriter) => {
    flushLazyStructWriter(lazyWriter);

    // this is a fresh encoder because we called flushCurr
    const restEncoder = lazyWriter.encoder.restEncoder;

    /**
     * Now we put all the fragments together.
     * This works similarly to `writeClientsStructs`
     */

    // write # states that were updated - i.e. the clients
    writeVarUint(restEncoder, lazyWriter.clientStructs.length);

    for (let i = 0; i < lazyWriter.clientStructs.length; i++) {
      const partStructs = lazyWriter.clientStructs[i];
      /**
       * Works similarly to `writeStructs`
       */
      // write # encoded structs
      writeVarUint(restEncoder, partStructs.written);
      // write the rest of the fragment
      writeUint8Array(restEncoder, partStructs.restEncoder);
    }
  };

  /**
   * @param {Uint8Array} update
   * @param {typeof UpdateDecoderV2 | typeof UpdateDecoderV1} YDecoder
   * @param {typeof UpdateEncoderV2 | typeof UpdateEncoderV1 } YEncoder
   */
  const convertUpdateFormat = (update, YDecoder, YEncoder) => {
    const updateDecoder = new YDecoder(createDecoder(update));
    const lazyDecoder = new LazyStructReader(updateDecoder, false);
    const updateEncoder = new YEncoder();
    const lazyWriter = new LazyStructWriter(updateEncoder);

    for (let curr = lazyDecoder.curr; curr !== null; curr = lazyDecoder.next()) {
      writeStructToLazyStructWriter(lazyWriter, curr, 0);
    }
    finishLazyStructWriting(lazyWriter);
    const ds = readDeleteSet(updateDecoder);
    writeDeleteSet(updateEncoder, ds);
    return updateEncoder.toUint8Array()
  };

  /**
   * @param {Uint8Array} update
   */
  const convertUpdateFormatV1ToV2 = update => convertUpdateFormat(update, UpdateDecoderV1, UpdateEncoderV2);

  /**
   * @param {Uint8Array} update
   */
  const convertUpdateFormatV2ToV1 = update => convertUpdateFormat(update, UpdateDecoderV2, UpdateEncoderV1);

  /**
   * @template {AbstractType<any>} T
   * YEvent describes the changes on a YType.
   */
  class YEvent {
    /**
     * @param {T} target The changed type.
     * @param {Transaction} transaction
     */
    constructor (target, transaction) {
      /**
       * The type on which this event was created on.
       * @type {T}
       */
      this.target = target;
      /**
       * The current target on which the observe callback is called.
       * @type {AbstractType<any>}
       */
      this.currentTarget = target;
      /**
       * The transaction that triggered this event.
       * @type {Transaction}
       */
      this.transaction = transaction;
      /**
       * @type {Object|null}
       */
      this._changes = null;
      /**
       * @type {null | Map<string, { action: 'add' | 'update' | 'delete', oldValue: any, newValue: any }>}
       */
      this._keys = null;
      /**
       * @type {null | Array<{ insert?: string | Array<any> | object | AbstractType<any>, retain?: number, delete?: number, attributes?: Object<string, any> }>}
       */
      this._delta = null;
    }

    /**
     * Computes the path from `y` to the changed type.
     *
     * @todo v14 should standardize on path: Array<{parent, index}> because that is easier to work with.
     *
     * The following property holds:
     * @example
     *   let type = y
     *   event.path.forEach(dir => {
     *     type = type.get(dir)
     *   })
     *   type === event.target // => true
     */
    get path () {
      // @ts-ignore _item is defined because target is integrated
      return getPathTo(this.currentTarget, this.target)
    }

    /**
     * Check if a struct is deleted by this event.
     *
     * In contrast to change.deleted, this method also returns true if the struct was added and then deleted.
     *
     * @param {AbstractStruct} struct
     * @return {boolean}
     */
    deletes (struct) {
      return isDeleted(this.transaction.deleteSet, struct.id)
    }

    /**
     * @type {Map<string, { action: 'add' | 'update' | 'delete', oldValue: any, newValue: any }>}
     */
    get keys () {
      if (this._keys === null) {
        const keys = new Map();
        const target = this.target;
        const changed = /** @type Set<string|null> */ (this.transaction.changed.get(target));
        changed.forEach(key => {
          if (key !== null) {
            const item = /** @type {Item} */ (target._map.get(key));
            /**
             * @type {'delete' | 'add' | 'update'}
             */
            let action;
            let oldValue;
            if (this.adds(item)) {
              let prev = item.left;
              while (prev !== null && this.adds(prev)) {
                prev = prev.left;
              }
              if (this.deletes(item)) {
                if (prev !== null && this.deletes(prev)) {
                  action = 'delete';
                  oldValue = last(prev.content.getContent());
                } else {
                  return
                }
              } else {
                if (prev !== null && this.deletes(prev)) {
                  action = 'update';
                  oldValue = last(prev.content.getContent());
                } else {
                  action = 'add';
                  oldValue = undefined;
                }
              }
            } else {
              if (this.deletes(item)) {
                action = 'delete';
                oldValue = last(/** @type {Item} */ item.content.getContent());
              } else {
                return // nop
              }
            }
            keys.set(key, { action, oldValue });
          }
        });
        this._keys = keys;
      }
      return this._keys
    }

    /**
     * @type {Array<{insert?: string | Array<any> | object | AbstractType<any>, retain?: number, delete?: number, attributes?: Object<string, any>}>}
     */
    get delta () {
      return this.changes.delta
    }

    /**
     * Check if a struct is added by this event.
     *
     * In contrast to change.deleted, this method also returns true if the struct was added and then deleted.
     *
     * @param {AbstractStruct} struct
     * @return {boolean}
     */
    adds (struct) {
      return struct.id.clock >= (this.transaction.beforeState.get(struct.id.client) || 0)
    }

    /**
     * @type {{added:Set<Item>,deleted:Set<Item>,keys:Map<string,{action:'add'|'update'|'delete',oldValue:any}>,delta:Array<{insert?:Array<any>|string, delete?:number, retain?:number}>}}
     */
    get changes () {
      let changes = this._changes;
      if (changes === null) {
        const target = this.target;
        const added = create$1();
        const deleted = create$1();
        /**
         * @type {Array<{insert:Array<any>}|{delete:number}|{retain:number}>}
         */
        const delta = [];
        changes = {
          added,
          deleted,
          delta,
          keys: this.keys
        };
        const changed = /** @type Set<string|null> */ (this.transaction.changed.get(target));
        if (changed.has(null)) {
          /**
           * @type {any}
           */
          let lastOp = null;
          const packOp = () => {
            if (lastOp) {
              delta.push(lastOp);
            }
          };
          for (let item = target._start; item !== null; item = item.right) {
            if (item.deleted) {
              if (this.deletes(item) && !this.adds(item)) {
                if (lastOp === null || lastOp.delete === undefined) {
                  packOp();
                  lastOp = { delete: 0 };
                }
                lastOp.delete += item.length;
                deleted.add(item);
              } // else nop
            } else {
              if (this.adds(item)) {
                if (lastOp === null || lastOp.insert === undefined) {
                  packOp();
                  lastOp = { insert: [] };
                }
                lastOp.insert = lastOp.insert.concat(item.content.getContent());
                added.add(item);
              } else {
                if (lastOp === null || lastOp.retain === undefined) {
                  packOp();
                  lastOp = { retain: 0 };
                }
                lastOp.retain += item.length;
              }
            }
          }
          if (lastOp !== null && lastOp.retain === undefined) {
            packOp();
          }
        }
        this._changes = changes;
      }
      return /** @type {any} */ (changes)
    }
  }

  /**
   * Compute the path from this type to the specified target.
   *
   * @example
   *   // `child` should be accessible via `type.get(path[0]).get(path[1])..`
   *   const path = type.getPathTo(child)
   *   // assuming `type instanceof YArray`
   *   console.log(path) // might look like => [2, 'key1']
   *   child === type.get(path[0]).get(path[1])
   *
   * @param {AbstractType<any>} parent
   * @param {AbstractType<any>} child target
   * @return {Array<string|number>} Path to the target
   *
   * @private
   * @function
   */
  const getPathTo = (parent, child) => {
    const path = [];
    while (child._item !== null && child !== parent) {
      if (child._item.parentSub !== null) {
        // parent is map-ish
        path.unshift(child._item.parentSub);
      } else {
        // parent is array-ish
        let i = 0;
        let c = /** @type {AbstractType<any>} */ (child._item.parent)._start;
        while (c !== child._item && c !== null) {
          if (!c.deleted) {
            i++;
          }
          c = c.right;
        }
        path.unshift(i);
      }
      child = /** @type {AbstractType<any>} */ (child._item.parent);
    }
    return path
  };

  const maxSearchMarker = 80;

  /**
   * A unique timestamp that identifies each marker.
   *
   * Time is relative,.. this is more like an ever-increasing clock.
   *
   * @type {number}
   */
  let globalSearchMarkerTimestamp = 0;

  class ArraySearchMarker {
    /**
     * @param {Item} p
     * @param {number} index
     */
    constructor (p, index) {
      p.marker = true;
      this.p = p;
      this.index = index;
      this.timestamp = globalSearchMarkerTimestamp++;
    }
  }

  /**
   * @param {ArraySearchMarker} marker
   */
  const refreshMarkerTimestamp = marker => { marker.timestamp = globalSearchMarkerTimestamp++; };

  /**
   * This is rather complex so this function is the only thing that should overwrite a marker
   *
   * @param {ArraySearchMarker} marker
   * @param {Item} p
   * @param {number} index
   */
  const overwriteMarker = (marker, p, index) => {
    marker.p.marker = false;
    marker.p = p;
    p.marker = true;
    marker.index = index;
    marker.timestamp = globalSearchMarkerTimestamp++;
  };

  /**
   * @param {Array<ArraySearchMarker>} searchMarker
   * @param {Item} p
   * @param {number} index
   */
  const markPosition = (searchMarker, p, index) => {
    if (searchMarker.length >= maxSearchMarker) {
      // override oldest marker (we don't want to create more objects)
      const marker = searchMarker.reduce((a, b) => a.timestamp < b.timestamp ? a : b);
      overwriteMarker(marker, p, index);
      return marker
    } else {
      // create new marker
      const pm = new ArraySearchMarker(p, index);
      searchMarker.push(pm);
      return pm
    }
  };

  /**
   * Search marker help us to find positions in the associative array faster.
   *
   * They speed up the process of finding a position without much bookkeeping.
   *
   * A maximum of `maxSearchMarker` objects are created.
   *
   * This function always returns a refreshed marker (updated timestamp)
   *
   * @param {AbstractType<any>} yarray
   * @param {number} index
   */
  const findMarker = (yarray, index) => {
    if (yarray._start === null || index === 0 || yarray._searchMarker === null) {
      return null
    }
    const marker = yarray._searchMarker.length === 0 ? null : yarray._searchMarker.reduce((a, b) => abs(index - a.index) < abs(index - b.index) ? a : b);
    let p = yarray._start;
    let pindex = 0;
    if (marker !== null) {
      p = marker.p;
      pindex = marker.index;
      refreshMarkerTimestamp(marker); // we used it, we might need to use it again
    }
    // iterate to right if possible
    while (p.right !== null && pindex < index) {
      if (!p.deleted && p.countable) {
        if (index < pindex + p.length) {
          break
        }
        pindex += p.length;
      }
      p = p.right;
    }
    // iterate to left if necessary (might be that pindex > index)
    while (p.left !== null && pindex > index) {
      p = p.left;
      if (!p.deleted && p.countable) {
        pindex -= p.length;
      }
    }
    // we want to make sure that p can't be merged with left, because that would screw up everything
    // in that cas just return what we have (it is most likely the best marker anyway)
    // iterate to left until p can't be merged with left
    while (p.left !== null && p.left.id.client === p.id.client && p.left.id.clock + p.left.length === p.id.clock) {
      p = p.left;
      if (!p.deleted && p.countable) {
        pindex -= p.length;
      }
    }

    // @todo remove!
    // assure position
    // {
    //   let start = yarray._start
    //   let pos = 0
    //   while (start !== p) {
    //     if (!start.deleted && start.countable) {
    //       pos += start.length
    //     }
    //     start = /** @type {Item} */ (start.right)
    //   }
    //   if (pos !== pindex) {
    //     debugger
    //     throw new Error('Gotcha position fail!')
    //   }
    // }
    // if (marker) {
    //   if (window.lengthes == null) {
    //     window.lengthes = []
    //     window.getLengthes = () => window.lengthes.sort((a, b) => a - b)
    //   }
    //   window.lengthes.push(marker.index - pindex)
    //   console.log('distance', marker.index - pindex, 'len', p && p.parent.length)
    // }
    if (marker !== null && abs(marker.index - pindex) < /** @type {YText|YArray<any>} */ (p.parent).length / maxSearchMarker) {
      // adjust existing marker
      overwriteMarker(marker, p, pindex);
      return marker
    } else {
      // create new marker
      return markPosition(yarray._searchMarker, p, pindex)
    }
  };

  /**
   * Update markers when a change happened.
   *
   * This should be called before doing a deletion!
   *
   * @param {Array<ArraySearchMarker>} searchMarker
   * @param {number} index
   * @param {number} len If insertion, len is positive. If deletion, len is negative.
   */
  const updateMarkerChanges = (searchMarker, index, len) => {
    for (let i = searchMarker.length - 1; i >= 0; i--) {
      const m = searchMarker[i];
      if (len > 0) {
        /**
         * @type {Item|null}
         */
        let p = m.p;
        p.marker = false;
        // Ideally we just want to do a simple position comparison, but this will only work if
        // search markers don't point to deleted items for formats.
        // Iterate marker to prev undeleted countable position so we know what to do when updating a position
        while (p && (p.deleted || !p.countable)) {
          p = p.left;
          if (p && !p.deleted && p.countable) {
            // adjust position. the loop should break now
            m.index -= p.length;
          }
        }
        if (p === null || p.marker === true) {
          // remove search marker if updated position is null or if position is already marked
          searchMarker.splice(i, 1);
          continue
        }
        m.p = p;
        p.marker = true;
      }
      if (index < m.index || (len > 0 && index === m.index)) { // a simple index <= m.index check would actually suffice
        m.index = max(index, m.index + len);
      }
    }
  };

  /**
   * Accumulate all (list) children of a type and return them as an Array.
   *
   * @param {AbstractType<any>} t
   * @return {Array<Item>}
   */
  const getTypeChildren = t => {
    let s = t._start;
    const arr = [];
    while (s) {
      arr.push(s);
      s = s.right;
    }
    return arr
  };

  /**
   * Call event listeners with an event. This will also add an event to all
   * parents (for `.observeDeep` handlers).
   *
   * @template EventType
   * @param {AbstractType<EventType>} type
   * @param {Transaction} transaction
   * @param {EventType} event
   */
  const callTypeObservers = (type, transaction, event) => {
    const changedType = type;
    const changedParentTypes = transaction.changedParentTypes;
    while (true) {
      // @ts-ignore
      setIfUndefined(changedParentTypes, type, () => []).push(event);
      if (type._item === null) {
        break
      }
      type = /** @type {AbstractType<any>} */ (type._item.parent);
    }
    callEventHandlerListeners(changedType._eH, event, transaction);
  };

  /**
   * @template EventType
   * Abstract Yjs Type class
   */
  class AbstractType {
    constructor () {
      /**
       * @type {Item|null}
       */
      this._item = null;
      /**
       * @type {Map<string,Item>}
       */
      this._map = new Map();
      /**
       * @type {Item|null}
       */
      this._start = null;
      /**
       * @type {Doc|null}
       */
      this.doc = null;
      this._length = 0;
      /**
       * Event handlers
       * @type {EventHandler<EventType,Transaction>}
       */
      this._eH = createEventHandler();
      /**
       * Deep event handlers
       * @type {EventHandler<Array<YEvent<any>>,Transaction>}
       */
      this._dEH = createEventHandler();
      /**
       * @type {null | Array<ArraySearchMarker>}
       */
      this._searchMarker = null;
    }

    /**
     * @return {AbstractType<any>|null}
     */
    get parent () {
      return this._item ? /** @type {AbstractType<any>} */ (this._item.parent) : null
    }

    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item|null} item
     */
    _integrate (y, item) {
      this.doc = y;
      this._item = item;
    }

    /**
     * @return {AbstractType<EventType>}
     */
    _copy () {
      throw methodUnimplemented()
    }

    /**
     * @return {AbstractType<EventType>}
     */
    clone () {
      throw methodUnimplemented()
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write (encoder) { }

    /**
     * The first non-deleted item
     */
    get _first () {
      let n = this._start;
      while (n !== null && n.deleted) {
        n = n.right;
      }
      return n
    }

    /**
     * Creates YEvent and calls all type observers.
     * Must be implemented by each type.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver (transaction, parentSubs) {
      if (!transaction.local && this._searchMarker) {
        this._searchMarker.length = 0;
      }
    }

    /**
     * Observe all events that are created on this type.
     *
     * @param {function(EventType, Transaction):void} f Observer function
     */
    observe (f) {
      addEventHandlerListener(this._eH, f);
    }

    /**
     * Observe all events that are created by this type and its children.
     *
     * @param {function(Array<YEvent<any>>,Transaction):void} f Observer function
     */
    observeDeep (f) {
      addEventHandlerListener(this._dEH, f);
    }

    /**
     * Unregister an observer function.
     *
     * @param {function(EventType,Transaction):void} f Observer function
     */
    unobserve (f) {
      removeEventHandlerListener(this._eH, f);
    }

    /**
     * Unregister an observer function.
     *
     * @param {function(Array<YEvent<any>>,Transaction):void} f Observer function
     */
    unobserveDeep (f) {
      removeEventHandlerListener(this._dEH, f);
    }

    /**
     * @abstract
     * @return {any}
     */
    toJSON () {}
  }

  /**
   * @param {AbstractType<any>} type
   * @param {number} start
   * @param {number} end
   * @return {Array<any>}
   *
   * @private
   * @function
   */
  const typeListSlice = (type, start, end) => {
    if (start < 0) {
      start = type._length + start;
    }
    if (end < 0) {
      end = type._length + end;
    }
    let len = end - start;
    const cs = [];
    let n = type._start;
    while (n !== null && len > 0) {
      if (n.countable && !n.deleted) {
        const c = n.content.getContent();
        if (c.length <= start) {
          start -= c.length;
        } else {
          for (let i = start; i < c.length && len > 0; i++) {
            cs.push(c[i]);
            len--;
          }
          start = 0;
        }
      }
      n = n.right;
    }
    return cs
  };

  /**
   * @param {AbstractType<any>} type
   * @return {Array<any>}
   *
   * @private
   * @function
   */
  const typeListToArray = type => {
    const cs = [];
    let n = type._start;
    while (n !== null) {
      if (n.countable && !n.deleted) {
        const c = n.content.getContent();
        for (let i = 0; i < c.length; i++) {
          cs.push(c[i]);
        }
      }
      n = n.right;
    }
    return cs
  };

  /**
   * @param {AbstractType<any>} type
   * @param {Snapshot} snapshot
   * @return {Array<any>}
   *
   * @private
   * @function
   */
  const typeListToArraySnapshot = (type, snapshot) => {
    const cs = [];
    let n = type._start;
    while (n !== null) {
      if (n.countable && isVisible$1(n, snapshot)) {
        const c = n.content.getContent();
        for (let i = 0; i < c.length; i++) {
          cs.push(c[i]);
        }
      }
      n = n.right;
    }
    return cs
  };

  /**
   * Executes a provided function on once on overy element of this YArray.
   *
   * @param {AbstractType<any>} type
   * @param {function(any,number,any):void} f A function to execute on every element of this YArray.
   *
   * @private
   * @function
   */
  const typeListForEach = (type, f) => {
    let index = 0;
    let n = type._start;
    while (n !== null) {
      if (n.countable && !n.deleted) {
        const c = n.content.getContent();
        for (let i = 0; i < c.length; i++) {
          f(c[i], index++, type);
        }
      }
      n = n.right;
    }
  };

  /**
   * @template C,R
   * @param {AbstractType<any>} type
   * @param {function(C,number,AbstractType<any>):R} f
   * @return {Array<R>}
   *
   * @private
   * @function
   */
  const typeListMap = (type, f) => {
    /**
     * @type {Array<any>}
     */
    const result = [];
    typeListForEach(type, (c, i) => {
      result.push(f(c, i, type));
    });
    return result
  };

  /**
   * @param {AbstractType<any>} type
   * @return {IterableIterator<any>}
   *
   * @private
   * @function
   */
  const typeListCreateIterator = type => {
    let n = type._start;
    /**
     * @type {Array<any>|null}
     */
    let currentContent = null;
    let currentContentIndex = 0;
    return {
      [Symbol.iterator] () {
        return this
      },
      next: () => {
        // find some content
        if (currentContent === null) {
          while (n !== null && n.deleted) {
            n = n.right;
          }
          // check if we reached the end, no need to check currentContent, because it does not exist
          if (n === null) {
            return {
              done: true,
              value: undefined
            }
          }
          // we found n, so we can set currentContent
          currentContent = n.content.getContent();
          currentContentIndex = 0;
          n = n.right; // we used the content of n, now iterate to next
        }
        const value = currentContent[currentContentIndex++];
        // check if we need to empty currentContent
        if (currentContent.length <= currentContentIndex) {
          currentContent = null;
        }
        return {
          done: false,
          value
        }
      }
    }
  };

  /**
   * @param {AbstractType<any>} type
   * @param {number} index
   * @return {any}
   *
   * @private
   * @function
   */
  const typeListGet = (type, index) => {
    const marker = findMarker(type, index);
    let n = type._start;
    if (marker !== null) {
      n = marker.p;
      index -= marker.index;
    }
    for (; n !== null; n = n.right) {
      if (!n.deleted && n.countable) {
        if (index < n.length) {
          return n.content.getContent()[index]
        }
        index -= n.length;
      }
    }
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {Item?} referenceItem
   * @param {Array<Object<string,any>|Array<any>|boolean|number|null|string|Uint8Array>} content
   *
   * @private
   * @function
   */
  const typeListInsertGenericsAfter = (transaction, parent, referenceItem, content) => {
    let left = referenceItem;
    const doc = transaction.doc;
    const ownClientId = doc.clientID;
    const store = doc.store;
    const right = referenceItem === null ? parent._start : referenceItem.right;
    /**
     * @type {Array<Object|Array<any>|number|null>}
     */
    let jsonContent = [];
    const packJsonContent = () => {
      if (jsonContent.length > 0) {
        left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentAny(jsonContent));
        left.integrate(transaction, 0);
        jsonContent = [];
      }
    };
    content.forEach(c => {
      if (c === null) {
        jsonContent.push(c);
      } else {
        switch (c.constructor) {
          case Number:
          case Object:
          case Boolean:
          case Array:
          case String:
            jsonContent.push(c);
            break
          default:
            packJsonContent();
            switch (c.constructor) {
              case Uint8Array:
              case ArrayBuffer:
                left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentBinary(new Uint8Array(/** @type {Uint8Array} */ (c))));
                left.integrate(transaction, 0);
                break
              case Doc:
                left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentDoc(/** @type {Doc} */ (c)));
                left.integrate(transaction, 0);
                break
              default:
                if (c instanceof AbstractType) {
                  left = new Item(createID(ownClientId, getState(store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentType(c));
                  left.integrate(transaction, 0);
                } else {
                  throw new Error('Unexpected content type in insert operation')
                }
            }
        }
      }
    });
    packJsonContent();
  };

  const lengthExceeded = create('Length exceeded!');

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {number} index
   * @param {Array<Object<string,any>|Array<any>|number|null|string|Uint8Array>} content
   *
   * @private
   * @function
   */
  const typeListInsertGenerics = (transaction, parent, index, content) => {
    if (index > parent._length) {
      throw lengthExceeded
    }
    if (index === 0) {
      if (parent._searchMarker) {
        updateMarkerChanges(parent._searchMarker, index, content.length);
      }
      return typeListInsertGenericsAfter(transaction, parent, null, content)
    }
    const startIndex = index;
    const marker = findMarker(parent, index);
    let n = parent._start;
    if (marker !== null) {
      n = marker.p;
      index -= marker.index;
      // we need to iterate one to the left so that the algorithm works
      if (index === 0) {
        // @todo refactor this as it actually doesn't consider formats
        n = n.prev; // important! get the left undeleted item so that we can actually decrease index
        index += (n && n.countable && !n.deleted) ? n.length : 0;
      }
    }
    for (; n !== null; n = n.right) {
      if (!n.deleted && n.countable) {
        if (index <= n.length) {
          if (index < n.length) {
            // insert in-between
            getItemCleanStart(transaction, createID(n.id.client, n.id.clock + index));
          }
          break
        }
        index -= n.length;
      }
    }
    if (parent._searchMarker) {
      updateMarkerChanges(parent._searchMarker, startIndex, content.length);
    }
    return typeListInsertGenericsAfter(transaction, parent, n, content)
  };

  /**
   * Pushing content is special as we generally want to push after the last item. So we don't have to update
   * the serach marker.
   *
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {Array<Object<string,any>|Array<any>|number|null|string|Uint8Array>} content
   *
   * @private
   * @function
   */
  const typeListPushGenerics = (transaction, parent, content) => {
    // Use the marker with the highest index and iterate to the right.
    const marker = (parent._searchMarker || []).reduce((maxMarker, currMarker) => currMarker.index > maxMarker.index ? currMarker : maxMarker, { index: 0, p: parent._start });
    let n = marker.p;
    if (n) {
      while (n.right) {
        n = n.right;
      }
    }
    return typeListInsertGenericsAfter(transaction, parent, n, content)
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {number} index
   * @param {number} length
   *
   * @private
   * @function
   */
  const typeListDelete = (transaction, parent, index, length) => {
    if (length === 0) { return }
    const startIndex = index;
    const startLength = length;
    const marker = findMarker(parent, index);
    let n = parent._start;
    if (marker !== null) {
      n = marker.p;
      index -= marker.index;
    }
    // compute the first item to be deleted
    for (; n !== null && index > 0; n = n.right) {
      if (!n.deleted && n.countable) {
        if (index < n.length) {
          getItemCleanStart(transaction, createID(n.id.client, n.id.clock + index));
        }
        index -= n.length;
      }
    }
    // delete all items until done
    while (length > 0 && n !== null) {
      if (!n.deleted) {
        if (length < n.length) {
          getItemCleanStart(transaction, createID(n.id.client, n.id.clock + length));
        }
        n.delete(transaction);
        length -= n.length;
      }
      n = n.right;
    }
    if (length > 0) {
      throw lengthExceeded
    }
    if (parent._searchMarker) {
      updateMarkerChanges(parent._searchMarker, startIndex, -startLength + length /* in case we remove the above exception */);
    }
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {string} key
   *
   * @private
   * @function
   */
  const typeMapDelete = (transaction, parent, key) => {
    const c = parent._map.get(key);
    if (c !== undefined) {
      c.delete(transaction);
    }
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {string} key
   * @param {Object|number|null|Array<any>|string|Uint8Array|AbstractType<any>} value
   *
   * @private
   * @function
   */
  const typeMapSet = (transaction, parent, key, value) => {
    const left = parent._map.get(key) || null;
    const doc = transaction.doc;
    const ownClientId = doc.clientID;
    let content;
    if (value == null) {
      content = new ContentAny([value]);
    } else {
      switch (value.constructor) {
        case Number:
        case Object:
        case Boolean:
        case Array:
        case String:
          content = new ContentAny([value]);
          break
        case Uint8Array:
          content = new ContentBinary(/** @type {Uint8Array} */ (value));
          break
        case Doc:
          content = new ContentDoc(/** @type {Doc} */ (value));
          break
        default:
          if (value instanceof AbstractType) {
            content = new ContentType(value);
          } else {
            throw new Error('Unexpected content type')
          }
      }
    }
    new Item(createID(ownClientId, getState(doc.store, ownClientId)), left, left && left.lastId, null, null, parent, key, content).integrate(transaction, 0);
  };

  /**
   * @param {AbstractType<any>} parent
   * @param {string} key
   * @return {Object<string,any>|number|null|Array<any>|string|Uint8Array|AbstractType<any>|undefined}
   *
   * @private
   * @function
   */
  const typeMapGet = (parent, key) => {
    const val = parent._map.get(key);
    return val !== undefined && !val.deleted ? val.content.getContent()[val.length - 1] : undefined
  };

  /**
   * @param {AbstractType<any>} parent
   * @return {Object<string,Object<string,any>|number|null|Array<any>|string|Uint8Array|AbstractType<any>|undefined>}
   *
   * @private
   * @function
   */
  const typeMapGetAll = (parent) => {
    /**
     * @type {Object<string,any>}
     */
    const res = {};
    parent._map.forEach((value, key) => {
      if (!value.deleted) {
        res[key] = value.content.getContent()[value.length - 1];
      }
    });
    return res
  };

  /**
   * @param {AbstractType<any>} parent
   * @param {string} key
   * @return {boolean}
   *
   * @private
   * @function
   */
  const typeMapHas = (parent, key) => {
    const val = parent._map.get(key);
    return val !== undefined && !val.deleted
  };

  /**
   * @param {AbstractType<any>} parent
   * @param {string} key
   * @param {Snapshot} snapshot
   * @return {Object<string,any>|number|null|Array<any>|string|Uint8Array|AbstractType<any>|undefined}
   *
   * @private
   * @function
   */
  const typeMapGetSnapshot = (parent, key, snapshot) => {
    let v = parent._map.get(key) || null;
    while (v !== null && (!snapshot.sv.has(v.id.client) || v.id.clock >= (snapshot.sv.get(v.id.client) || 0))) {
      v = v.left;
    }
    return v !== null && isVisible$1(v, snapshot) ? v.content.getContent()[v.length - 1] : undefined
  };

  /**
   * @param {Map<string,Item>} map
   * @return {IterableIterator<Array<any>>}
   *
   * @private
   * @function
   */
  const createMapIterator = map => iteratorFilter(map.entries(), /** @param {any} entry */ entry => !entry[1].deleted);

  /**
   * @module YArray
   */

  /**
   * Event that describes the changes on a YArray
   * @template T
   * @extends YEvent<YArray<T>>
   */
  class YArrayEvent extends YEvent {
    /**
     * @param {YArray<T>} yarray The changed type
     * @param {Transaction} transaction The transaction object
     */
    constructor (yarray, transaction) {
      super(yarray, transaction);
      this._transaction = transaction;
    }
  }

  /**
   * A shared Array implementation.
   * @template T
   * @extends AbstractType<YArrayEvent<T>>
   * @implements {Iterable<T>}
   */
  class YArray extends AbstractType {
    constructor () {
      super();
      /**
       * @type {Array<any>?}
       * @private
       */
      this._prelimContent = [];
      /**
       * @type {Array<ArraySearchMarker>}
       */
      this._searchMarker = [];
    }

    /**
     * Construct a new YArray containing the specified items.
     * @template T
     * @param {Array<T>} items
     * @return {YArray<T>}
     */
    static from (items) {
      const a = new YArray();
      a.push(items);
      return a
    }

    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate (y, item) {
      super._integrate(y, item);
      this.insert(0, /** @type {Array<any>} */ (this._prelimContent));
      this._prelimContent = null;
    }

    _copy () {
      return new YArray()
    }

    /**
     * @return {YArray<T>}
     */
    clone () {
      const arr = new YArray();
      arr.insert(0, this.toArray().map(el =>
        el instanceof AbstractType ? el.clone() : el
      ));
      return arr
    }

    get length () {
      return this._prelimContent === null ? this._length : this._prelimContent.length
    }

    /**
     * Creates YArrayEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver (transaction, parentSubs) {
      super._callObserver(transaction, parentSubs);
      callTypeObservers(this, transaction, new YArrayEvent(this, transaction));
    }

    /**
     * Inserts new content at an index.
     *
     * Important: This function expects an array of content. Not just a content
     * object. The reason for this "weirdness" is that inserting several elements
     * is very efficient when it is done as a single operation.
     *
     * @example
     *  // Insert character 'a' at position 0
     *  yarray.insert(0, ['a'])
     *  // Insert numbers 1, 2 at position 1
     *  yarray.insert(1, [1, 2])
     *
     * @param {number} index The index to insert content at.
     * @param {Array<T>} content The array of content
     */
    insert (index, content) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeListInsertGenerics(transaction, this, index, content);
        });
      } else {
        /** @type {Array<any>} */ (this._prelimContent).splice(index, 0, ...content);
      }
    }

    /**
     * Appends content to this YArray.
     *
     * @param {Array<T>} content Array of content to append.
     *
     * @todo Use the following implementation in all types.
     */
    push (content) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeListPushGenerics(transaction, this, content);
        });
      } else {
        /** @type {Array<any>} */ (this._prelimContent).push(...content);
      }
    }

    /**
     * Preppends content to this YArray.
     *
     * @param {Array<T>} content Array of content to preppend.
     */
    unshift (content) {
      this.insert(0, content);
    }

    /**
     * Deletes elements starting from an index.
     *
     * @param {number} index Index at which to start deleting elements
     * @param {number} length The number of elements to remove. Defaults to 1.
     */
    delete (index, length = 1) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeListDelete(transaction, this, index, length);
        });
      } else {
        /** @type {Array<any>} */ (this._prelimContent).splice(index, length);
      }
    }

    /**
     * Returns the i-th element from a YArray.
     *
     * @param {number} index The index of the element to return from the YArray
     * @return {T}
     */
    get (index) {
      return typeListGet(this, index)
    }

    /**
     * Transforms this YArray to a JavaScript Array.
     *
     * @return {Array<T>}
     */
    toArray () {
      return typeListToArray(this)
    }

    /**
     * Transforms this YArray to a JavaScript Array.
     *
     * @param {number} [start]
     * @param {number} [end]
     * @return {Array<T>}
     */
    slice (start = 0, end = this.length) {
      return typeListSlice(this, start, end)
    }

    /**
     * Transforms this Shared Type to a JSON object.
     *
     * @return {Array<any>}
     */
    toJSON () {
      return this.map(c => c instanceof AbstractType ? c.toJSON() : c)
    }

    /**
     * Returns an Array with the result of calling a provided function on every
     * element of this YArray.
     *
     * @template M
     * @param {function(T,number,YArray<T>):M} f Function that produces an element of the new Array
     * @return {Array<M>} A new array with each element being the result of the
     *                 callback function
     */
    map (f) {
      return typeListMap(this, /** @type {any} */ (f))
    }

    /**
     * Executes a provided function on once on overy element of this YArray.
     *
     * @param {function(T,number,YArray<T>):void} f A function to execute on every element of this YArray.
     */
    forEach (f) {
      typeListForEach(this, f);
    }

    /**
     * @return {IterableIterator<T>}
     */
    [Symbol.iterator] () {
      return typeListCreateIterator(this)
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write (encoder) {
      encoder.writeTypeRef(YArrayRefID);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   *
   * @private
   * @function
   */
  const readYArray = decoder => new YArray();

  /**
   * @template T
   * @extends YEvent<YMap<T>>
   * Event that describes the changes on a YMap.
   */
  class YMapEvent extends YEvent {
    /**
     * @param {YMap<T>} ymap The YArray that changed.
     * @param {Transaction} transaction
     * @param {Set<any>} subs The keys that changed.
     */
    constructor (ymap, transaction, subs) {
      super(ymap, transaction);
      this.keysChanged = subs;
    }
  }

  /**
   * @template MapType
   * A shared Map implementation.
   *
   * @extends AbstractType<YMapEvent<MapType>>
   * @implements {Iterable<MapType>}
   */
  class YMap extends AbstractType {
    /**
     *
     * @param {Iterable<readonly [string, any]>=} entries - an optional iterable to initialize the YMap
     */
    constructor (entries) {
      super();
      /**
       * @type {Map<string,any>?}
       * @private
       */
      this._prelimContent = null;

      if (entries === undefined) {
        this._prelimContent = new Map();
      } else {
        this._prelimContent = new Map(entries);
      }
    }

    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate (y, item) {
      super._integrate(y, item)
      ;/** @type {Map<string, any>} */ (this._prelimContent).forEach((value, key) => {
        this.set(key, value);
      });
      this._prelimContent = null;
    }

    _copy () {
      return new YMap()
    }

    /**
     * @return {YMap<MapType>}
     */
    clone () {
      const map = new YMap();
      this.forEach((value, key) => {
        map.set(key, value instanceof AbstractType ? value.clone() : value);
      });
      return map
    }

    /**
     * Creates YMapEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver (transaction, parentSubs) {
      callTypeObservers(this, transaction, new YMapEvent(this, transaction, parentSubs));
    }

    /**
     * Transforms this Shared Type to a JSON object.
     *
     * @return {Object<string,any>}
     */
    toJSON () {
      /**
       * @type {Object<string,MapType>}
       */
      const map = {};
      this._map.forEach((item, key) => {
        if (!item.deleted) {
          const v = item.content.getContent()[item.length - 1];
          map[key] = v instanceof AbstractType ? v.toJSON() : v;
        }
      });
      return map
    }

    /**
     * Returns the size of the YMap (count of key/value pairs)
     *
     * @return {number}
     */
    get size () {
      return [...createMapIterator(this._map)].length
    }

    /**
     * Returns the keys for each element in the YMap Type.
     *
     * @return {IterableIterator<string>}
     */
    keys () {
      return iteratorMap(createMapIterator(this._map), /** @param {any} v */ v => v[0])
    }

    /**
     * Returns the values for each element in the YMap Type.
     *
     * @return {IterableIterator<any>}
     */
    values () {
      return iteratorMap(createMapIterator(this._map), /** @param {any} v */ v => v[1].content.getContent()[v[1].length - 1])
    }

    /**
     * Returns an Iterator of [key, value] pairs
     *
     * @return {IterableIterator<any>}
     */
    entries () {
      return iteratorMap(createMapIterator(this._map), /** @param {any} v */ v => [v[0], v[1].content.getContent()[v[1].length - 1]])
    }

    /**
     * Executes a provided function on once on every key-value pair.
     *
     * @param {function(MapType,string,YMap<MapType>):void} f A function to execute on every element of this YArray.
     */
    forEach (f) {
      /**
       * @type {Object<string,MapType>}
       */
      const map = {};
      this._map.forEach((item, key) => {
        if (!item.deleted) {
          f(item.content.getContent()[item.length - 1], key, this);
        }
      });
      return map
    }

    /**
     * Returns an Iterator of [key, value] pairs
     *
     * @return {IterableIterator<any>}
     */
    [Symbol.iterator] () {
      return this.entries()
    }

    /**
     * Remove a specified element from this YMap.
     *
     * @param {string} key The key of the element to remove.
     */
    delete (key) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeMapDelete(transaction, this, key);
        });
      } else {
        /** @type {Map<string, any>} */ (this._prelimContent).delete(key);
      }
    }

    /**
     * Adds or updates an element with a specified key and value.
     *
     * @param {string} key The key of the element to add to this YMap
     * @param {MapType} value The value of the element to add
     */
    set (key, value) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeMapSet(transaction, this, key, value);
        });
      } else {
        /** @type {Map<string, any>} */ (this._prelimContent).set(key, value);
      }
      return value
    }

    /**
     * Returns a specified element from this YMap.
     *
     * @param {string} key
     * @return {MapType|undefined}
     */
    get (key) {
      return /** @type {any} */ (typeMapGet(this, key))
    }

    /**
     * Returns a boolean indicating whether the specified key exists or not.
     *
     * @param {string} key The key to test.
     * @return {boolean}
     */
    has (key) {
      return typeMapHas(this, key)
    }

    /**
     * Removes all elements from this YMap.
     */
    clear () {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          this.forEach(function (value, key, map) {
            typeMapDelete(transaction, map, key);
          });
        });
      } else {
        /** @type {Map<string, any>} */ (this._prelimContent).clear();
      }
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write (encoder) {
      encoder.writeTypeRef(YMapRefID);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   *
   * @private
   * @function
   */
  const readYMap = decoder => new YMap();

  /**
   * @param {any} a
   * @param {any} b
   * @return {boolean}
   */
  const equalAttrs$1 = (a, b) => a === b || (typeof a === 'object' && typeof b === 'object' && a && b && equalFlat(a, b));

  class ItemTextListPosition {
    /**
     * @param {Item|null} left
     * @param {Item|null} right
     * @param {number} index
     * @param {Map<string,any>} currentAttributes
     */
    constructor (left, right, index, currentAttributes) {
      this.left = left;
      this.right = right;
      this.index = index;
      this.currentAttributes = currentAttributes;
    }

    /**
     * Only call this if you know that this.right is defined
     */
    forward () {
      if (this.right === null) {
        unexpectedCase();
      }
      switch (this.right.content.constructor) {
        case ContentFormat:
          if (!this.right.deleted) {
            updateCurrentAttributes(this.currentAttributes, /** @type {ContentFormat} */ (this.right.content));
          }
          break
        default:
          if (!this.right.deleted) {
            this.index += this.right.length;
          }
          break
      }
      this.left = this.right;
      this.right = this.right.right;
    }
  }

  /**
   * @param {Transaction} transaction
   * @param {ItemTextListPosition} pos
   * @param {number} count steps to move forward
   * @return {ItemTextListPosition}
   *
   * @private
   * @function
   */
  const findNextPosition = (transaction, pos, count) => {
    while (pos.right !== null && count > 0) {
      switch (pos.right.content.constructor) {
        case ContentFormat:
          if (!pos.right.deleted) {
            updateCurrentAttributes(pos.currentAttributes, /** @type {ContentFormat} */ (pos.right.content));
          }
          break
        default:
          if (!pos.right.deleted) {
            if (count < pos.right.length) {
              // split right
              getItemCleanStart(transaction, createID(pos.right.id.client, pos.right.id.clock + count));
            }
            pos.index += pos.right.length;
            count -= pos.right.length;
          }
          break
      }
      pos.left = pos.right;
      pos.right = pos.right.right;
      // pos.forward() - we don't forward because that would halve the performance because we already do the checks above
    }
    return pos
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {number} index
   * @return {ItemTextListPosition}
   *
   * @private
   * @function
   */
  const findPosition = (transaction, parent, index) => {
    const currentAttributes = new Map();
    const marker = findMarker(parent, index);
    if (marker) {
      const pos = new ItemTextListPosition(marker.p.left, marker.p, marker.index, currentAttributes);
      return findNextPosition(transaction, pos, index - marker.index)
    } else {
      const pos = new ItemTextListPosition(null, parent._start, 0, currentAttributes);
      return findNextPosition(transaction, pos, index)
    }
  };

  /**
   * Negate applied formats
   *
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {ItemTextListPosition} currPos
   * @param {Map<string,any>} negatedAttributes
   *
   * @private
   * @function
   */
  const insertNegatedAttributes = (transaction, parent, currPos, negatedAttributes) => {
    // check if we really need to remove attributes
    while (
      currPos.right !== null && (
        currPos.right.deleted === true || (
          currPos.right.content.constructor === ContentFormat &&
          equalAttrs$1(negatedAttributes.get(/** @type {ContentFormat} */ (currPos.right.content).key), /** @type {ContentFormat} */ (currPos.right.content).value)
        )
      )
    ) {
      if (!currPos.right.deleted) {
        negatedAttributes.delete(/** @type {ContentFormat} */ (currPos.right.content).key);
      }
      currPos.forward();
    }
    const doc = transaction.doc;
    const ownClientId = doc.clientID;
    negatedAttributes.forEach((val, key) => {
      const left = currPos.left;
      const right = currPos.right;
      const nextFormat = new Item(createID(ownClientId, getState(doc.store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentFormat(key, val));
      nextFormat.integrate(transaction, 0);
      currPos.right = nextFormat;
      currPos.forward();
    });
  };

  /**
   * @param {Map<string,any>} currentAttributes
   * @param {ContentFormat} format
   *
   * @private
   * @function
   */
  const updateCurrentAttributes = (currentAttributes, format) => {
    const { key, value } = format;
    if (value === null) {
      currentAttributes.delete(key);
    } else {
      currentAttributes.set(key, value);
    }
  };

  /**
   * @param {ItemTextListPosition} currPos
   * @param {Object<string,any>} attributes
   *
   * @private
   * @function
   */
  const minimizeAttributeChanges = (currPos, attributes) => {
    // go right while attributes[right.key] === right.value (or right is deleted)
    while (true) {
      if (currPos.right === null) {
        break
      } else if (currPos.right.deleted || (currPos.right.content.constructor === ContentFormat && equalAttrs$1(attributes[(/** @type {ContentFormat} */ (currPos.right.content)).key] || null, /** @type {ContentFormat} */ (currPos.right.content).value))) ; else {
        break
      }
      currPos.forward();
    }
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {ItemTextListPosition} currPos
   * @param {Object<string,any>} attributes
   * @return {Map<string,any>}
   *
   * @private
   * @function
   **/
  const insertAttributes = (transaction, parent, currPos, attributes) => {
    const doc = transaction.doc;
    const ownClientId = doc.clientID;
    const negatedAttributes = new Map();
    // insert format-start items
    for (const key in attributes) {
      const val = attributes[key];
      const currentVal = currPos.currentAttributes.get(key) || null;
      if (!equalAttrs$1(currentVal, val)) {
        // save negated attribute (set null if currentVal undefined)
        negatedAttributes.set(key, currentVal);
        const { left, right } = currPos;
        currPos.right = new Item(createID(ownClientId, getState(doc.store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, new ContentFormat(key, val));
        currPos.right.integrate(transaction, 0);
        currPos.forward();
      }
    }
    return negatedAttributes
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {ItemTextListPosition} currPos
   * @param {string|object|AbstractType<any>} text
   * @param {Object<string,any>} attributes
   *
   * @private
   * @function
   **/
  const insertText = (transaction, parent, currPos, text, attributes) => {
    currPos.currentAttributes.forEach((val, key) => {
      if (attributes[key] === undefined) {
        attributes[key] = null;
      }
    });
    const doc = transaction.doc;
    const ownClientId = doc.clientID;
    minimizeAttributeChanges(currPos, attributes);
    const negatedAttributes = insertAttributes(transaction, parent, currPos, attributes);
    // insert content
    const content = text.constructor === String ? new ContentString(/** @type {string} */ (text)) : (text instanceof AbstractType ? new ContentType(text) : new ContentEmbed(text));
    let { left, right, index } = currPos;
    if (parent._searchMarker) {
      updateMarkerChanges(parent._searchMarker, currPos.index, content.getLength());
    }
    right = new Item(createID(ownClientId, getState(doc.store, ownClientId)), left, left && left.lastId, right, right && right.id, parent, null, content);
    right.integrate(transaction, 0);
    currPos.right = right;
    currPos.index = index;
    currPos.forward();
    insertNegatedAttributes(transaction, parent, currPos, negatedAttributes);
  };

  /**
   * @param {Transaction} transaction
   * @param {AbstractType<any>} parent
   * @param {ItemTextListPosition} currPos
   * @param {number} length
   * @param {Object<string,any>} attributes
   *
   * @private
   * @function
   */
  const formatText = (transaction, parent, currPos, length, attributes) => {
    const doc = transaction.doc;
    const ownClientId = doc.clientID;
    minimizeAttributeChanges(currPos, attributes);
    const negatedAttributes = insertAttributes(transaction, parent, currPos, attributes);
    // iterate until first non-format or null is found
    // delete all formats with attributes[format.key] != null
    // also check the attributes after the first non-format as we do not want to insert redundant negated attributes there
    // eslint-disable-next-line no-labels
    iterationLoop: while (
      currPos.right !== null &&
      (length > 0 ||
        (
          negatedAttributes.size > 0 &&
          (currPos.right.deleted || currPos.right.content.constructor === ContentFormat)
        )
      )
    ) {
      if (!currPos.right.deleted) {
        switch (currPos.right.content.constructor) {
          case ContentFormat: {
            const { key, value } = /** @type {ContentFormat} */ (currPos.right.content);
            const attr = attributes[key];
            if (attr !== undefined) {
              if (equalAttrs$1(attr, value)) {
                negatedAttributes.delete(key);
              } else {
                if (length === 0) {
                  // no need to further extend negatedAttributes
                  // eslint-disable-next-line no-labels
                  break iterationLoop
                }
                negatedAttributes.set(key, value);
              }
              currPos.right.delete(transaction);
            } else {
              currPos.currentAttributes.set(key, value);
            }
            break
          }
          default:
            if (length < currPos.right.length) {
              getItemCleanStart(transaction, createID(currPos.right.id.client, currPos.right.id.clock + length));
            }
            length -= currPos.right.length;
            break
        }
      }
      currPos.forward();
    }
    // Quill just assumes that the editor starts with a newline and that it always
    // ends with a newline. We only insert that newline when a new newline is
    // inserted - i.e when length is bigger than type.length
    if (length > 0) {
      let newlines = '';
      for (; length > 0; length--) {
        newlines += '\n';
      }
      currPos.right = new Item(createID(ownClientId, getState(doc.store, ownClientId)), currPos.left, currPos.left && currPos.left.lastId, currPos.right, currPos.right && currPos.right.id, parent, null, new ContentString(newlines));
      currPos.right.integrate(transaction, 0);
      currPos.forward();
    }
    insertNegatedAttributes(transaction, parent, currPos, negatedAttributes);
  };

  /**
   * Call this function after string content has been deleted in order to
   * clean up formatting Items.
   *
   * @param {Transaction} transaction
   * @param {Item} start
   * @param {Item|null} curr exclusive end, automatically iterates to the next Content Item
   * @param {Map<string,any>} startAttributes
   * @param {Map<string,any>} currAttributes
   * @return {number} The amount of formatting Items deleted.
   *
   * @function
   */
  const cleanupFormattingGap = (transaction, start, curr, startAttributes, currAttributes) => {
    let end = curr;
    const endAttributes = copy$1(currAttributes);
    while (end && (!end.countable || end.deleted)) {
      if (!end.deleted && end.content.constructor === ContentFormat) {
        updateCurrentAttributes(endAttributes, /** @type {ContentFormat} */ (end.content));
      }
      end = end.right;
    }
    let cleanups = 0;
    let reachedEndOfCurr = false;
    while (start !== end) {
      if (curr === start) {
        reachedEndOfCurr = true;
      }
      if (!start.deleted) {
        const content = start.content;
        switch (content.constructor) {
          case ContentFormat: {
            const { key, value } = /** @type {ContentFormat} */ (content);
            if ((endAttributes.get(key) || null) !== value || (startAttributes.get(key) || null) === value) {
              // Either this format is overwritten or it is not necessary because the attribute already existed.
              start.delete(transaction);
              cleanups++;
              if (!reachedEndOfCurr && (currAttributes.get(key) || null) === value && (startAttributes.get(key) || null) !== value) {
                currAttributes.delete(key);
              }
            }
            break
          }
        }
      }
      start = /** @type {Item} */ (start.right);
    }
    return cleanups
  };

  /**
   * @param {Transaction} transaction
   * @param {Item | null} item
   */
  const cleanupContextlessFormattingGap = (transaction, item) => {
    // iterate until item.right is null or content
    while (item && item.right && (item.right.deleted || !item.right.countable)) {
      item = item.right;
    }
    const attrs = new Set();
    // iterate back until a content item is found
    while (item && (item.deleted || !item.countable)) {
      if (!item.deleted && item.content.constructor === ContentFormat) {
        const key = /** @type {ContentFormat} */ (item.content).key;
        if (attrs.has(key)) {
          item.delete(transaction);
        } else {
          attrs.add(key);
        }
      }
      item = item.left;
    }
  };

  /**
   * This function is experimental and subject to change / be removed.
   *
   * Ideally, we don't need this function at all. Formatting attributes should be cleaned up
   * automatically after each change. This function iterates twice over the complete YText type
   * and removes unnecessary formatting attributes. This is also helpful for testing.
   *
   * This function won't be exported anymore as soon as there is confidence that the YText type works as intended.
   *
   * @param {YText} type
   * @return {number} How many formatting attributes have been cleaned up.
   */
  const cleanupYTextFormatting = type => {
    let res = 0;
    transact(/** @type {Doc} */ (type.doc), transaction => {
      let start = /** @type {Item} */ (type._start);
      let end = type._start;
      let startAttributes = create$6();
      const currentAttributes = copy$1(startAttributes);
      while (end) {
        if (end.deleted === false) {
          switch (end.content.constructor) {
            case ContentFormat:
              updateCurrentAttributes(currentAttributes, /** @type {ContentFormat} */ (end.content));
              break
            default:
              res += cleanupFormattingGap(transaction, start, end, startAttributes, currentAttributes);
              startAttributes = copy$1(currentAttributes);
              start = end;
              break
          }
        }
        end = end.right;
      }
    });
    return res
  };

  /**
   * @param {Transaction} transaction
   * @param {ItemTextListPosition} currPos
   * @param {number} length
   * @return {ItemTextListPosition}
   *
   * @private
   * @function
   */
  const deleteText = (transaction, currPos, length) => {
    const startLength = length;
    const startAttrs = copy$1(currPos.currentAttributes);
    const start = currPos.right;
    while (length > 0 && currPos.right !== null) {
      if (currPos.right.deleted === false) {
        switch (currPos.right.content.constructor) {
          case ContentType:
          case ContentEmbed:
          case ContentString:
            if (length < currPos.right.length) {
              getItemCleanStart(transaction, createID(currPos.right.id.client, currPos.right.id.clock + length));
            }
            length -= currPos.right.length;
            currPos.right.delete(transaction);
            break
        }
      }
      currPos.forward();
    }
    if (start) {
      cleanupFormattingGap(transaction, start, currPos.right, startAttrs, currPos.currentAttributes);
    }
    const parent = /** @type {AbstractType<any>} */ (/** @type {Item} */ (currPos.left || currPos.right).parent);
    if (parent._searchMarker) {
      updateMarkerChanges(parent._searchMarker, currPos.index, -startLength + length);
    }
    return currPos
  };

  /**
   * The Quill Delta format represents changes on a text document with
   * formatting information. For mor information visit {@link https://quilljs.com/docs/delta/|Quill Delta}
   *
   * @example
   *   {
   *     ops: [
   *       { insert: 'Gandalf', attributes: { bold: true } },
   *       { insert: ' the ' },
   *       { insert: 'Grey', attributes: { color: '#cccccc' } }
   *     ]
   *   }
   *
   */

  /**
    * Attributes that can be assigned to a selection of text.
    *
    * @example
    *   {
    *     bold: true,
    *     font-size: '40px'
    *   }
    *
    * @typedef {Object} TextAttributes
    */

  /**
   * @extends YEvent<YText>
   * Event that describes the changes on a YText type.
   */
  class YTextEvent extends YEvent {
    /**
     * @param {YText} ytext
     * @param {Transaction} transaction
     * @param {Set<any>} subs The keys that changed
     */
    constructor (ytext, transaction, subs) {
      super(ytext, transaction);
      /**
       * Whether the children changed.
       * @type {Boolean}
       * @private
       */
      this.childListChanged = false;
      /**
       * Set of all changed attributes.
       * @type {Set<string>}
       */
      this.keysChanged = new Set();
      subs.forEach((sub) => {
        if (sub === null) {
          this.childListChanged = true;
        } else {
          this.keysChanged.add(sub);
        }
      });
    }

    /**
     * @type {{added:Set<Item>,deleted:Set<Item>,keys:Map<string,{action:'add'|'update'|'delete',oldValue:any}>,delta:Array<{insert?:Array<any>|string, delete?:number, retain?:number}>}}
     */
    get changes () {
      if (this._changes === null) {
        /**
         * @type {{added:Set<Item>,deleted:Set<Item>,keys:Map<string,{action:'add'|'update'|'delete',oldValue:any}>,delta:Array<{insert?:Array<any>|string|AbstractType<any>|object, delete?:number, retain?:number}>}}
         */
        const changes = {
          keys: this.keys,
          delta: this.delta,
          added: new Set(),
          deleted: new Set()
        };
        this._changes = changes;
      }
      return /** @type {any} */ (this._changes)
    }

    /**
     * Compute the changes in the delta format.
     * A {@link https://quilljs.com/docs/delta/|Quill Delta}) that represents the changes on the document.
     *
     * @type {Array<{insert?:string|object|AbstractType<any>, delete?:number, retain?:number, attributes?: Object<string,any>}>}
     *
     * @public
     */
    get delta () {
      if (this._delta === null) {
        const y = /** @type {Doc} */ (this.target.doc);
        /**
         * @type {Array<{insert?:string|object|AbstractType<any>, delete?:number, retain?:number, attributes?: Object<string,any>}>}
         */
        const delta = [];
        transact(y, transaction => {
          const currentAttributes = new Map(); // saves all current attributes for insert
          const oldAttributes = new Map();
          let item = this.target._start;
          /**
           * @type {string?}
           */
          let action = null;
          /**
           * @type {Object<string,any>}
           */
          const attributes = {}; // counts added or removed new attributes for retain
          /**
           * @type {string|object}
           */
          let insert = '';
          let retain = 0;
          let deleteLen = 0;
          const addOp = () => {
            if (action !== null) {
              /**
               * @type {any}
               */
              let op;
              switch (action) {
                case 'delete':
                  op = { delete: deleteLen };
                  deleteLen = 0;
                  break
                case 'insert':
                  op = { insert };
                  if (currentAttributes.size > 0) {
                    op.attributes = {};
                    currentAttributes.forEach((value, key) => {
                      if (value !== null) {
                        op.attributes[key] = value;
                      }
                    });
                  }
                  insert = '';
                  break
                case 'retain':
                  op = { retain };
                  if (Object.keys(attributes).length > 0) {
                    op.attributes = {};
                    for (const key in attributes) {
                      op.attributes[key] = attributes[key];
                    }
                  }
                  retain = 0;
                  break
              }
              delta.push(op);
              action = null;
            }
          };
          while (item !== null) {
            switch (item.content.constructor) {
              case ContentType:
              case ContentEmbed:
                if (this.adds(item)) {
                  if (!this.deletes(item)) {
                    addOp();
                    action = 'insert';
                    insert = item.content.getContent()[0];
                    addOp();
                  }
                } else if (this.deletes(item)) {
                  if (action !== 'delete') {
                    addOp();
                    action = 'delete';
                  }
                  deleteLen += 1;
                } else if (!item.deleted) {
                  if (action !== 'retain') {
                    addOp();
                    action = 'retain';
                  }
                  retain += 1;
                }
                break
              case ContentString:
                if (this.adds(item)) {
                  if (!this.deletes(item)) {
                    if (action !== 'insert') {
                      addOp();
                      action = 'insert';
                    }
                    insert += /** @type {ContentString} */ (item.content).str;
                  }
                } else if (this.deletes(item)) {
                  if (action !== 'delete') {
                    addOp();
                    action = 'delete';
                  }
                  deleteLen += item.length;
                } else if (!item.deleted) {
                  if (action !== 'retain') {
                    addOp();
                    action = 'retain';
                  }
                  retain += item.length;
                }
                break
              case ContentFormat: {
                const { key, value } = /** @type {ContentFormat} */ (item.content);
                if (this.adds(item)) {
                  if (!this.deletes(item)) {
                    const curVal = currentAttributes.get(key) || null;
                    if (!equalAttrs$1(curVal, value)) {
                      if (action === 'retain') {
                        addOp();
                      }
                      if (equalAttrs$1(value, (oldAttributes.get(key) || null))) {
                        delete attributes[key];
                      } else {
                        attributes[key] = value;
                      }
                    } else if (value !== null) {
                      item.delete(transaction);
                    }
                  }
                } else if (this.deletes(item)) {
                  oldAttributes.set(key, value);
                  const curVal = currentAttributes.get(key) || null;
                  if (!equalAttrs$1(curVal, value)) {
                    if (action === 'retain') {
                      addOp();
                    }
                    attributes[key] = curVal;
                  }
                } else if (!item.deleted) {
                  oldAttributes.set(key, value);
                  const attr = attributes[key];
                  if (attr !== undefined) {
                    if (!equalAttrs$1(attr, value)) {
                      if (action === 'retain') {
                        addOp();
                      }
                      if (value === null) {
                        delete attributes[key];
                      } else {
                        attributes[key] = value;
                      }
                    } else if (attr !== null) { // this will be cleaned up automatically by the contextless cleanup function
                      item.delete(transaction);
                    }
                  }
                }
                if (!item.deleted) {
                  if (action === 'insert') {
                    addOp();
                  }
                  updateCurrentAttributes(currentAttributes, /** @type {ContentFormat} */ (item.content));
                }
                break
              }
            }
            item = item.right;
          }
          addOp();
          while (delta.length > 0) {
            const lastOp = delta[delta.length - 1];
            if (lastOp.retain !== undefined && lastOp.attributes === undefined) {
              // retain delta's if they don't assign attributes
              delta.pop();
            } else {
              break
            }
          }
        });
        this._delta = delta;
      }
      return /** @type {any} */ (this._delta)
    }
  }

  /**
   * Type that represents text with formatting information.
   *
   * This type replaces y-richtext as this implementation is able to handle
   * block formats (format information on a paragraph), embeds (complex elements
   * like pictures and videos), and text formats (**bold**, *italic*).
   *
   * @extends AbstractType<YTextEvent>
   */
  class YText extends AbstractType {
    /**
     * @param {String} [string] The initial value of the YText.
     */
    constructor (string) {
      super();
      /**
       * Array of pending operations on this type
       * @type {Array<function():void>?}
       */
      this._pending = string !== undefined ? [() => this.insert(0, string)] : [];
      /**
       * @type {Array<ArraySearchMarker>}
       */
      this._searchMarker = [];
    }

    /**
     * Number of characters of this text type.
     *
     * @type {number}
     */
    get length () {
      return this._length
    }

    /**
     * @param {Doc} y
     * @param {Item} item
     */
    _integrate (y, item) {
      super._integrate(y, item);
      try {
        /** @type {Array<function>} */ (this._pending).forEach(f => f());
      } catch (e) {
        console.error(e);
      }
      this._pending = null;
    }

    _copy () {
      return new YText()
    }

    /**
     * @return {YText}
     */
    clone () {
      const text = new YText();
      text.applyDelta(this.toDelta());
      return text
    }

    /**
     * Creates YTextEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver (transaction, parentSubs) {
      super._callObserver(transaction, parentSubs);
      const event = new YTextEvent(this, transaction, parentSubs);
      const doc = transaction.doc;
      callTypeObservers(this, transaction, event);
      // If a remote change happened, we try to cleanup potential formatting duplicates.
      if (!transaction.local) {
        // check if another formatting item was inserted
        let foundFormattingItem = false;
        for (const [client, afterClock] of transaction.afterState.entries()) {
          const clock = transaction.beforeState.get(client) || 0;
          if (afterClock === clock) {
            continue
          }
          iterateStructs(transaction, /** @type {Array<Item|GC>} */ (doc.store.clients.get(client)), clock, afterClock, item => {
            if (!item.deleted && /** @type {Item} */ (item).content.constructor === ContentFormat) {
              foundFormattingItem = true;
            }
          });
          if (foundFormattingItem) {
            break
          }
        }
        if (!foundFormattingItem) {
          iterateDeletedStructs(transaction, transaction.deleteSet, item => {
            if (item instanceof GC || foundFormattingItem) {
              return
            }
            if (item.parent === this && item.content.constructor === ContentFormat) {
              foundFormattingItem = true;
            }
          });
        }
        transact(doc, (t) => {
          if (foundFormattingItem) {
            // If a formatting item was inserted, we simply clean the whole type.
            // We need to compute currentAttributes for the current position anyway.
            cleanupYTextFormatting(this);
          } else {
            // If no formatting attribute was inserted, we can make due with contextless
            // formatting cleanups.
            // Contextless: it is not necessary to compute currentAttributes for the affected position.
            iterateDeletedStructs(t, t.deleteSet, item => {
              if (item instanceof GC) {
                return
              }
              if (item.parent === this) {
                cleanupContextlessFormattingGap(t, item);
              }
            });
          }
        });
      }
    }

    /**
     * Returns the unformatted string representation of this YText type.
     *
     * @public
     */
    toString () {
      let str = '';
      /**
       * @type {Item|null}
       */
      let n = this._start;
      while (n !== null) {
        if (!n.deleted && n.countable && n.content.constructor === ContentString) {
          str += /** @type {ContentString} */ (n.content).str;
        }
        n = n.right;
      }
      return str
    }

    /**
     * Returns the unformatted string representation of this YText type.
     *
     * @return {string}
     * @public
     */
    toJSON () {
      return this.toString()
    }

    /**
     * Apply a {@link Delta} on this shared YText type.
     *
     * @param {any} delta The changes to apply on this element.
     * @param {object}  [opts]
     * @param {boolean} [opts.sanitize] Sanitize input delta. Removes ending newlines if set to true.
     *
     *
     * @public
     */
    applyDelta (delta, { sanitize = true } = {}) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          const currPos = new ItemTextListPosition(null, this._start, 0, new Map());
          for (let i = 0; i < delta.length; i++) {
            const op = delta[i];
            if (op.insert !== undefined) {
              // Quill assumes that the content starts with an empty paragraph.
              // Yjs/Y.Text assumes that it starts empty. We always hide that
              // there is a newline at the end of the content.
              // If we omit this step, clients will see a different number of
              // paragraphs, but nothing bad will happen.
              const ins = (!sanitize && typeof op.insert === 'string' && i === delta.length - 1 && currPos.right === null && op.insert.slice(-1) === '\n') ? op.insert.slice(0, -1) : op.insert;
              if (typeof ins !== 'string' || ins.length > 0) {
                insertText(transaction, this, currPos, ins, op.attributes || {});
              }
            } else if (op.retain !== undefined) {
              formatText(transaction, this, currPos, op.retain, op.attributes || {});
            } else if (op.delete !== undefined) {
              deleteText(transaction, currPos, op.delete);
            }
          }
        });
      } else {
        /** @type {Array<function>} */ (this._pending).push(() => this.applyDelta(delta));
      }
    }

    /**
     * Returns the Delta representation of this YText type.
     *
     * @param {Snapshot} [snapshot]
     * @param {Snapshot} [prevSnapshot]
     * @param {function('removed' | 'added', ID):any} [computeYChange]
     * @return {any} The Delta representation of this type.
     *
     * @public
     */
    toDelta (snapshot, prevSnapshot, computeYChange) {
      /**
       * @type{Array<any>}
       */
      const ops = [];
      const currentAttributes = new Map();
      const doc = /** @type {Doc} */ (this.doc);
      let str = '';
      let n = this._start;
      function packStr () {
        if (str.length > 0) {
          // pack str with attributes to ops
          /**
           * @type {Object<string,any>}
           */
          const attributes = {};
          let addAttributes = false;
          currentAttributes.forEach((value, key) => {
            addAttributes = true;
            attributes[key] = value;
          });
          /**
           * @type {Object<string,any>}
           */
          const op = { insert: str };
          if (addAttributes) {
            op.attributes = attributes;
          }
          ops.push(op);
          str = '';
        }
      }
      // snapshots are merged again after the transaction, so we need to keep the
      // transalive until we are done
      transact(doc, transaction => {
        if (snapshot) {
          splitSnapshotAffectedStructs(transaction, snapshot);
        }
        if (prevSnapshot) {
          splitSnapshotAffectedStructs(transaction, prevSnapshot);
        }
        while (n !== null) {
          if (isVisible$1(n, snapshot) || (prevSnapshot !== undefined && isVisible$1(n, prevSnapshot))) {
            switch (n.content.constructor) {
              case ContentString: {
                const cur = currentAttributes.get('ychange');
                if (snapshot !== undefined && !isVisible$1(n, snapshot)) {
                  if (cur === undefined || cur.user !== n.id.client || cur.state !== 'removed') {
                    packStr();
                    currentAttributes.set('ychange', computeYChange ? computeYChange('removed', n.id) : { type: 'removed' });
                  }
                } else if (prevSnapshot !== undefined && !isVisible$1(n, prevSnapshot)) {
                  if (cur === undefined || cur.user !== n.id.client || cur.state !== 'added') {
                    packStr();
                    currentAttributes.set('ychange', computeYChange ? computeYChange('added', n.id) : { type: 'added' });
                  }
                } else if (cur !== undefined) {
                  packStr();
                  currentAttributes.delete('ychange');
                }
                str += /** @type {ContentString} */ (n.content).str;
                break
              }
              case ContentType:
              case ContentEmbed: {
                packStr();
                /**
                 * @type {Object<string,any>}
                 */
                const op = {
                  insert: n.content.getContent()[0]
                };
                if (currentAttributes.size > 0) {
                  const attrs = /** @type {Object<string,any>} */ ({});
                  op.attributes = attrs;
                  currentAttributes.forEach((value, key) => {
                    attrs[key] = value;
                  });
                }
                ops.push(op);
                break
              }
              case ContentFormat:
                if (isVisible$1(n, snapshot)) {
                  packStr();
                  updateCurrentAttributes(currentAttributes, /** @type {ContentFormat} */ (n.content));
                }
                break
            }
          }
          n = n.right;
        }
        packStr();
      }, splitSnapshotAffectedStructs);
      return ops
    }

    /**
     * Insert text at a given index.
     *
     * @param {number} index The index at which to start inserting.
     * @param {String} text The text to insert at the specified position.
     * @param {TextAttributes} [attributes] Optionally define some formatting
     *                                    information to apply on the inserted
     *                                    Text.
     * @public
     */
    insert (index, text, attributes) {
      if (text.length <= 0) {
        return
      }
      const y = this.doc;
      if (y !== null) {
        transact(y, transaction => {
          const pos = findPosition(transaction, this, index);
          if (!attributes) {
            attributes = {};
            // @ts-ignore
            pos.currentAttributes.forEach((v, k) => { attributes[k] = v; });
          }
          insertText(transaction, this, pos, text, attributes);
        });
      } else {
        /** @type {Array<function>} */ (this._pending).push(() => this.insert(index, text, attributes));
      }
    }

    /**
     * Inserts an embed at a index.
     *
     * @param {number} index The index to insert the embed at.
     * @param {Object | AbstractType<any>} embed The Object that represents the embed.
     * @param {TextAttributes} attributes Attribute information to apply on the
     *                                    embed
     *
     * @public
     */
    insertEmbed (index, embed, attributes = {}) {
      const y = this.doc;
      if (y !== null) {
        transact(y, transaction => {
          const pos = findPosition(transaction, this, index);
          insertText(transaction, this, pos, embed, attributes);
        });
      } else {
        /** @type {Array<function>} */ (this._pending).push(() => this.insertEmbed(index, embed, attributes));
      }
    }

    /**
     * Deletes text starting from an index.
     *
     * @param {number} index Index at which to start deleting.
     * @param {number} length The number of characters to remove. Defaults to 1.
     *
     * @public
     */
    delete (index, length) {
      if (length === 0) {
        return
      }
      const y = this.doc;
      if (y !== null) {
        transact(y, transaction => {
          deleteText(transaction, findPosition(transaction, this, index), length);
        });
      } else {
        /** @type {Array<function>} */ (this._pending).push(() => this.delete(index, length));
      }
    }

    /**
     * Assigns properties to a range of text.
     *
     * @param {number} index The position where to start formatting.
     * @param {number} length The amount of characters to assign properties to.
     * @param {TextAttributes} attributes Attribute information to apply on the
     *                                    text.
     *
     * @public
     */
    format (index, length, attributes) {
      if (length === 0) {
        return
      }
      const y = this.doc;
      if (y !== null) {
        transact(y, transaction => {
          const pos = findPosition(transaction, this, index);
          if (pos.right === null) {
            return
          }
          formatText(transaction, this, pos, length, attributes);
        });
      } else {
        /** @type {Array<function>} */ (this._pending).push(() => this.format(index, length, attributes));
      }
    }

    /**
     * Removes an attribute.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @param {String} attributeName The attribute name that is to be removed.
     *
     * @public
     */
    removeAttribute (attributeName) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeMapDelete(transaction, this, attributeName);
        });
      } else {
        /** @type {Array<function>} */ (this._pending).push(() => this.removeAttribute(attributeName));
      }
    }

    /**
     * Sets or updates an attribute.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @param {String} attributeName The attribute name that is to be set.
     * @param {any} attributeValue The attribute value that is to be set.
     *
     * @public
     */
    setAttribute (attributeName, attributeValue) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeMapSet(transaction, this, attributeName, attributeValue);
        });
      } else {
        /** @type {Array<function>} */ (this._pending).push(() => this.setAttribute(attributeName, attributeValue));
      }
    }

    /**
     * Returns an attribute value that belongs to the attribute name.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @param {String} attributeName The attribute name that identifies the
     *                               queried value.
     * @return {any} The queried attribute value.
     *
     * @public
     */
    getAttribute (attributeName) {
      return /** @type {any} */ (typeMapGet(this, attributeName))
    }

    /**
     * Returns all attribute name/value pairs in a JSON Object.
     *
     * @note Xml-Text nodes don't have attributes. You can use this feature to assign properties to complete text-blocks.
     *
     * @param {Snapshot} [snapshot]
     * @return {Object<string, any>} A JSON Object that describes the attributes.
     *
     * @public
     */
    getAttributes (snapshot) {
      return typeMapGetAll(this)
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write (encoder) {
      encoder.writeTypeRef(YTextRefID);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {YText}
   *
   * @private
   * @function
   */
  const readYText = decoder => new YText();

  /**
   * @module YXml
   */

  /**
   * Define the elements to which a set of CSS queries apply.
   * {@link https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors|CSS_Selectors}
   *
   * @example
   *   query = '.classSelector'
   *   query = 'nodeSelector'
   *   query = '#idSelector'
   *
   * @typedef {string} CSS_Selector
   */

  /**
   * Dom filter function.
   *
   * @callback domFilter
   * @param {string} nodeName The nodeName of the element
   * @param {Map} attributes The map of attributes.
   * @return {boolean} Whether to include the Dom node in the YXmlElement.
   */

  /**
   * Represents a subset of the nodes of a YXmlElement / YXmlFragment and a
   * position within them.
   *
   * Can be created with {@link YXmlFragment#createTreeWalker}
   *
   * @public
   * @implements {Iterable<YXmlElement|YXmlText|YXmlElement|YXmlHook>}
   */
  class YXmlTreeWalker {
    /**
     * @param {YXmlFragment | YXmlElement} root
     * @param {function(AbstractType<any>):boolean} [f]
     */
    constructor (root, f = () => true) {
      this._filter = f;
      this._root = root;
      /**
       * @type {Item}
       */
      this._currentNode = /** @type {Item} */ (root._start);
      this._firstCall = true;
    }

    [Symbol.iterator] () {
      return this
    }

    /**
     * Get the next node.
     *
     * @return {IteratorResult<YXmlElement|YXmlText|YXmlHook>} The next node.
     *
     * @public
     */
    next () {
      /**
       * @type {Item|null}
       */
      let n = this._currentNode;
      let type = n && n.content && /** @type {any} */ (n.content).type;
      if (n !== null && (!this._firstCall || n.deleted || !this._filter(type))) { // if first call, we check if we can use the first item
        do {
          type = /** @type {any} */ (n.content).type;
          if (!n.deleted && (type.constructor === YXmlElement || type.constructor === YXmlFragment) && type._start !== null) {
            // walk down in the tree
            n = type._start;
          } else {
            // walk right or up in the tree
            while (n !== null) {
              if (n.right !== null) {
                n = n.right;
                break
              } else if (n.parent === this._root) {
                n = null;
              } else {
                n = /** @type {AbstractType<any>} */ (n.parent)._item;
              }
            }
          }
        } while (n !== null && (n.deleted || !this._filter(/** @type {ContentType} */ (n.content).type)))
      }
      this._firstCall = false;
      if (n === null) {
        // @ts-ignore
        return { value: undefined, done: true }
      }
      this._currentNode = n;
      return { value: /** @type {any} */ (n.content).type, done: false }
    }
  }

  /**
   * Represents a list of {@link YXmlElement}.and {@link YXmlText} types.
   * A YxmlFragment is similar to a {@link YXmlElement}, but it does not have a
   * nodeName and it does not have attributes. Though it can be bound to a DOM
   * element - in this case the attributes and the nodeName are not shared.
   *
   * @public
   * @extends AbstractType<YXmlEvent>
   */
  class YXmlFragment extends AbstractType {
    constructor () {
      super();
      /**
       * @type {Array<any>|null}
       */
      this._prelimContent = [];
    }

    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get firstChild () {
      const first = this._first;
      return first ? first.content.getContent()[0] : null
    }

    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate (y, item) {
      super._integrate(y, item);
      this.insert(0, /** @type {Array<any>} */ (this._prelimContent));
      this._prelimContent = null;
    }

    _copy () {
      return new YXmlFragment()
    }

    /**
     * @return {YXmlFragment}
     */
    clone () {
      const el = new YXmlFragment();
      // @ts-ignore
      el.insert(0, this.toArray().map(item => item instanceof AbstractType ? item.clone() : item));
      return el
    }

    get length () {
      return this._prelimContent === null ? this._length : this._prelimContent.length
    }

    /**
     * Create a subtree of childNodes.
     *
     * @example
     * const walker = elem.createTreeWalker(dom => dom.nodeName === 'div')
     * for (let node in walker) {
     *   // `node` is a div node
     *   nop(node)
     * }
     *
     * @param {function(AbstractType<any>):boolean} filter Function that is called on each child element and
     *                          returns a Boolean indicating whether the child
     *                          is to be included in the subtree.
     * @return {YXmlTreeWalker} A subtree and a position within it.
     *
     * @public
     */
    createTreeWalker (filter) {
      return new YXmlTreeWalker(this, filter)
    }

    /**
     * Returns the first YXmlElement that matches the query.
     * Similar to DOM's {@link querySelector}.
     *
     * Query support:
     *   - tagname
     * TODO:
     *   - id
     *   - attribute
     *
     * @param {CSS_Selector} query The query on the children.
     * @return {YXmlElement|YXmlText|YXmlHook|null} The first element that matches the query or null.
     *
     * @public
     */
    querySelector (query) {
      query = query.toUpperCase();
      // @ts-ignore
      const iterator = new YXmlTreeWalker(this, element => element.nodeName && element.nodeName.toUpperCase() === query);
      const next = iterator.next();
      if (next.done) {
        return null
      } else {
        return next.value
      }
    }

    /**
     * Returns all YXmlElements that match the query.
     * Similar to Dom's {@link querySelectorAll}.
     *
     * @todo Does not yet support all queries. Currently only query by tagName.
     *
     * @param {CSS_Selector} query The query on the children
     * @return {Array<YXmlElement|YXmlText|YXmlHook|null>} The elements that match this query.
     *
     * @public
     */
    querySelectorAll (query) {
      query = query.toUpperCase();
      // @ts-ignore
      return Array.from(new YXmlTreeWalker(this, element => element.nodeName && element.nodeName.toUpperCase() === query))
    }

    /**
     * Creates YXmlEvent and calls observers.
     *
     * @param {Transaction} transaction
     * @param {Set<null|string>} parentSubs Keys changed on this type. `null` if list was modified.
     */
    _callObserver (transaction, parentSubs) {
      callTypeObservers(this, transaction, new YXmlEvent(this, parentSubs, transaction));
    }

    /**
     * Get the string representation of all the children of this YXmlFragment.
     *
     * @return {string} The string representation of all children.
     */
    toString () {
      return typeListMap(this, xml => xml.toString()).join('')
    }

    /**
     * @return {string}
     */
    toJSON () {
      return this.toString()
    }

    /**
     * Creates a Dom Element that mirrors this YXmlElement.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object<string, any>} [hooks={}] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type.
     * @return {Node} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM (_document = document, hooks = {}, binding) {
      const fragment = _document.createDocumentFragment();
      if (binding !== undefined) {
        binding._createAssociation(fragment, this);
      }
      typeListForEach(this, xmlType => {
        fragment.insertBefore(xmlType.toDOM(_document, hooks, binding), null);
      });
      return fragment
    }

    /**
     * Inserts new content at an index.
     *
     * @example
     *  // Insert character 'a' at position 0
     *  xml.insert(0, [new Y.XmlText('text')])
     *
     * @param {number} index The index to insert content at
     * @param {Array<YXmlElement|YXmlText>} content The array of content
     */
    insert (index, content) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeListInsertGenerics(transaction, this, index, content);
        });
      } else {
        // @ts-ignore _prelimContent is defined because this is not yet integrated
        this._prelimContent.splice(index, 0, ...content);
      }
    }

    /**
     * Inserts new content at an index.
     *
     * @example
     *  // Insert character 'a' at position 0
     *  xml.insert(0, [new Y.XmlText('text')])
     *
     * @param {null|Item|YXmlElement|YXmlText} ref The index to insert content at
     * @param {Array<YXmlElement|YXmlText>} content The array of content
     */
    insertAfter (ref, content) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          const refItem = (ref && ref instanceof AbstractType) ? ref._item : ref;
          typeListInsertGenericsAfter(transaction, this, refItem, content);
        });
      } else {
        const pc = /** @type {Array<any>} */ (this._prelimContent);
        const index = ref === null ? 0 : pc.findIndex(el => el === ref) + 1;
        if (index === 0 && ref !== null) {
          throw create('Reference item not found')
        }
        pc.splice(index, 0, ...content);
      }
    }

    /**
     * Deletes elements starting from an index.
     *
     * @param {number} index Index at which to start deleting elements
     * @param {number} [length=1] The number of elements to remove. Defaults to 1.
     */
    delete (index, length = 1) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeListDelete(transaction, this, index, length);
        });
      } else {
        // @ts-ignore _prelimContent is defined because this is not yet integrated
        this._prelimContent.splice(index, length);
      }
    }

    /**
     * Transforms this YArray to a JavaScript Array.
     *
     * @return {Array<YXmlElement|YXmlText|YXmlHook>}
     */
    toArray () {
      return typeListToArray(this)
    }

    /**
     * Appends content to this YArray.
     *
     * @param {Array<YXmlElement|YXmlText>} content Array of content to append.
     */
    push (content) {
      this.insert(this.length, content);
    }

    /**
     * Preppends content to this YArray.
     *
     * @param {Array<YXmlElement|YXmlText>} content Array of content to preppend.
     */
    unshift (content) {
      this.insert(0, content);
    }

    /**
     * Returns the i-th element from a YArray.
     *
     * @param {number} index The index of the element to return from the YArray
     * @return {YXmlElement|YXmlText}
     */
    get (index) {
      return typeListGet(this, index)
    }

    /**
     * Transforms this YArray to a JavaScript Array.
     *
     * @param {number} [start]
     * @param {number} [end]
     * @return {Array<YXmlElement|YXmlText>}
     */
    slice (start = 0, end = this.length) {
      return typeListSlice(this, start, end)
    }

    /**
     * Executes a provided function on once on overy child element.
     *
     * @param {function(YXmlElement|YXmlText,number, typeof this):void} f A function to execute on every element of this YArray.
     */
    forEach (f) {
      typeListForEach(this, f);
    }

    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     */
    _write (encoder) {
      encoder.writeTypeRef(YXmlFragmentRefID);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {YXmlFragment}
   *
   * @private
   * @function
   */
  const readYXmlFragment = decoder => new YXmlFragment();

  /**
   * An YXmlElement imitates the behavior of a
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}.
   *
   * * An YXmlElement has attributes (key value pairs)
   * * An YXmlElement has childElements that must inherit from YXmlElement
   */
  class YXmlElement extends YXmlFragment {
    constructor (nodeName = 'UNDEFINED') {
      super();
      this.nodeName = nodeName;
      /**
       * @type {Map<string, any>|null}
       */
      this._prelimAttrs = new Map();
    }

    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get nextSibling () {
      const n = this._item ? this._item.next : null;
      return n ? /** @type {YXmlElement|YXmlText} */ (/** @type {ContentType} */ (n.content).type) : null
    }

    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get prevSibling () {
      const n = this._item ? this._item.prev : null;
      return n ? /** @type {YXmlElement|YXmlText} */ (/** @type {ContentType} */ (n.content).type) : null
    }

    /**
     * Integrate this type into the Yjs instance.
     *
     * * Save this struct in the os
     * * This type is sent to other client
     * * Observer functions are fired
     *
     * @param {Doc} y The Yjs instance
     * @param {Item} item
     */
    _integrate (y, item) {
      super._integrate(y, item)
      ;(/** @type {Map<string, any>} */ (this._prelimAttrs)).forEach((value, key) => {
        this.setAttribute(key, value);
      });
      this._prelimAttrs = null;
    }

    /**
     * Creates an Item with the same effect as this Item (without position effect)
     *
     * @return {YXmlElement}
     */
    _copy () {
      return new YXmlElement(this.nodeName)
    }

    /**
     * @return {YXmlElement}
     */
    clone () {
      const el = new YXmlElement(this.nodeName);
      const attrs = this.getAttributes();
      for (const key in attrs) {
        el.setAttribute(key, attrs[key]);
      }
      // @ts-ignore
      el.insert(0, this.toArray().map(item => item instanceof AbstractType ? item.clone() : item));
      return el
    }

    /**
     * Returns the XML serialization of this YXmlElement.
     * The attributes are ordered by attribute-name, so you can easily use this
     * method to compare YXmlElements
     *
     * @return {string} The string representation of this type.
     *
     * @public
     */
    toString () {
      const attrs = this.getAttributes();
      const stringBuilder = [];
      const keys = [];
      for (const key in attrs) {
        keys.push(key);
      }
      keys.sort();
      const keysLen = keys.length;
      for (let i = 0; i < keysLen; i++) {
        const key = keys[i];
        stringBuilder.push(key + '="' + attrs[key] + '"');
      }
      const nodeName = this.nodeName.toLocaleLowerCase();
      const attrsString = stringBuilder.length > 0 ? ' ' + stringBuilder.join(' ') : '';
      return `<${nodeName}${attrsString}>${super.toString()}</${nodeName}>`
    }

    /**
     * Removes an attribute from this YXmlElement.
     *
     * @param {String} attributeName The attribute name that is to be removed.
     *
     * @public
     */
    removeAttribute (attributeName) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeMapDelete(transaction, this, attributeName);
        });
      } else {
        /** @type {Map<string,any>} */ (this._prelimAttrs).delete(attributeName);
      }
    }

    /**
     * Sets or updates an attribute.
     *
     * @param {String} attributeName The attribute name that is to be set.
     * @param {String} attributeValue The attribute value that is to be set.
     *
     * @public
     */
    setAttribute (attributeName, attributeValue) {
      if (this.doc !== null) {
        transact(this.doc, transaction => {
          typeMapSet(transaction, this, attributeName, attributeValue);
        });
      } else {
        /** @type {Map<string, any>} */ (this._prelimAttrs).set(attributeName, attributeValue);
      }
    }

    /**
     * Returns an attribute value that belongs to the attribute name.
     *
     * @param {String} attributeName The attribute name that identifies the
     *                               queried value.
     * @return {String} The queried attribute value.
     *
     * @public
     */
    getAttribute (attributeName) {
      return /** @type {any} */ (typeMapGet(this, attributeName))
    }

    /**
     * Returns whether an attribute exists
     *
     * @param {String} attributeName The attribute name to check for existence.
     * @return {boolean} whether the attribute exists.
     *
     * @public
     */
    hasAttribute (attributeName) {
      return /** @type {any} */ (typeMapHas(this, attributeName))
    }

    /**
     * Returns all attribute name/value pairs in a JSON Object.
     *
     * @param {Snapshot} [snapshot]
     * @return {Object<string, any>} A JSON Object that describes the attributes.
     *
     * @public
     */
    getAttributes (snapshot) {
      return typeMapGetAll(this)
    }

    /**
     * Creates a Dom Element that mirrors this YXmlElement.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object<string, any>} [hooks={}] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type.
     * @return {Node} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM (_document = document, hooks = {}, binding) {
      const dom = _document.createElement(this.nodeName);
      const attrs = this.getAttributes();
      for (const key in attrs) {
        dom.setAttribute(key, attrs[key]);
      }
      typeListForEach(this, yxml => {
        dom.appendChild(yxml.toDOM(_document, hooks, binding));
      });
      if (binding !== undefined) {
        binding._createAssociation(dom, this);
      }
      return dom
    }

    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     */
    _write (encoder) {
      encoder.writeTypeRef(YXmlElementRefID);
      encoder.writeKey(this.nodeName);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {YXmlElement}
   *
   * @function
   */
  const readYXmlElement = decoder => new YXmlElement(decoder.readKey());

  /**
   * @extends YEvent<YXmlElement|YXmlText|YXmlFragment>
   * An Event that describes changes on a YXml Element or Yxml Fragment
   */
  class YXmlEvent extends YEvent {
    /**
     * @param {YXmlElement|YXmlText|YXmlFragment} target The target on which the event is created.
     * @param {Set<string|null>} subs The set of changed attributes. `null` is included if the
     *                   child list changed.
     * @param {Transaction} transaction The transaction instance with wich the
     *                                  change was created.
     */
    constructor (target, subs, transaction) {
      super(target, transaction);
      /**
       * Whether the children changed.
       * @type {Boolean}
       * @private
       */
      this.childListChanged = false;
      /**
       * Set of all changed attributes.
       * @type {Set<string>}
       */
      this.attributesChanged = new Set();
      subs.forEach((sub) => {
        if (sub === null) {
          this.childListChanged = true;
        } else {
          this.attributesChanged.add(sub);
        }
      });
    }
  }

  /**
   * You can manage binding to a custom type with YXmlHook.
   *
   * @extends {YMap<any>}
   */
  class YXmlHook extends YMap {
    /**
     * @param {string} hookName nodeName of the Dom Node.
     */
    constructor (hookName) {
      super();
      /**
       * @type {string}
       */
      this.hookName = hookName;
    }

    /**
     * Creates an Item with the same effect as this Item (without position effect)
     */
    _copy () {
      return new YXmlHook(this.hookName)
    }

    /**
     * @return {YXmlHook}
     */
    clone () {
      const el = new YXmlHook(this.hookName);
      this.forEach((value, key) => {
        el.set(key, value);
      });
      return el
    }

    /**
     * Creates a Dom Element that mirrors this YXmlElement.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object.<string, any>} [hooks] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type
     * @return {Element} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM (_document = document, hooks = {}, binding) {
      const hook = hooks[this.hookName];
      let dom;
      if (hook !== undefined) {
        dom = hook.createDom(this);
      } else {
        dom = document.createElement(this.hookName);
      }
      dom.setAttribute('data-yjs-hook', this.hookName);
      if (binding !== undefined) {
        binding._createAssociation(dom, this);
      }
      return dom
    }

    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     */
    _write (encoder) {
      encoder.writeTypeRef(YXmlHookRefID);
      encoder.writeKey(this.hookName);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {YXmlHook}
   *
   * @private
   * @function
   */
  const readYXmlHook = decoder =>
    new YXmlHook(decoder.readKey());

  /**
   * Represents text in a Dom Element. In the future this type will also handle
   * simple formatting information like bold and italic.
   */
  class YXmlText extends YText {
    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get nextSibling () {
      const n = this._item ? this._item.next : null;
      return n ? /** @type {YXmlElement|YXmlText} */ (/** @type {ContentType} */ (n.content).type) : null
    }

    /**
     * @type {YXmlElement|YXmlText|null}
     */
    get prevSibling () {
      const n = this._item ? this._item.prev : null;
      return n ? /** @type {YXmlElement|YXmlText} */ (/** @type {ContentType} */ (n.content).type) : null
    }

    _copy () {
      return new YXmlText()
    }

    /**
     * @return {YXmlText}
     */
    clone () {
      const text = new YXmlText();
      text.applyDelta(this.toDelta());
      return text
    }

    /**
     * Creates a Dom Element that mirrors this YXmlText.
     *
     * @param {Document} [_document=document] The document object (you must define
     *                                        this when calling this method in
     *                                        nodejs)
     * @param {Object<string, any>} [hooks] Optional property to customize how hooks
     *                                             are presented in the DOM
     * @param {any} [binding] You should not set this property. This is
     *                               used if DomBinding wants to create a
     *                               association to the created DOM type.
     * @return {Text} The {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Dom Element}
     *
     * @public
     */
    toDOM (_document = document, hooks, binding) {
      const dom = _document.createTextNode(this.toString());
      if (binding !== undefined) {
        binding._createAssociation(dom, this);
      }
      return dom
    }

    toString () {
      // @ts-ignore
      return this.toDelta().map(delta => {
        const nestedNodes = [];
        for (const nodeName in delta.attributes) {
          const attrs = [];
          for (const key in delta.attributes[nodeName]) {
            attrs.push({ key, value: delta.attributes[nodeName][key] });
          }
          // sort attributes to get a unique order
          attrs.sort((a, b) => a.key < b.key ? -1 : 1);
          nestedNodes.push({ nodeName, attrs });
        }
        // sort node order to get a unique order
        nestedNodes.sort((a, b) => a.nodeName < b.nodeName ? -1 : 1);
        // now convert to dom string
        let str = '';
        for (let i = 0; i < nestedNodes.length; i++) {
          const node = nestedNodes[i];
          str += `<${node.nodeName}`;
          for (let j = 0; j < node.attrs.length; j++) {
            const attr = node.attrs[j];
            str += ` ${attr.key}="${attr.value}"`;
          }
          str += '>';
        }
        str += delta.insert;
        for (let i = nestedNodes.length - 1; i >= 0; i--) {
          str += `</${nestedNodes[i].nodeName}>`;
        }
        return str
      }).join('')
    }

    /**
     * @return {string}
     */
    toJSON () {
      return this.toString()
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     */
    _write (encoder) {
      encoder.writeTypeRef(YXmlTextRefID);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {YXmlText}
   *
   * @private
   * @function
   */
  const readYXmlText = decoder => new YXmlText();

  class AbstractStruct {
    /**
     * @param {ID} id
     * @param {number} length
     */
    constructor (id, length) {
      this.id = id;
      this.length = length;
    }

    /**
     * @type {boolean}
     */
    get deleted () {
      throw methodUnimplemented()
    }

    /**
     * Merge this struct with the item to the right.
     * This method is already assuming that `this.id.clock + this.length === this.id.clock`.
     * Also this method does *not* remove right from StructStore!
     * @param {AbstractStruct} right
     * @return {boolean} wether this merged with right
     */
    mergeWith (right) {
      return false
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     * @param {number} offset
     * @param {number} encodingRef
     */
    write (encoder, offset, encodingRef) {
      throw methodUnimplemented()
    }

    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate (transaction, offset) {
      throw methodUnimplemented()
    }
  }

  const structGCRefNumber = 0;

  /**
   * @private
   */
  class GC extends AbstractStruct {
    get deleted () {
      return true
    }

    delete () {}

    /**
     * @param {GC} right
     * @return {boolean}
     */
    mergeWith (right) {
      if (this.constructor !== right.constructor) {
        return false
      }
      this.length += right.length;
      return true
    }

    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate (transaction, offset) {
      if (offset > 0) {
        this.id.clock += offset;
        this.length -= offset;
      }
      addStruct(transaction.doc.store, this);
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeInfo(structGCRefNumber);
      encoder.writeLen(this.length - offset);
    }

    /**
     * @param {Transaction} transaction
     * @param {StructStore} store
     * @return {null | number}
     */
    getMissing (transaction, store) {
      return null
    }
  }

  class ContentBinary {
    /**
     * @param {Uint8Array} content
     */
    constructor (content) {
      this.content = content;
    }

    /**
     * @return {number}
     */
    getLength () {
      return 1
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return [this.content]
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return true
    }

    /**
     * @return {ContentBinary}
     */
    copy () {
      return new ContentBinary(this.content)
    }

    /**
     * @param {number} offset
     * @return {ContentBinary}
     */
    splice (offset) {
      throw methodUnimplemented()
    }

    /**
     * @param {ContentBinary} right
     * @return {boolean}
     */
    mergeWith (right) {
      return false
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {}
    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {}
    /**
     * @param {StructStore} store
     */
    gc (store) {}
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeBuf(this.content);
    }

    /**
     * @return {number}
     */
    getRef () {
      return 3
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2 } decoder
   * @return {ContentBinary}
   */
  const readContentBinary = decoder => new ContentBinary(decoder.readBuf());

  class ContentDeleted {
    /**
     * @param {number} len
     */
    constructor (len) {
      this.len = len;
    }

    /**
     * @return {number}
     */
    getLength () {
      return this.len
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return []
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return false
    }

    /**
     * @return {ContentDeleted}
     */
    copy () {
      return new ContentDeleted(this.len)
    }

    /**
     * @param {number} offset
     * @return {ContentDeleted}
     */
    splice (offset) {
      const right = new ContentDeleted(this.len - offset);
      this.len = offset;
      return right
    }

    /**
     * @param {ContentDeleted} right
     * @return {boolean}
     */
    mergeWith (right) {
      this.len += right.len;
      return true
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {
      addToDeleteSet(transaction.deleteSet, item.id.client, item.id.clock, this.len);
      item.markDeleted();
    }

    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {}
    /**
     * @param {StructStore} store
     */
    gc (store) {}
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeLen(this.len - offset);
    }

    /**
     * @return {number}
     */
    getRef () {
      return 1
    }
  }

  /**
   * @private
   *
   * @param {UpdateDecoderV1 | UpdateDecoderV2 } decoder
   * @return {ContentDeleted}
   */
  const readContentDeleted = decoder => new ContentDeleted(decoder.readLen());

  /**
   * @param {string} guid
   * @param {Object<string, any>} opts
   */
  const createDocFromOpts = (guid, opts) => new Doc({ guid, ...opts, shouldLoad: opts.shouldLoad || opts.autoLoad || false });

  /**
   * @private
   */
  class ContentDoc {
    /**
     * @param {Doc} doc
     */
    constructor (doc) {
      if (doc._item) {
        console.error('This document was already integrated as a sub-document. You should create a second instance instead with the same guid.');
      }
      /**
       * @type {Doc}
       */
      this.doc = doc;
      /**
       * @type {any}
       */
      const opts = {};
      this.opts = opts;
      if (!doc.gc) {
        opts.gc = false;
      }
      if (doc.autoLoad) {
        opts.autoLoad = true;
      }
      if (doc.meta !== null) {
        opts.meta = doc.meta;
      }
    }

    /**
     * @return {number}
     */
    getLength () {
      return 1
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return [this.doc]
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return true
    }

    /**
     * @return {ContentDoc}
     */
    copy () {
      return new ContentDoc(createDocFromOpts(this.doc.guid, this.opts))
    }

    /**
     * @param {number} offset
     * @return {ContentDoc}
     */
    splice (offset) {
      throw methodUnimplemented()
    }

    /**
     * @param {ContentDoc} right
     * @return {boolean}
     */
    mergeWith (right) {
      return false
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {
      // this needs to be reflected in doc.destroy as well
      this.doc._item = item;
      transaction.subdocsAdded.add(this.doc);
      if (this.doc.shouldLoad) {
        transaction.subdocsLoaded.add(this.doc);
      }
    }

    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {
      if (transaction.subdocsAdded.has(this.doc)) {
        transaction.subdocsAdded.delete(this.doc);
      } else {
        transaction.subdocsRemoved.add(this.doc);
      }
    }

    /**
     * @param {StructStore} store
     */
    gc (store) { }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeString(this.doc.guid);
      encoder.writeAny(this.opts);
    }

    /**
     * @return {number}
     */
    getRef () {
      return 9
    }
  }

  /**
   * @private
   *
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {ContentDoc}
   */
  const readContentDoc = decoder => new ContentDoc(createDocFromOpts(decoder.readString(), decoder.readAny()));

  /**
   * @private
   */
  class ContentEmbed {
    /**
     * @param {Object} embed
     */
    constructor (embed) {
      this.embed = embed;
    }

    /**
     * @return {number}
     */
    getLength () {
      return 1
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return [this.embed]
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return true
    }

    /**
     * @return {ContentEmbed}
     */
    copy () {
      return new ContentEmbed(this.embed)
    }

    /**
     * @param {number} offset
     * @return {ContentEmbed}
     */
    splice (offset) {
      throw methodUnimplemented()
    }

    /**
     * @param {ContentEmbed} right
     * @return {boolean}
     */
    mergeWith (right) {
      return false
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {}
    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {}
    /**
     * @param {StructStore} store
     */
    gc (store) {}
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeJSON(this.embed);
    }

    /**
     * @return {number}
     */
    getRef () {
      return 5
    }
  }

  /**
   * @private
   *
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {ContentEmbed}
   */
  const readContentEmbed = decoder => new ContentEmbed(decoder.readJSON());

  /**
   * @private
   */
  class ContentFormat {
    /**
     * @param {string} key
     * @param {Object} value
     */
    constructor (key, value) {
      this.key = key;
      this.value = value;
    }

    /**
     * @return {number}
     */
    getLength () {
      return 1
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return []
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return false
    }

    /**
     * @return {ContentFormat}
     */
    copy () {
      return new ContentFormat(this.key, this.value)
    }

    /**
     * @param {number} offset
     * @return {ContentFormat}
     */
    splice (offset) {
      throw methodUnimplemented()
    }

    /**
     * @param {ContentFormat} right
     * @return {boolean}
     */
    mergeWith (right) {
      return false
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {
      // @todo searchmarker are currently unsupported for rich text documents
      /** @type {AbstractType<any>} */ (item.parent)._searchMarker = null;
    }

    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {}
    /**
     * @param {StructStore} store
     */
    gc (store) {}
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeKey(this.key);
      encoder.writeJSON(this.value);
    }

    /**
     * @return {number}
     */
    getRef () {
      return 6
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {ContentFormat}
   */
  const readContentFormat = decoder => new ContentFormat(decoder.readKey(), decoder.readJSON());

  /**
   * @private
   */
  class ContentJSON {
    /**
     * @param {Array<any>} arr
     */
    constructor (arr) {
      /**
       * @type {Array<any>}
       */
      this.arr = arr;
    }

    /**
     * @return {number}
     */
    getLength () {
      return this.arr.length
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return this.arr
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return true
    }

    /**
     * @return {ContentJSON}
     */
    copy () {
      return new ContentJSON(this.arr)
    }

    /**
     * @param {number} offset
     * @return {ContentJSON}
     */
    splice (offset) {
      const right = new ContentJSON(this.arr.slice(offset));
      this.arr = this.arr.slice(0, offset);
      return right
    }

    /**
     * @param {ContentJSON} right
     * @return {boolean}
     */
    mergeWith (right) {
      this.arr = this.arr.concat(right.arr);
      return true
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {}
    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {}
    /**
     * @param {StructStore} store
     */
    gc (store) {}
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      const len = this.arr.length;
      encoder.writeLen(len - offset);
      for (let i = offset; i < len; i++) {
        const c = this.arr[i];
        encoder.writeString(c === undefined ? 'undefined' : JSON.stringify(c));
      }
    }

    /**
     * @return {number}
     */
    getRef () {
      return 2
    }
  }

  /**
   * @private
   *
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {ContentJSON}
   */
  const readContentJSON = decoder => {
    const len = decoder.readLen();
    const cs = [];
    for (let i = 0; i < len; i++) {
      const c = decoder.readString();
      if (c === 'undefined') {
        cs.push(undefined);
      } else {
        cs.push(JSON.parse(c));
      }
    }
    return new ContentJSON(cs)
  };

  class ContentAny {
    /**
     * @param {Array<any>} arr
     */
    constructor (arr) {
      /**
       * @type {Array<any>}
       */
      this.arr = arr;
    }

    /**
     * @return {number}
     */
    getLength () {
      return this.arr.length
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return this.arr
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return true
    }

    /**
     * @return {ContentAny}
     */
    copy () {
      return new ContentAny(this.arr)
    }

    /**
     * @param {number} offset
     * @return {ContentAny}
     */
    splice (offset) {
      const right = new ContentAny(this.arr.slice(offset));
      this.arr = this.arr.slice(0, offset);
      return right
    }

    /**
     * @param {ContentAny} right
     * @return {boolean}
     */
    mergeWith (right) {
      this.arr = this.arr.concat(right.arr);
      return true
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {}
    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {}
    /**
     * @param {StructStore} store
     */
    gc (store) {}
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      const len = this.arr.length;
      encoder.writeLen(len - offset);
      for (let i = offset; i < len; i++) {
        const c = this.arr[i];
        encoder.writeAny(c);
      }
    }

    /**
     * @return {number}
     */
    getRef () {
      return 8
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {ContentAny}
   */
  const readContentAny = decoder => {
    const len = decoder.readLen();
    const cs = [];
    for (let i = 0; i < len; i++) {
      cs.push(decoder.readAny());
    }
    return new ContentAny(cs)
  };

  /**
   * @private
   */
  class ContentString {
    /**
     * @param {string} str
     */
    constructor (str) {
      /**
       * @type {string}
       */
      this.str = str;
    }

    /**
     * @return {number}
     */
    getLength () {
      return this.str.length
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return this.str.split('')
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return true
    }

    /**
     * @return {ContentString}
     */
    copy () {
      return new ContentString(this.str)
    }

    /**
     * @param {number} offset
     * @return {ContentString}
     */
    splice (offset) {
      const right = new ContentString(this.str.slice(offset));
      this.str = this.str.slice(0, offset);

      // Prevent encoding invalid documents because of splitting of surrogate pairs: https://github.com/yjs/yjs/issues/248
      const firstCharCode = this.str.charCodeAt(offset - 1);
      if (firstCharCode >= 0xD800 && firstCharCode <= 0xDBFF) {
        // Last character of the left split is the start of a surrogate utf16/ucs2 pair.
        // We don't support splitting of surrogate pairs because this may lead to invalid documents.
        // Replace the invalid character with a unicode replacement character (� / U+FFFD)
        this.str = this.str.slice(0, offset - 1) + '�';
        // replace right as well
        right.str = '�' + right.str.slice(1);
      }
      return right
    }

    /**
     * @param {ContentString} right
     * @return {boolean}
     */
    mergeWith (right) {
      this.str += right.str;
      return true
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {}
    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {}
    /**
     * @param {StructStore} store
     */
    gc (store) {}
    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeString(offset === 0 ? this.str : this.str.slice(offset));
    }

    /**
     * @return {number}
     */
    getRef () {
      return 4
    }
  }

  /**
   * @private
   *
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {ContentString}
   */
  const readContentString = decoder => new ContentString(decoder.readString());

  /**
   * @type {Array<function(UpdateDecoderV1 | UpdateDecoderV2):AbstractType<any>>}
   * @private
   */
  const typeRefs = [
    readYArray,
    readYMap,
    readYText,
    readYXmlElement,
    readYXmlFragment,
    readYXmlHook,
    readYXmlText
  ];

  const YArrayRefID = 0;
  const YMapRefID = 1;
  const YTextRefID = 2;
  const YXmlElementRefID = 3;
  const YXmlFragmentRefID = 4;
  const YXmlHookRefID = 5;
  const YXmlTextRefID = 6;

  /**
   * @private
   */
  class ContentType {
    /**
     * @param {AbstractType<any>} type
     */
    constructor (type) {
      /**
       * @type {AbstractType<any>}
       */
      this.type = type;
    }

    /**
     * @return {number}
     */
    getLength () {
      return 1
    }

    /**
     * @return {Array<any>}
     */
    getContent () {
      return [this.type]
    }

    /**
     * @return {boolean}
     */
    isCountable () {
      return true
    }

    /**
     * @return {ContentType}
     */
    copy () {
      return new ContentType(this.type._copy())
    }

    /**
     * @param {number} offset
     * @return {ContentType}
     */
    splice (offset) {
      throw methodUnimplemented()
    }

    /**
     * @param {ContentType} right
     * @return {boolean}
     */
    mergeWith (right) {
      return false
    }

    /**
     * @param {Transaction} transaction
     * @param {Item} item
     */
    integrate (transaction, item) {
      this.type._integrate(transaction.doc, item);
    }

    /**
     * @param {Transaction} transaction
     */
    delete (transaction) {
      let item = this.type._start;
      while (item !== null) {
        if (!item.deleted) {
          item.delete(transaction);
        } else {
          // This will be gc'd later and we want to merge it if possible
          // We try to merge all deleted items after each transaction,
          // but we have no knowledge about that this needs to be merged
          // since it is not in transaction.ds. Hence we add it to transaction._mergeStructs
          transaction._mergeStructs.push(item);
        }
        item = item.right;
      }
      this.type._map.forEach(item => {
        if (!item.deleted) {
          item.delete(transaction);
        } else {
          // same as above
          transaction._mergeStructs.push(item);
        }
      });
      transaction.changed.delete(this.type);
    }

    /**
     * @param {StructStore} store
     */
    gc (store) {
      let item = this.type._start;
      while (item !== null) {
        item.gc(store, true);
        item = item.right;
      }
      this.type._start = null;
      this.type._map.forEach(/** @param {Item | null} item */ (item) => {
        while (item !== null) {
          item.gc(store, true);
          item = item.left;
        }
      });
      this.type._map = new Map();
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      this.type._write(encoder);
    }

    /**
     * @return {number}
     */
    getRef () {
      return 7
    }
  }

  /**
   * @private
   *
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @return {ContentType}
   */
  const readContentType = decoder => new ContentType(typeRefs[decoder.readTypeRef()](decoder));

  /**
   * @todo This should return several items
   *
   * @param {StructStore} store
   * @param {ID} id
   * @return {{item:Item, diff:number}}
   */
  const followRedone = (store, id) => {
    /**
     * @type {ID|null}
     */
    let nextID = id;
    let diff = 0;
    let item;
    do {
      if (diff > 0) {
        nextID = createID(nextID.client, nextID.clock + diff);
      }
      item = getItem(store, nextID);
      diff = nextID.clock - item.id.clock;
      nextID = item.redone;
    } while (nextID !== null && item instanceof Item)
    return {
      item, diff
    }
  };

  /**
   * Make sure that neither item nor any of its parents is ever deleted.
   *
   * This property does not persist when storing it into a database or when
   * sending it to other peers
   *
   * @param {Item|null} item
   * @param {boolean} keep
   */
  const keepItem = (item, keep) => {
    while (item !== null && item.keep !== keep) {
      item.keep = keep;
      item = /** @type {AbstractType<any>} */ (item.parent)._item;
    }
  };

  /**
   * Split leftItem into two items
   * @param {Transaction} transaction
   * @param {Item} leftItem
   * @param {number} diff
   * @return {Item}
   *
   * @function
   * @private
   */
  const splitItem = (transaction, leftItem, diff) => {
    // create rightItem
    const { client, clock } = leftItem.id;
    const rightItem = new Item(
      createID(client, clock + diff),
      leftItem,
      createID(client, clock + diff - 1),
      leftItem.right,
      leftItem.rightOrigin,
      leftItem.parent,
      leftItem.parentSub,
      leftItem.content.splice(diff)
    );
    if (leftItem.deleted) {
      rightItem.markDeleted();
    }
    if (leftItem.keep) {
      rightItem.keep = true;
    }
    if (leftItem.redone !== null) {
      rightItem.redone = createID(leftItem.redone.client, leftItem.redone.clock + diff);
    }
    // update left (do not set leftItem.rightOrigin as it will lead to problems when syncing)
    leftItem.right = rightItem;
    // update right
    if (rightItem.right !== null) {
      rightItem.right.left = rightItem;
    }
    // right is more specific.
    transaction._mergeStructs.push(rightItem);
    // update parent._map
    if (rightItem.parentSub !== null && rightItem.right === null) {
      /** @type {AbstractType<any>} */ (rightItem.parent)._map.set(rightItem.parentSub, rightItem);
    }
    leftItem.length = diff;
    return rightItem
  };

  /**
   * Redoes the effect of this operation.
   *
   * @param {Transaction} transaction The Yjs instance.
   * @param {Item} item
   * @param {Set<Item>} redoitems
   * @param {DeleteSet} itemsToDelete
   * @param {boolean} ignoreRemoteMapChanges
   *
   * @return {Item|null}
   *
   * @private
   */
  const redoItem = (transaction, item, redoitems, itemsToDelete, ignoreRemoteMapChanges) => {
    const doc = transaction.doc;
    const store = doc.store;
    const ownClientID = doc.clientID;
    const redone = item.redone;
    if (redone !== null) {
      return getItemCleanStart(transaction, redone)
    }
    let parentItem = /** @type {AbstractType<any>} */ (item.parent)._item;
    /**
     * @type {Item|null}
     */
    let left = null;
    /**
     * @type {Item|null}
     */
    let right;
    // make sure that parent is redone
    if (parentItem !== null && parentItem.deleted === true) {
      // try to undo parent if it will be undone anyway
      if (parentItem.redone === null && (!redoitems.has(parentItem) || redoItem(transaction, parentItem, redoitems, itemsToDelete, ignoreRemoteMapChanges) === null)) {
        return null
      }
      while (parentItem.redone !== null) {
        parentItem = getItemCleanStart(transaction, parentItem.redone);
      }
    }
    const parentType = parentItem === null ? /** @type {AbstractType<any>} */ (item.parent) : /** @type {ContentType} */ (parentItem.content).type;

    if (item.parentSub === null) {
      // Is an array item. Insert at the old position
      left = item.left;
      right = item;
      // find next cloned_redo items
      while (left !== null) {
        /**
         * @type {Item|null}
         */
        let leftTrace = left;
        // trace redone until parent matches
        while (leftTrace !== null && /** @type {AbstractType<any>} */ (leftTrace.parent)._item !== parentItem) {
          leftTrace = leftTrace.redone === null ? null : getItemCleanStart(transaction, leftTrace.redone);
        }
        if (leftTrace !== null && /** @type {AbstractType<any>} */ (leftTrace.parent)._item === parentItem) {
          left = leftTrace;
          break
        }
        left = left.left;
      }
      while (right !== null) {
        /**
         * @type {Item|null}
         */
        let rightTrace = right;
        // trace redone until parent matches
        while (rightTrace !== null && /** @type {AbstractType<any>} */ (rightTrace.parent)._item !== parentItem) {
          rightTrace = rightTrace.redone === null ? null : getItemCleanStart(transaction, rightTrace.redone);
        }
        if (rightTrace !== null && /** @type {AbstractType<any>} */ (rightTrace.parent)._item === parentItem) {
          right = rightTrace;
          break
        }
        right = right.right;
      }
    } else {
      right = null;
      if (item.right && !ignoreRemoteMapChanges) {
        left = item;
        // Iterate right while right is in itemsToDelete
        // If it is intended to delete right while item is redone, we can expect that item should replace right.
        while (left !== null && left.right !== null && isDeleted(itemsToDelete, left.right.id)) {
          left = left.right;
        }
        // follow redone
        // trace redone until parent matches
        while (left !== null && left.redone !== null) {
          left = getItemCleanStart(transaction, left.redone);
        }
        if (left && left.right !== null) {
          // It is not possible to redo this item because it conflicts with a
          // change from another client
          return null
        }
      } else {
        left = parentType._map.get(item.parentSub) || null;
      }
    }
    const nextClock = getState(store, ownClientID);
    const nextId = createID(ownClientID, nextClock);
    const redoneItem = new Item(
      nextId,
      left, left && left.lastId,
      right, right && right.id,
      parentType,
      item.parentSub,
      item.content.copy()
    );
    item.redone = nextId;
    keepItem(redoneItem, true);
    redoneItem.integrate(transaction, 0);
    return redoneItem
  };

  /**
   * Abstract class that represents any content.
   */
  class Item extends AbstractStruct {
    /**
     * @param {ID} id
     * @param {Item | null} left
     * @param {ID | null} origin
     * @param {Item | null} right
     * @param {ID | null} rightOrigin
     * @param {AbstractType<any>|ID|null} parent Is a type if integrated, is null if it is possible to copy parent from left or right, is ID before integration to search for it.
     * @param {string | null} parentSub
     * @param {AbstractContent} content
     */
    constructor (id, left, origin, right, rightOrigin, parent, parentSub, content) {
      super(id, content.getLength());
      /**
       * The item that was originally to the left of this item.
       * @type {ID | null}
       */
      this.origin = origin;
      /**
       * The item that is currently to the left of this item.
       * @type {Item | null}
       */
      this.left = left;
      /**
       * The item that is currently to the right of this item.
       * @type {Item | null}
       */
      this.right = right;
      /**
       * The item that was originally to the right of this item.
       * @type {ID | null}
       */
      this.rightOrigin = rightOrigin;
      /**
       * @type {AbstractType<any>|ID|null}
       */
      this.parent = parent;
      /**
       * If the parent refers to this item with some kind of key (e.g. YMap, the
       * key is specified here. The key is then used to refer to the list in which
       * to insert this item. If `parentSub = null` type._start is the list in
       * which to insert to. Otherwise it is `parent._map`.
       * @type {String | null}
       */
      this.parentSub = parentSub;
      /**
       * If this type's effect is redone this type refers to the type that undid
       * this operation.
       * @type {ID | null}
       */
      this.redone = null;
      /**
       * @type {AbstractContent}
       */
      this.content = content;
      /**
       * bit1: keep
       * bit2: countable
       * bit3: deleted
       * bit4: mark - mark node as fast-search-marker
       * @type {number} byte
       */
      this.info = this.content.isCountable() ? BIT2 : 0;
    }

    /**
     * This is used to mark the item as an indexed fast-search marker
     *
     * @type {boolean}
     */
    set marker (isMarked) {
      if (((this.info & BIT4) > 0) !== isMarked) {
        this.info ^= BIT4;
      }
    }

    get marker () {
      return (this.info & BIT4) > 0
    }

    /**
     * If true, do not garbage collect this Item.
     */
    get keep () {
      return (this.info & BIT1) > 0
    }

    set keep (doKeep) {
      if (this.keep !== doKeep) {
        this.info ^= BIT1;
      }
    }

    get countable () {
      return (this.info & BIT2) > 0
    }

    /**
     * Whether this item was deleted or not.
     * @type {Boolean}
     */
    get deleted () {
      return (this.info & BIT3) > 0
    }

    set deleted (doDelete) {
      if (this.deleted !== doDelete) {
        this.info ^= BIT3;
      }
    }

    markDeleted () {
      this.info |= BIT3;
    }

    /**
     * Return the creator clientID of the missing op or define missing items and return null.
     *
     * @param {Transaction} transaction
     * @param {StructStore} store
     * @return {null | number}
     */
    getMissing (transaction, store) {
      if (this.origin && this.origin.client !== this.id.client && this.origin.clock >= getState(store, this.origin.client)) {
        return this.origin.client
      }
      if (this.rightOrigin && this.rightOrigin.client !== this.id.client && this.rightOrigin.clock >= getState(store, this.rightOrigin.client)) {
        return this.rightOrigin.client
      }
      if (this.parent && this.parent.constructor === ID && this.id.client !== this.parent.client && this.parent.clock >= getState(store, this.parent.client)) {
        return this.parent.client
      }

      // We have all missing ids, now find the items

      if (this.origin) {
        this.left = getItemCleanEnd(transaction, store, this.origin);
        this.origin = this.left.lastId;
      }
      if (this.rightOrigin) {
        this.right = getItemCleanStart(transaction, this.rightOrigin);
        this.rightOrigin = this.right.id;
      }
      if ((this.left && this.left.constructor === GC) || (this.right && this.right.constructor === GC)) {
        this.parent = null;
      }
      // only set parent if this shouldn't be garbage collected
      if (!this.parent) {
        if (this.left && this.left.constructor === Item) {
          this.parent = this.left.parent;
          this.parentSub = this.left.parentSub;
        }
        if (this.right && this.right.constructor === Item) {
          this.parent = this.right.parent;
          this.parentSub = this.right.parentSub;
        }
      } else if (this.parent.constructor === ID) {
        const parentItem = getItem(store, this.parent);
        if (parentItem.constructor === GC) {
          this.parent = null;
        } else {
          this.parent = /** @type {ContentType} */ (parentItem.content).type;
        }
      }
      return null
    }

    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate (transaction, offset) {
      if (offset > 0) {
        this.id.clock += offset;
        this.left = getItemCleanEnd(transaction, transaction.doc.store, createID(this.id.client, this.id.clock - 1));
        this.origin = this.left.lastId;
        this.content = this.content.splice(offset);
        this.length -= offset;
      }

      if (this.parent) {
        if ((!this.left && (!this.right || this.right.left !== null)) || (this.left && this.left.right !== this.right)) {
          /**
           * @type {Item|null}
           */
          let left = this.left;

          /**
           * @type {Item|null}
           */
          let o;
          // set o to the first conflicting item
          if (left !== null) {
            o = left.right;
          } else if (this.parentSub !== null) {
            o = /** @type {AbstractType<any>} */ (this.parent)._map.get(this.parentSub) || null;
            while (o !== null && o.left !== null) {
              o = o.left;
            }
          } else {
            o = /** @type {AbstractType<any>} */ (this.parent)._start;
          }
          // TODO: use something like DeleteSet here (a tree implementation would be best)
          // @todo use global set definitions
          /**
           * @type {Set<Item>}
           */
          const conflictingItems = new Set();
          /**
           * @type {Set<Item>}
           */
          const itemsBeforeOrigin = new Set();
          // Let c in conflictingItems, b in itemsBeforeOrigin
          // ***{origin}bbbb{this}{c,b}{c,b}{o}***
          // Note that conflictingItems is a subset of itemsBeforeOrigin
          while (o !== null && o !== this.right) {
            itemsBeforeOrigin.add(o);
            conflictingItems.add(o);
            if (compareIDs(this.origin, o.origin)) {
              // case 1
              if (o.id.client < this.id.client) {
                left = o;
                conflictingItems.clear();
              } else if (compareIDs(this.rightOrigin, o.rightOrigin)) {
                // this and o are conflicting and point to the same integration points. The id decides which item comes first.
                // Since this is to the left of o, we can break here
                break
              } // else, o might be integrated before an item that this conflicts with. If so, we will find it in the next iterations
            } else if (o.origin !== null && itemsBeforeOrigin.has(getItem(transaction.doc.store, o.origin))) { // use getItem instead of getItemCleanEnd because we don't want / need to split items.
              // case 2
              if (!conflictingItems.has(getItem(transaction.doc.store, o.origin))) {
                left = o;
                conflictingItems.clear();
              }
            } else {
              break
            }
            o = o.right;
          }
          this.left = left;
        }
        // reconnect left/right + update parent map/start if necessary
        if (this.left !== null) {
          const right = this.left.right;
          this.right = right;
          this.left.right = this;
        } else {
          let r;
          if (this.parentSub !== null) {
            r = /** @type {AbstractType<any>} */ (this.parent)._map.get(this.parentSub) || null;
            while (r !== null && r.left !== null) {
              r = r.left;
            }
          } else {
            r = /** @type {AbstractType<any>} */ (this.parent)._start
            ;/** @type {AbstractType<any>} */ (this.parent)._start = this;
          }
          this.right = r;
        }
        if (this.right !== null) {
          this.right.left = this;
        } else if (this.parentSub !== null) {
          // set as current parent value if right === null and this is parentSub
          /** @type {AbstractType<any>} */ (this.parent)._map.set(this.parentSub, this);
          if (this.left !== null) {
            // this is the current attribute value of parent. delete right
            this.left.delete(transaction);
          }
        }
        // adjust length of parent
        if (this.parentSub === null && this.countable && !this.deleted) {
          /** @type {AbstractType<any>} */ (this.parent)._length += this.length;
        }
        addStruct(transaction.doc.store, this);
        this.content.integrate(transaction, this);
        // add parent to transaction.changed
        addChangedTypeToTransaction(transaction, /** @type {AbstractType<any>} */ (this.parent), this.parentSub);
        if ((/** @type {AbstractType<any>} */ (this.parent)._item !== null && /** @type {AbstractType<any>} */ (this.parent)._item.deleted) || (this.parentSub !== null && this.right !== null)) {
          // delete if parent is deleted or if this is not the current attribute value of parent
          this.delete(transaction);
        }
      } else {
        // parent is not defined. Integrate GC struct instead
        new GC(this.id, this.length).integrate(transaction, 0);
      }
    }

    /**
     * Returns the next non-deleted item
     */
    get next () {
      let n = this.right;
      while (n !== null && n.deleted) {
        n = n.right;
      }
      return n
    }

    /**
     * Returns the previous non-deleted item
     */
    get prev () {
      let n = this.left;
      while (n !== null && n.deleted) {
        n = n.left;
      }
      return n
    }

    /**
     * Computes the last content address of this Item.
     */
    get lastId () {
      // allocating ids is pretty costly because of the amount of ids created, so we try to reuse whenever possible
      return this.length === 1 ? this.id : createID(this.id.client, this.id.clock + this.length - 1)
    }

    /**
     * Try to merge two items
     *
     * @param {Item} right
     * @return {boolean}
     */
    mergeWith (right) {
      if (
        this.constructor === right.constructor &&
        compareIDs(right.origin, this.lastId) &&
        this.right === right &&
        compareIDs(this.rightOrigin, right.rightOrigin) &&
        this.id.client === right.id.client &&
        this.id.clock + this.length === right.id.clock &&
        this.deleted === right.deleted &&
        this.redone === null &&
        right.redone === null &&
        this.content.constructor === right.content.constructor &&
        this.content.mergeWith(right.content)
      ) {
        const searchMarker = /** @type {AbstractType<any>} */ (this.parent)._searchMarker;
        if (searchMarker) {
          searchMarker.forEach(marker => {
            if (marker.p === right) {
              // right is going to be "forgotten" so we need to update the marker
              marker.p = this;
              // adjust marker index
              if (!this.deleted && this.countable) {
                marker.index -= this.length;
              }
            }
          });
        }
        if (right.keep) {
          this.keep = true;
        }
        this.right = right.right;
        if (this.right !== null) {
          this.right.left = this;
        }
        this.length += right.length;
        return true
      }
      return false
    }

    /**
     * Mark this Item as deleted.
     *
     * @param {Transaction} transaction
     */
    delete (transaction) {
      if (!this.deleted) {
        const parent = /** @type {AbstractType<any>} */ (this.parent);
        // adjust the length of parent
        if (this.countable && this.parentSub === null) {
          parent._length -= this.length;
        }
        this.markDeleted();
        addToDeleteSet(transaction.deleteSet, this.id.client, this.id.clock, this.length);
        addChangedTypeToTransaction(transaction, parent, this.parentSub);
        this.content.delete(transaction);
      }
    }

    /**
     * @param {StructStore} store
     * @param {boolean} parentGCd
     */
    gc (store, parentGCd) {
      if (!this.deleted) {
        throw unexpectedCase()
      }
      this.content.gc(store);
      if (parentGCd) {
        replaceStruct(store, this, new GC(this.id, this.length));
      } else {
        this.content = new ContentDeleted(this.length);
      }
    }

    /**
     * Transform the properties of this type to binary and write it to an
     * BinaryEncoder.
     *
     * This is called when this Item is sent to a remote peer.
     *
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder The encoder to write data to.
     * @param {number} offset
     */
    write (encoder, offset) {
      const origin = offset > 0 ? createID(this.id.client, this.id.clock + offset - 1) : this.origin;
      const rightOrigin = this.rightOrigin;
      const parentSub = this.parentSub;
      const info = (this.content.getRef() & BITS5) |
        (origin === null ? 0 : BIT8) | // origin is defined
        (rightOrigin === null ? 0 : BIT7) | // right origin is defined
        (parentSub === null ? 0 : BIT6); // parentSub is non-null
      encoder.writeInfo(info);
      if (origin !== null) {
        encoder.writeLeftID(origin);
      }
      if (rightOrigin !== null) {
        encoder.writeRightID(rightOrigin);
      }
      if (origin === null && rightOrigin === null) {
        const parent = /** @type {AbstractType<any>} */ (this.parent);
        if (parent._item !== undefined) {
          const parentItem = parent._item;
          if (parentItem === null) {
            // parent type on y._map
            // find the correct key
            const ykey = findRootTypeKey(parent);
            encoder.writeParentInfo(true); // write parentYKey
            encoder.writeString(ykey);
          } else {
            encoder.writeParentInfo(false); // write parent id
            encoder.writeLeftID(parentItem.id);
          }
        } else if (parent.constructor === String) { // this edge case was added by differential updates
          encoder.writeParentInfo(true); // write parentYKey
          encoder.writeString(parent);
        } else if (parent.constructor === ID) {
          encoder.writeParentInfo(false); // write parent id
          encoder.writeLeftID(parent);
        } else {
          unexpectedCase();
        }
        if (parentSub !== null) {
          encoder.writeString(parentSub);
        }
      }
      this.content.write(encoder, offset);
    }
  }

  /**
   * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
   * @param {number} info
   */
  const readItemContent = (decoder, info) => contentRefs[info & BITS5](decoder);

  /**
   * A lookup map for reading Item content.
   *
   * @type {Array<function(UpdateDecoderV1 | UpdateDecoderV2):AbstractContent>}
   */
  const contentRefs = [
    () => { unexpectedCase(); }, // GC is not ItemContent
    readContentDeleted, // 1
    readContentJSON, // 2
    readContentBinary, // 3
    readContentString, // 4
    readContentEmbed, // 5
    readContentFormat, // 6
    readContentType, // 7
    readContentAny, // 8
    readContentDoc, // 9
    () => { unexpectedCase(); } // 10 - Skip is not ItemContent
  ];

  const structSkipRefNumber = 10;

  /**
   * @private
   */
  class Skip extends AbstractStruct {
    get deleted () {
      return true
    }

    delete () {}

    /**
     * @param {Skip} right
     * @return {boolean}
     */
    mergeWith (right) {
      if (this.constructor !== right.constructor) {
        return false
      }
      this.length += right.length;
      return true
    }

    /**
     * @param {Transaction} transaction
     * @param {number} offset
     */
    integrate (transaction, offset) {
      // skip structs cannot be integrated
      unexpectedCase();
    }

    /**
     * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
     * @param {number} offset
     */
    write (encoder, offset) {
      encoder.writeInfo(structSkipRefNumber);
      // write as VarUint because Skips can't make use of predictable length-encoding
      writeVarUint(encoder.restEncoder, this.length - offset);
    }

    /**
     * @param {Transaction} transaction
     * @param {StructStore} store
     * @return {null | number}
     */
    getMissing (transaction, store) {
      return null
    }
  }

  /** eslint-env browser */

  const glo = /** @type {any} */ (typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      // @ts-ignore
      : typeof global !== 'undefined' ? global : {});

  const importIdentifier = '__ $YJS$ __';

  if (glo[importIdentifier] === true) {
    /**
     * Dear reader of this message. Please take this seriously.
     *
     * If you see this message, make sure that you only import one version of Yjs. In many cases,
     * your package manager installs two versions of Yjs that are used by different packages within your project.
     * Another reason for this message is that some parts of your project use the commonjs version of Yjs
     * and others use the EcmaScript version of Yjs.
     *
     * This often leads to issues that are hard to debug. We often need to perform constructor checks,
     * e.g. `struct instanceof GC`. If you imported different versions of Yjs, it is impossible for us to
     * do the constructor checks anymore - which might break the CRDT algorithm.
     *
     * https://github.com/yjs/yjs/issues/438
     */
    console.error('Yjs was already imported. This breaks constructor checks and will lead to issues! - https://github.com/yjs/yjs/issues/438');
  }
  glo[importIdentifier] = true;

  var Y = /*#__PURE__*/Object.freeze({
    __proto__: null,
    AbsolutePosition: AbsolutePosition,
    AbstractConnector: AbstractConnector,
    AbstractStruct: AbstractStruct,
    AbstractType: AbstractType,
    Array: YArray,
    ContentAny: ContentAny,
    ContentBinary: ContentBinary,
    ContentDeleted: ContentDeleted,
    ContentEmbed: ContentEmbed,
    ContentFormat: ContentFormat,
    ContentJSON: ContentJSON,
    ContentString: ContentString,
    ContentType: ContentType,
    Doc: Doc,
    GC: GC,
    ID: ID,
    Item: Item,
    Map: YMap,
    PermanentUserData: PermanentUserData,
    RelativePosition: RelativePosition,
    Snapshot: Snapshot,
    Text: YText,
    Transaction: Transaction$1,
    UndoManager: UndoManager,
    UpdateEncoderV1: UpdateEncoderV1,
    XmlElement: YXmlElement,
    XmlFragment: YXmlFragment,
    XmlHook: YXmlHook,
    XmlText: YXmlText,
    YArrayEvent: YArrayEvent,
    YEvent: YEvent,
    YMapEvent: YMapEvent,
    YTextEvent: YTextEvent,
    YXmlEvent: YXmlEvent,
    applyUpdate: applyUpdate,
    applyUpdateV2: applyUpdateV2,
    cleanupYTextFormatting: cleanupYTextFormatting,
    compareIDs: compareIDs,
    compareRelativePositions: compareRelativePositions,
    convertUpdateFormatV1ToV2: convertUpdateFormatV1ToV2,
    convertUpdateFormatV2ToV1: convertUpdateFormatV2ToV1,
    createAbsolutePositionFromRelativePosition: createAbsolutePositionFromRelativePosition,
    createDeleteSet: createDeleteSet,
    createDeleteSetFromStructStore: createDeleteSetFromStructStore,
    createDocFromSnapshot: createDocFromSnapshot,
    createID: createID,
    createRelativePositionFromJSON: createRelativePositionFromJSON,
    createRelativePositionFromTypeIndex: createRelativePositionFromTypeIndex,
    createSnapshot: createSnapshot,
    decodeRelativePosition: decodeRelativePosition,
    decodeSnapshot: decodeSnapshot,
    decodeSnapshotV2: decodeSnapshotV2,
    decodeStateVector: decodeStateVector,
    decodeUpdate: decodeUpdate,
    decodeUpdateV2: decodeUpdateV2,
    diffUpdate: diffUpdate,
    diffUpdateV2: diffUpdateV2,
    emptySnapshot: emptySnapshot,
    encodeRelativePosition: encodeRelativePosition,
    encodeSnapshot: encodeSnapshot,
    encodeSnapshotV2: encodeSnapshotV2,
    encodeStateAsUpdate: encodeStateAsUpdate,
    encodeStateAsUpdateV2: encodeStateAsUpdateV2,
    encodeStateVector: encodeStateVector,
    encodeStateVectorFromUpdate: encodeStateVectorFromUpdate,
    encodeStateVectorFromUpdateV2: encodeStateVectorFromUpdateV2,
    equalSnapshots: equalSnapshots,
    findIndexSS: findIndexSS,
    findRootTypeKey: findRootTypeKey,
    getItem: getItem,
    getState: getState,
    getTypeChildren: getTypeChildren,
    isDeleted: isDeleted,
    isParentOf: isParentOf,
    iterateDeletedStructs: iterateDeletedStructs,
    logType: logType,
    logUpdate: logUpdate,
    logUpdateV2: logUpdateV2,
    mergeUpdates: mergeUpdates,
    mergeUpdatesV2: mergeUpdatesV2,
    parseUpdateMeta: parseUpdateMeta,
    parseUpdateMetaV2: parseUpdateMetaV2,
    readUpdate: readUpdate$1,
    readUpdateV2: readUpdateV2,
    relativePositionToJSON: relativePositionToJSON,
    snapshot: snapshot,
    transact: transact,
    tryGc: tryGc,
    typeListToArraySnapshot: typeListToArraySnapshot,
    typeMapGetSnapshot: typeMapGetSnapshot
  });

  /**
   * @module sync-protocol
   */

  /**
   * @typedef {Map<number, number>} StateMap
   */

  /**
   * Core Yjs defines two message types:
   * • YjsSyncStep1: Includes the State Set of the sending client. When received, the client should reply with YjsSyncStep2.
   * • YjsSyncStep2: Includes all missing structs and the complete delete set. When received, the client is assured that it
   *   received all information from the remote client.
   *
   * In a peer-to-peer network, you may want to introduce a SyncDone message type. Both parties should initiate the connection
   * with SyncStep1. When a client received SyncStep2, it should reply with SyncDone. When the local client received both
   * SyncStep2 and SyncDone, it is assured that it is synced to the remote client.
   *
   * In a client-server model, you want to handle this differently: The client should initiate the connection with SyncStep1.
   * When the server receives SyncStep1, it should reply with SyncStep2 immediately followed by SyncStep1. The client replies
   * with SyncStep2 when it receives SyncStep1. Optionally the server may send a SyncDone after it received SyncStep2, so the
   * client knows that the sync is finished.  There are two reasons for this more elaborated sync model: 1. This protocol can
   * easily be implemented on top of http and websockets. 2. The server shoul only reply to requests, and not initiate them.
   * Therefore it is necesarry that the client initiates the sync.
   *
   * Construction of a message:
   * [messageType : varUint, message definition..]
   *
   * Note: A message does not include information about the room name. This must to be handled by the upper layer protocol!
   *
   * stringify[messageType] stringifies a message definition (messageType is already read from the bufffer)
   */

  const messageYjsSyncStep1 = 0;
  const messageYjsSyncStep2 = 1;
  const messageYjsUpdate = 2;

  /**
   * Create a sync step 1 message based on the state of the current shared document.
   *
   * @param {encoding.Encoder} encoder
   * @param {Y.Doc} doc
   */
  const writeSyncStep1 = (encoder, doc) => {
    writeVarUint(encoder, messageYjsSyncStep1);
    const sv = encodeStateVector(doc);
    writeVarUint8Array(encoder, sv);
  };

  /**
   * @param {encoding.Encoder} encoder
   * @param {Y.Doc} doc
   * @param {Uint8Array} [encodedStateVector]
   */
  const writeSyncStep2 = (encoder, doc, encodedStateVector) => {
    writeVarUint(encoder, messageYjsSyncStep2);
    writeVarUint8Array(encoder, encodeStateAsUpdate(doc, encodedStateVector));
  };

  /**
   * Read SyncStep1 message and reply with SyncStep2.
   *
   * @param {decoding.Decoder} decoder The reply to the received message
   * @param {encoding.Encoder} encoder The received message
   * @param {Y.Doc} doc
   */
  const readSyncStep1 = (decoder, encoder, doc) =>
    writeSyncStep2(encoder, doc, readVarUint8Array(decoder));

  /**
   * Read and apply Structs and then DeleteStore to a y instance.
   *
   * @param {decoding.Decoder} decoder
   * @param {Y.Doc} doc
   * @param {any} transactionOrigin
   */
  const readSyncStep2 = (decoder, doc, transactionOrigin) => {
    try {
      applyUpdate(doc, readVarUint8Array(decoder), transactionOrigin);
    } catch (error) {
      // This catches errors that are thrown by event handlers
      console.error('Caught error while handling a Yjs update', error);
    }
  };

  /**
   * @param {encoding.Encoder} encoder
   * @param {Uint8Array} update
   */
  const writeUpdate = (encoder, update) => {
    writeVarUint(encoder, messageYjsUpdate);
    writeVarUint8Array(encoder, update);
  };

  /**
   * Read and apply Structs and then DeleteStore to a y instance.
   *
   * @param {decoding.Decoder} decoder
   * @param {Y.Doc} doc
   * @param {any} transactionOrigin
   */
  const readUpdate = readSyncStep2;

  /**
   * @param {decoding.Decoder} decoder A message received from another client
   * @param {encoding.Encoder} encoder The reply message. Will not be sent if empty.
   * @param {Y.Doc} doc
   * @param {any} transactionOrigin
   */
  const readSyncMessage = (decoder, encoder, doc, transactionOrigin) => {
    const messageType = readVarUint(decoder);
    switch (messageType) {
      case messageYjsSyncStep1:
        readSyncStep1(decoder, encoder, doc);
        break
      case messageYjsSyncStep2:
        readSyncStep2(decoder, doc, transactionOrigin);
        break
      case messageYjsUpdate:
        readUpdate(decoder, doc, transactionOrigin);
        break
      default:
        throw new Error('Unknown message type')
    }
    return messageType
  };

  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.Y = Y; // eslint-disable-line
  }

  /**
   * @param {TestYInstance} y // publish message created by `y` to all other online clients
   * @param {Uint8Array} m
   */
  const broadcastMessage = (y, m) => {
    if (y.tc.onlineConns.has(y)) {
      y.tc.onlineConns.forEach(remoteYInstance => {
        if (remoteYInstance !== y) {
          remoteYInstance._receive(m, y);
        }
      });
    }
  };

  const encV1 = {
    encodeStateAsUpdate: encodeStateAsUpdate,
    mergeUpdates: mergeUpdates,
    applyUpdate: applyUpdate,
    logUpdate: logUpdate,
    updateEventName: 'update',
    diffUpdate: diffUpdate
  };

  let enc = encV1;

  const useV1Encoding = () => {
    enc = encV1;
  };

  const useV2Encoding = () => {
    console.error('sync protocol doesnt support v2 protocol yet, fallback to v1 encoding'); // @Todo
    enc = encV1;
  };

  class TestYInstance extends Doc {
    /**
     * @param {TestConnector} testConnector
     * @param {number} clientID
     */
    constructor (testConnector, clientID) {
      super();
      this.userID = clientID; // overwriting clientID
      /**
       * @type {TestConnector}
       */
      this.tc = testConnector;
      /**
       * @type {Map<TestYInstance, Array<Uint8Array>>}
       */
      this.receiving = new Map();
      testConnector.allConns.add(this);
      /**
       * The list of received updates.
       * We are going to merge them later using Y.mergeUpdates and check if the resulting document is correct.
       * @type {Array<Uint8Array>}
       */
      this.updates = [];
      // set up observe on local model
      this.on(enc.updateEventName, /** @param {Uint8Array} update @param {any} origin */ (update, origin) => {
        if (origin !== testConnector) {
          const encoder = createEncoder();
          writeUpdate(encoder, update);
          broadcastMessage(this, toUint8Array(encoder));
        }
        this.updates.push(update);
      });
      this.connect();
    }

    /**
     * Disconnect from TestConnector.
     */
    disconnect () {
      this.receiving = new Map();
      this.tc.onlineConns.delete(this);
    }

    /**
     * Append yourself to the list of known Y instances in testconnector.
     * Also initiate sync with all clients.
     */
    connect () {
      if (!this.tc.onlineConns.has(this)) {
        this.tc.onlineConns.add(this);
        const encoder = createEncoder();
        writeSyncStep1(encoder, this);
        // publish SyncStep1
        broadcastMessage(this, toUint8Array(encoder));
        this.tc.onlineConns.forEach(remoteYInstance => {
          if (remoteYInstance !== this) {
            // remote instance sends instance to this instance
            const encoder = createEncoder();
            writeSyncStep1(encoder, remoteYInstance);
            this._receive(toUint8Array(encoder), remoteYInstance);
          }
        });
      }
    }

    /**
     * Receive a message from another client. This message is only appended to the list of receiving messages.
     * TestConnector decides when this client actually reads this message.
     *
     * @param {Uint8Array} message
     * @param {TestYInstance} remoteClient
     */
    _receive (message, remoteClient) {
      setIfUndefined(this.receiving, remoteClient, () => []).push(message);
    }
  }

  /**
   * Keeps track of TestYInstances.
   *
   * The TestYInstances add/remove themselves from the list of connections maiained in this object.
   * I think it makes sense. Deal with it.
   */
  class TestConnector {
    /**
     * @param {prng.PRNG} gen
     */
    constructor (gen) {
      /**
       * @type {Set<TestYInstance>}
       */
      this.allConns = new Set();
      /**
       * @type {Set<TestYInstance>}
       */
      this.onlineConns = new Set();
      /**
       * @type {prng.PRNG}
       */
      this.prng = gen;
    }

    /**
     * Create a new Y instance and add it to the list of connections
     * @param {number} clientID
     */
    createY (clientID) {
      return new TestYInstance(this, clientID)
    }

    /**
     * Choose random connection and flush a random message from a random sender.
     *
     * If this function was unable to flush a message, because there are no more messages to flush, it returns false. true otherwise.
     * @return {boolean}
     */
    flushRandomMessage () {
      const gen = this.prng;
      const conns = Array.from(this.onlineConns).filter(conn => conn.receiving.size > 0);
      if (conns.length > 0) {
        const receiver = oneOf(gen, conns);
        const [sender, messages] = oneOf(gen, Array.from(receiver.receiving));
        const m = messages.shift();
        if (messages.length === 0) {
          receiver.receiving.delete(sender);
        }
        if (m === undefined) {
          return this.flushRandomMessage()
        }
        const encoder = createEncoder();
        // console.log('receive (' + sender.userID + '->' + receiver.userID + '):\n', syncProtocol.stringifySyncMessage(decoding.createDecoder(m), receiver))
        // do not publish data created when this function is executed (could be ss2 or update message)
        readSyncMessage(createDecoder(m), encoder, receiver, receiver.tc);
        if (length(encoder) > 0) {
          // send reply message
          sender._receive(toUint8Array(encoder), receiver);
        }
        return true
      }
      return false
    }

    /**
     * @return {boolean} True iff this function actually flushed something
     */
    flushAllMessages () {
      let didSomething = false;
      while (this.flushRandomMessage()) {
        didSomething = true;
      }
      return didSomething
    }

    reconnectAll () {
      this.allConns.forEach(conn => conn.connect());
    }

    disconnectAll () {
      this.allConns.forEach(conn => conn.disconnect());
    }

    syncAll () {
      this.reconnectAll();
      this.flushAllMessages();
    }

    /**
     * @return {boolean} Whether it was possible to disconnect a randon connection.
     */
    disconnectRandom () {
      if (this.onlineConns.size === 0) {
        return false
      }
      oneOf(this.prng, Array.from(this.onlineConns)).disconnect();
      return true
    }

    /**
     * @return {boolean} Whether it was possible to reconnect a random connection.
     */
    reconnectRandom () {
      /**
       * @type {Array<TestYInstance>}
       */
      const reconnectable = [];
      this.allConns.forEach(conn => {
        if (!this.onlineConns.has(conn)) {
          reconnectable.push(conn);
        }
      });
      if (reconnectable.length === 0) {
        return false
      }
      oneOf(this.prng, reconnectable).connect();
      return true
    }
  }

  /**
   * @template T
   * @param {t.TestCase} tc
   * @param {{users?:number}} conf
   * @param {InitTestObjectCallback<T>} [initTestObject]
   * @return {{testObjects:Array<any>,testConnector:TestConnector,users:Array<TestYInstance>,array0:Y.Array<any>,array1:Y.Array<any>,array2:Y.Array<any>,map0:Y.Map<any>,map1:Y.Map<any>,map2:Y.Map<any>,map3:Y.Map<any>,text0:Y.Text,text1:Y.Text,text2:Y.Text,xml0:Y.XmlElement,xml1:Y.XmlElement,xml2:Y.XmlElement}}
   */
  const init = (tc, { users = 5 } = {}, initTestObject) => {
    /**
     * @type {Object<string,any>}
     */
    const result = {
      users: []
    };
    const gen = tc.prng;
    // choose an encoding approach at random
    if (bool(gen)) {
      useV2Encoding();
    } else {
      useV1Encoding();
    }

    const testConnector = new TestConnector(gen);
    result.testConnector = testConnector;
    for (let i = 0; i < users; i++) {
      const y = testConnector.createY(i);
      y.clientID = i;
      result.users.push(y);
      result['array' + i] = y.getArray('array');
      result['map' + i] = y.getMap('map');
      result['xml' + i] = y.get('xml', YXmlElement);
      result['text' + i] = y.getText('text');
    }
    testConnector.syncAll();
    result.testObjects = result.users.map(initTestObject || (() => null));
    useV1Encoding();
    return /** @type {any} */ (result)
  };

  /**
   * 1. reconnect and flush all
   * 2. user 0 gc
   * 3. get type content
   * 4. disconnect & reconnect all (so gc is propagated)
   * 5. compare os, ds, ss
   *
   * @param {Array<TestYInstance>} users
   */
  const compare = users => {
    users.forEach(u => u.connect());
    while (users[0].tc.flushAllMessages()) {} // eslint-disable-line
    // For each document, merge all received document updates with Y.mergeUpdates and create a new document which will be added to the list of "users"
    // This ensures that mergeUpdates works correctly
    const mergedDocs = users.map(user => {
      const ydoc = new Doc();
      enc.applyUpdate(ydoc, enc.mergeUpdates(user.updates));
      return ydoc
    });
    users.push(.../** @type {any} */(mergedDocs));
    const userArrayValues = users.map(u => u.getArray('array').toJSON());
    const userMapValues = users.map(u => u.getMap('map').toJSON());
    const userXmlValues = users.map(u => u.get('xml', YXmlElement).toString());
    const userTextValues = users.map(u => u.getText('text').toDelta());
    for (const u of users) {
      assert(u.store.pendingDs === null);
      assert(u.store.pendingStructs === null);
    }
    // Test Array iterator
    compare$1(users[0].getArray('array').toArray(), Array.from(users[0].getArray('array')));
    // Test Map iterator
    const ymapkeys = Array.from(users[0].getMap('map').keys());
    assert(ymapkeys.length === Object.keys(userMapValues[0]).length);
    ymapkeys.forEach(key => assert(hasProperty(userMapValues[0], key)));
    /**
     * @type {Object<string,any>}
     */
    const mapRes = {};
    for (const [k, v] of users[0].getMap('map')) {
      mapRes[k] = v instanceof AbstractType ? v.toJSON() : v;
    }
    compare$1(userMapValues[0], mapRes);
    // Compare all users
    for (let i = 0; i < users.length - 1; i++) {
      compare$1(userArrayValues[i].length, users[i].getArray('array').length);
      compare$1(userArrayValues[i], userArrayValues[i + 1]);
      compare$1(userMapValues[i], userMapValues[i + 1]);
      compare$1(userXmlValues[i], userXmlValues[i + 1]);
      compare$1(userTextValues[i].map(/** @param {any} a */ a => typeof a.insert === 'string' ? a.insert : ' ').join('').length, users[i].getText('text').length);
      compare$1(userTextValues[i], userTextValues[i + 1], '', (constructor, a, b) => {
        if (a instanceof AbstractType) {
          compare$1(a.toJSON(), b.toJSON());
        } else if (a !== b) {
          fail('Deltas dont match');
        }
        return true
      });
      compare$1(encodeStateVector(users[i]), encodeStateVector(users[i + 1]));
      compareDS(createDeleteSetFromStructStore(users[i].store), createDeleteSetFromStructStore(users[i + 1].store));
      compareStructStores(users[i].store, users[i + 1].store);
    }
    users.map(u => u.destroy());
  };

  /**
   * @param {Y.Item?} a
   * @param {Y.Item?} b
   * @return {boolean}
   */
  const compareItemIDs = (a, b) => a === b || (a !== null && b != null && compareIDs(a.id, b.id));

  /**
   * @param {import('../src/internals').StructStore} ss1
   * @param {import('../src/internals').StructStore} ss2
   */
  const compareStructStores = (ss1, ss2) => {
    assert(ss1.clients.size === ss2.clients.size);
    for (const [client, structs1] of ss1.clients) {
      const structs2 = /** @type {Array<Y.AbstractStruct>} */ (ss2.clients.get(client));
      assert(structs2 !== undefined && structs1.length === structs2.length);
      for (let i = 0; i < structs1.length; i++) {
        const s1 = structs1[i];
        const s2 = structs2[i];
        // checks for abstract struct
        if (
          s1.constructor !== s2.constructor ||
          !compareIDs(s1.id, s2.id) ||
          s1.deleted !== s2.deleted ||
          // @ts-ignore
          s1.length !== s2.length
        ) {
          fail('Structs dont match');
        }
        if (s1 instanceof Item) {
          if (
            !(s2 instanceof Item) ||
            !((s1.left === null && s2.left === null) || (s1.left !== null && s2.left !== null && compareIDs(s1.left.lastId, s2.left.lastId))) ||
            !compareItemIDs(s1.right, s2.right) ||
            !compareIDs(s1.origin, s2.origin) ||
            !compareIDs(s1.rightOrigin, s2.rightOrigin) ||
            s1.parentSub !== s2.parentSub
          ) {
            return fail('Items dont match')
          }
          // make sure that items are connected correctly
          assert(s1.left === null || s1.left.right === s1);
          assert(s1.right === null || s1.right.left === s1);
          assert(s2.left === null || s2.left.right === s2);
          assert(s2.right === null || s2.right.left === s2);
        }
      }
    }
  };

  /**
   * @param {import('../src/internals').DeleteSet} ds1
   * @param {import('../src/internals').DeleteSet} ds2
   */
  const compareDS = (ds1, ds2) => {
    assert(ds1.clients.size === ds2.clients.size);
    ds1.clients.forEach((deleteItems1, client) => {
      const deleteItems2 = /** @type {Array<import('../src/internals').DeleteItem>} */ (ds2.clients.get(client));
      assert(deleteItems2 !== undefined && deleteItems1.length === deleteItems2.length);
      for (let i = 0; i < deleteItems1.length; i++) {
        const di1 = deleteItems1[i];
        const di2 = deleteItems2[i];
        if (di1.clock !== di2.clock || di1.len !== di2.len) {
          fail('DeleteSets dont match');
        }
      }
    });
  };

  /**
   * @template T
   * @callback InitTestObjectCallback
   * @param {TestYInstance} y
   * @return {T}
   */

  /**
   * @template T
   * @param {t.TestCase} tc
   * @param {Array<function(Y.Doc,prng.PRNG,T):void>} mods
   * @param {number} iterations
   * @param {InitTestObjectCallback<T>} [initTestObject]
   */
  const applyRandomTests = (tc, mods, iterations, initTestObject) => {
    const gen = tc.prng;
    const result = init(tc, { users: 5 }, initTestObject);
    const { testConnector, users } = result;
    for (let i = 0; i < iterations; i++) {
      if (int32(gen, 0, 100) <= 2) {
        // 2% chance to disconnect/reconnect a random user
        if (bool(gen)) {
          testConnector.disconnectRandom();
        } else {
          testConnector.reconnectRandom();
        }
      } else if (int32(gen, 0, 100) <= 1) {
        // 1% chance to flush all
        testConnector.flushAllMessages();
      } else if (int32(gen, 0, 100) <= 50) {
        // 50% chance to flush a random message
        testConnector.flushRandomMessage();
      }
      const user = int32(gen, 0, users.length - 1);
      const test = oneOf(gen, mods);
      test(users[user], gen, result.testObjects[user]);
    }
    compare(users);
    return result
  };

  // ::- Persistent data structure representing an ordered mapping from
  // strings to values, with some convenient update methods.
  function OrderedMap(content) {
    this.content = content;
  }

  OrderedMap.prototype = {
    constructor: OrderedMap,

    find: function(key) {
      for (var i = 0; i < this.content.length; i += 2)
        if (this.content[i] === key) return i
      return -1
    },

    // :: (string) → ?any
    // Retrieve the value stored under `key`, or return undefined when
    // no such key exists.
    get: function(key) {
      var found = this.find(key);
      return found == -1 ? undefined : this.content[found + 1]
    },

    // :: (string, any, ?string) → OrderedMap
    // Create a new map by replacing the value of `key` with a new
    // value, or adding a binding to the end of the map. If `newKey` is
    // given, the key of the binding will be replaced with that key.
    update: function(key, value, newKey) {
      var self = newKey && newKey != key ? this.remove(newKey) : this;
      var found = self.find(key), content = self.content.slice();
      if (found == -1) {
        content.push(newKey || key, value);
      } else {
        content[found + 1] = value;
        if (newKey) content[found] = newKey;
      }
      return new OrderedMap(content)
    },

    // :: (string) → OrderedMap
    // Return a map with the given key removed, if it existed.
    remove: function(key) {
      var found = this.find(key);
      if (found == -1) return this
      var content = this.content.slice();
      content.splice(found, 2);
      return new OrderedMap(content)
    },

    // :: (string, any) → OrderedMap
    // Add a new key to the start of the map.
    addToStart: function(key, value) {
      return new OrderedMap([key, value].concat(this.remove(key).content))
    },

    // :: (string, any) → OrderedMap
    // Add a new key to the end of the map.
    addToEnd: function(key, value) {
      var content = this.remove(key).content.slice();
      content.push(key, value);
      return new OrderedMap(content)
    },

    // :: (string, string, any) → OrderedMap
    // Add a key after the given key. If `place` is not found, the new
    // key is added to the end.
    addBefore: function(place, key, value) {
      var without = this.remove(key), content = without.content.slice();
      var found = without.find(place);
      content.splice(found == -1 ? content.length : found, 0, key, value);
      return new OrderedMap(content)
    },

    // :: ((key: string, value: any))
    // Call the given function for each key/value pair in the map, in
    // order.
    forEach: function(f) {
      for (var i = 0; i < this.content.length; i += 2)
        f(this.content[i], this.content[i + 1]);
    },

    // :: (union<Object, OrderedMap>) → OrderedMap
    // Create a new map by prepending the keys in this map that don't
    // appear in `map` before the keys in `map`.
    prepend: function(map) {
      map = OrderedMap.from(map);
      if (!map.size) return this
      return new OrderedMap(map.content.concat(this.subtract(map).content))
    },

    // :: (union<Object, OrderedMap>) → OrderedMap
    // Create a new map by appending the keys in this map that don't
    // appear in `map` after the keys in `map`.
    append: function(map) {
      map = OrderedMap.from(map);
      if (!map.size) return this
      return new OrderedMap(this.subtract(map).content.concat(map.content))
    },

    // :: (union<Object, OrderedMap>) → OrderedMap
    // Create a map containing all the keys in this map that don't
    // appear in `map`.
    subtract: function(map) {
      var result = this;
      map = OrderedMap.from(map);
      for (var i = 0; i < map.content.length; i += 2)
        result = result.remove(map.content[i]);
      return result
    },

    // :: () → Object
    // Turn ordered map into a plain object.
    toObject: function() {
      var result = {};
      this.forEach(function(key, value) { result[key] = value; });
      return result
    },

    // :: number
    // The amount of keys in this map.
    get size() {
      return this.content.length >> 1
    }
  };

  // :: (?union<Object, OrderedMap>) → OrderedMap
  // Return a map with the given content. If null, create an empty
  // map. If given an ordered map, return that map itself. If given an
  // object, create a map from the object's properties.
  OrderedMap.from = function(value) {
    if (value instanceof OrderedMap) return value
    var content = [];
    if (value) for (var prop in value) content.push(prop, value[prop]);
    return new OrderedMap(content)
  };

  function findDiffStart(a, b, pos) {
      for (let i = 0;; i++) {
          if (i == a.childCount || i == b.childCount)
              return a.childCount == b.childCount ? null : pos;
          let childA = a.child(i), childB = b.child(i);
          if (childA == childB) {
              pos += childA.nodeSize;
              continue;
          }
          if (!childA.sameMarkup(childB))
              return pos;
          if (childA.isText && childA.text != childB.text) {
              for (let j = 0; childA.text[j] == childB.text[j]; j++)
                  pos++;
              return pos;
          }
          if (childA.content.size || childB.content.size) {
              let inner = findDiffStart(childA.content, childB.content, pos + 1);
              if (inner != null)
                  return inner;
          }
          pos += childA.nodeSize;
      }
  }
  function findDiffEnd(a, b, posA, posB) {
      for (let iA = a.childCount, iB = b.childCount;;) {
          if (iA == 0 || iB == 0)
              return iA == iB ? null : { a: posA, b: posB };
          let childA = a.child(--iA), childB = b.child(--iB), size = childA.nodeSize;
          if (childA == childB) {
              posA -= size;
              posB -= size;
              continue;
          }
          if (!childA.sameMarkup(childB))
              return { a: posA, b: posB };
          if (childA.isText && childA.text != childB.text) {
              let same = 0, minSize = Math.min(childA.text.length, childB.text.length);
              while (same < minSize && childA.text[childA.text.length - same - 1] == childB.text[childB.text.length - same - 1]) {
                  same++;
                  posA--;
                  posB--;
              }
              return { a: posA, b: posB };
          }
          if (childA.content.size || childB.content.size) {
              let inner = findDiffEnd(childA.content, childB.content, posA - 1, posB - 1);
              if (inner)
                  return inner;
          }
          posA -= size;
          posB -= size;
      }
  }

  /**
  A fragment represents a node's collection of child nodes.

  Like nodes, fragments are persistent data structures, and you
  should not mutate them or their content. Rather, you create new
  instances whenever needed. The API tries to make this easy.
  */
  class Fragment {
      /**
      @internal
      */
      constructor(
      /**
      @internal
      */
      content, size) {
          this.content = content;
          this.size = size || 0;
          if (size == null)
              for (let i = 0; i < content.length; i++)
                  this.size += content[i].nodeSize;
      }
      /**
      Invoke a callback for all descendant nodes between the given two
      positions (relative to start of this fragment). Doesn't descend
      into a node when the callback returns `false`.
      */
      nodesBetween(from, to, f, nodeStart = 0, parent) {
          for (let i = 0, pos = 0; pos < to; i++) {
              let child = this.content[i], end = pos + child.nodeSize;
              if (end > from && f(child, nodeStart + pos, parent || null, i) !== false && child.content.size) {
                  let start = pos + 1;
                  child.nodesBetween(Math.max(0, from - start), Math.min(child.content.size, to - start), f, nodeStart + start);
              }
              pos = end;
          }
      }
      /**
      Call the given callback for every descendant node. `pos` will be
      relative to the start of the fragment. The callback may return
      `false` to prevent traversal of a given node's children.
      */
      descendants(f) {
          this.nodesBetween(0, this.size, f);
      }
      /**
      Extract the text between `from` and `to`. See the same method on
      [`Node`](https://prosemirror.net/docs/ref/#model.Node.textBetween).
      */
      textBetween(from, to, blockSeparator, leafText) {
          let text = "", separated = true;
          this.nodesBetween(from, to, (node, pos) => {
              if (node.isText) {
                  text += node.text.slice(Math.max(from, pos) - pos, to - pos);
                  separated = !blockSeparator;
              }
              else if (node.isLeaf) {
                  if (leafText) {
                      text += typeof leafText === "function" ? leafText(node) : leafText;
                  }
                  else if (node.type.spec.leafText) {
                      text += node.type.spec.leafText(node);
                  }
                  separated = !blockSeparator;
              }
              else if (!separated && node.isBlock) {
                  text += blockSeparator;
                  separated = true;
              }
          }, 0);
          return text;
      }
      /**
      Create a new fragment containing the combined content of this
      fragment and the other.
      */
      append(other) {
          if (!other.size)
              return this;
          if (!this.size)
              return other;
          let last = this.lastChild, first = other.firstChild, content = this.content.slice(), i = 0;
          if (last.isText && last.sameMarkup(first)) {
              content[content.length - 1] = last.withText(last.text + first.text);
              i = 1;
          }
          for (; i < other.content.length; i++)
              content.push(other.content[i]);
          return new Fragment(content, this.size + other.size);
      }
      /**
      Cut out the sub-fragment between the two given positions.
      */
      cut(from, to = this.size) {
          if (from == 0 && to == this.size)
              return this;
          let result = [], size = 0;
          if (to > from)
              for (let i = 0, pos = 0; pos < to; i++) {
                  let child = this.content[i], end = pos + child.nodeSize;
                  if (end > from) {
                      if (pos < from || end > to) {
                          if (child.isText)
                              child = child.cut(Math.max(0, from - pos), Math.min(child.text.length, to - pos));
                          else
                              child = child.cut(Math.max(0, from - pos - 1), Math.min(child.content.size, to - pos - 1));
                      }
                      result.push(child);
                      size += child.nodeSize;
                  }
                  pos = end;
              }
          return new Fragment(result, size);
      }
      /**
      @internal
      */
      cutByIndex(from, to) {
          if (from == to)
              return Fragment.empty;
          if (from == 0 && to == this.content.length)
              return this;
          return new Fragment(this.content.slice(from, to));
      }
      /**
      Create a new fragment in which the node at the given index is
      replaced by the given node.
      */
      replaceChild(index, node) {
          let current = this.content[index];
          if (current == node)
              return this;
          let copy = this.content.slice();
          let size = this.size + node.nodeSize - current.nodeSize;
          copy[index] = node;
          return new Fragment(copy, size);
      }
      /**
      Create a new fragment by prepending the given node to this
      fragment.
      */
      addToStart(node) {
          return new Fragment([node].concat(this.content), this.size + node.nodeSize);
      }
      /**
      Create a new fragment by appending the given node to this
      fragment.
      */
      addToEnd(node) {
          return new Fragment(this.content.concat(node), this.size + node.nodeSize);
      }
      /**
      Compare this fragment to another one.
      */
      eq(other) {
          if (this.content.length != other.content.length)
              return false;
          for (let i = 0; i < this.content.length; i++)
              if (!this.content[i].eq(other.content[i]))
                  return false;
          return true;
      }
      /**
      The first child of the fragment, or `null` if it is empty.
      */
      get firstChild() { return this.content.length ? this.content[0] : null; }
      /**
      The last child of the fragment, or `null` if it is empty.
      */
      get lastChild() { return this.content.length ? this.content[this.content.length - 1] : null; }
      /**
      The number of child nodes in this fragment.
      */
      get childCount() { return this.content.length; }
      /**
      Get the child node at the given index. Raise an error when the
      index is out of range.
      */
      child(index) {
          let found = this.content[index];
          if (!found)
              throw new RangeError("Index " + index + " out of range for " + this);
          return found;
      }
      /**
      Get the child node at the given index, if it exists.
      */
      maybeChild(index) {
          return this.content[index] || null;
      }
      /**
      Call `f` for every child node, passing the node, its offset
      into this parent node, and its index.
      */
      forEach(f) {
          for (let i = 0, p = 0; i < this.content.length; i++) {
              let child = this.content[i];
              f(child, p, i);
              p += child.nodeSize;
          }
      }
      /**
      Find the first position at which this fragment and another
      fragment differ, or `null` if they are the same.
      */
      findDiffStart(other, pos = 0) {
          return findDiffStart(this, other, pos);
      }
      /**
      Find the first position, searching from the end, at which this
      fragment and the given fragment differ, or `null` if they are
      the same. Since this position will not be the same in both
      nodes, an object with two separate positions is returned.
      */
      findDiffEnd(other, pos = this.size, otherPos = other.size) {
          return findDiffEnd(this, other, pos, otherPos);
      }
      /**
      Find the index and inner offset corresponding to a given relative
      position in this fragment. The result object will be reused
      (overwritten) the next time the function is called. (Not public.)
      */
      findIndex(pos, round = -1) {
          if (pos == 0)
              return retIndex(0, pos);
          if (pos == this.size)
              return retIndex(this.content.length, pos);
          if (pos > this.size || pos < 0)
              throw new RangeError(`Position ${pos} outside of fragment (${this})`);
          for (let i = 0, curPos = 0;; i++) {
              let cur = this.child(i), end = curPos + cur.nodeSize;
              if (end >= pos) {
                  if (end == pos || round > 0)
                      return retIndex(i + 1, end);
                  return retIndex(i, curPos);
              }
              curPos = end;
          }
      }
      /**
      Return a debugging string that describes this fragment.
      */
      toString() { return "<" + this.toStringInner() + ">"; }
      /**
      @internal
      */
      toStringInner() { return this.content.join(", "); }
      /**
      Create a JSON-serializeable representation of this fragment.
      */
      toJSON() {
          return this.content.length ? this.content.map(n => n.toJSON()) : null;
      }
      /**
      Deserialize a fragment from its JSON representation.
      */
      static fromJSON(schema, value) {
          if (!value)
              return Fragment.empty;
          if (!Array.isArray(value))
              throw new RangeError("Invalid input for Fragment.fromJSON");
          return new Fragment(value.map(schema.nodeFromJSON));
      }
      /**
      Build a fragment from an array of nodes. Ensures that adjacent
      text nodes with the same marks are joined together.
      */
      static fromArray(array) {
          if (!array.length)
              return Fragment.empty;
          let joined, size = 0;
          for (let i = 0; i < array.length; i++) {
              let node = array[i];
              size += node.nodeSize;
              if (i && node.isText && array[i - 1].sameMarkup(node)) {
                  if (!joined)
                      joined = array.slice(0, i);
                  joined[joined.length - 1] = node
                      .withText(joined[joined.length - 1].text + node.text);
              }
              else if (joined) {
                  joined.push(node);
              }
          }
          return new Fragment(joined || array, size);
      }
      /**
      Create a fragment from something that can be interpreted as a
      set of nodes. For `null`, it returns the empty fragment. For a
      fragment, the fragment itself. For a node or array of nodes, a
      fragment containing those nodes.
      */
      static from(nodes) {
          if (!nodes)
              return Fragment.empty;
          if (nodes instanceof Fragment)
              return nodes;
          if (Array.isArray(nodes))
              return this.fromArray(nodes);
          if (nodes.attrs)
              return new Fragment([nodes], nodes.nodeSize);
          throw new RangeError("Can not convert " + nodes + " to a Fragment" +
              (nodes.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""));
      }
  }
  /**
  An empty fragment. Intended to be reused whenever a node doesn't
  contain anything (rather than allocating a new empty fragment for
  each leaf node).
  */
  Fragment.empty = new Fragment([], 0);
  const found = { index: 0, offset: 0 };
  function retIndex(index, offset) {
      found.index = index;
      found.offset = offset;
      return found;
  }

  function compareDeep(a, b) {
      if (a === b)
          return true;
      if (!(a && typeof a == "object") ||
          !(b && typeof b == "object"))
          return false;
      let array = Array.isArray(a);
      if (Array.isArray(b) != array)
          return false;
      if (array) {
          if (a.length != b.length)
              return false;
          for (let i = 0; i < a.length; i++)
              if (!compareDeep(a[i], b[i]))
                  return false;
      }
      else {
          for (let p in a)
              if (!(p in b) || !compareDeep(a[p], b[p]))
                  return false;
          for (let p in b)
              if (!(p in a))
                  return false;
      }
      return true;
  }

  /**
  A mark is a piece of information that can be attached to a node,
  such as it being emphasized, in code font, or a link. It has a
  type and optionally a set of attributes that provide further
  information (such as the target of the link). Marks are created
  through a `Schema`, which controls which types exist and which
  attributes they have.
  */
  class Mark {
      /**
      @internal
      */
      constructor(
      /**
      The type of this mark.
      */
      type, 
      /**
      The attributes associated with this mark.
      */
      attrs) {
          this.type = type;
          this.attrs = attrs;
      }
      /**
      Given a set of marks, create a new set which contains this one as
      well, in the right position. If this mark is already in the set,
      the set itself is returned. If any marks that are set to be
      [exclusive](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) with this mark are present,
      those are replaced by this one.
      */
      addToSet(set) {
          let copy, placed = false;
          for (let i = 0; i < set.length; i++) {
              let other = set[i];
              if (this.eq(other))
                  return set;
              if (this.type.excludes(other.type)) {
                  if (!copy)
                      copy = set.slice(0, i);
              }
              else if (other.type.excludes(this.type)) {
                  return set;
              }
              else {
                  if (!placed && other.type.rank > this.type.rank) {
                      if (!copy)
                          copy = set.slice(0, i);
                      copy.push(this);
                      placed = true;
                  }
                  if (copy)
                      copy.push(other);
              }
          }
          if (!copy)
              copy = set.slice();
          if (!placed)
              copy.push(this);
          return copy;
      }
      /**
      Remove this mark from the given set, returning a new set. If this
      mark is not in the set, the set itself is returned.
      */
      removeFromSet(set) {
          for (let i = 0; i < set.length; i++)
              if (this.eq(set[i]))
                  return set.slice(0, i).concat(set.slice(i + 1));
          return set;
      }
      /**
      Test whether this mark is in the given set of marks.
      */
      isInSet(set) {
          for (let i = 0; i < set.length; i++)
              if (this.eq(set[i]))
                  return true;
          return false;
      }
      /**
      Test whether this mark has the same type and attributes as
      another mark.
      */
      eq(other) {
          return this == other ||
              (this.type == other.type && compareDeep(this.attrs, other.attrs));
      }
      /**
      Convert this mark to a JSON-serializeable representation.
      */
      toJSON() {
          let obj = { type: this.type.name };
          for (let _ in this.attrs) {
              obj.attrs = this.attrs;
              break;
          }
          return obj;
      }
      /**
      Deserialize a mark from JSON.
      */
      static fromJSON(schema, json) {
          if (!json)
              throw new RangeError("Invalid input for Mark.fromJSON");
          let type = schema.marks[json.type];
          if (!type)
              throw new RangeError(`There is no mark type ${json.type} in this schema`);
          return type.create(json.attrs);
      }
      /**
      Test whether two sets of marks are identical.
      */
      static sameSet(a, b) {
          if (a == b)
              return true;
          if (a.length != b.length)
              return false;
          for (let i = 0; i < a.length; i++)
              if (!a[i].eq(b[i]))
                  return false;
          return true;
      }
      /**
      Create a properly sorted mark set from null, a single mark, or an
      unsorted array of marks.
      */
      static setFrom(marks) {
          if (!marks || Array.isArray(marks) && marks.length == 0)
              return Mark.none;
          if (marks instanceof Mark)
              return [marks];
          let copy = marks.slice();
          copy.sort((a, b) => a.type.rank - b.type.rank);
          return copy;
      }
  }
  /**
  The empty set of marks.
  */
  Mark.none = [];

  /**
  Error type raised by [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) when
  given an invalid replacement.
  */
  class ReplaceError extends Error {
  }
  /*
  ReplaceError = function(this: any, message: string) {
    let err = Error.call(this, message)
    ;(err as any).__proto__ = ReplaceError.prototype
    return err
  } as any

  ReplaceError.prototype = Object.create(Error.prototype)
  ReplaceError.prototype.constructor = ReplaceError
  ReplaceError.prototype.name = "ReplaceError"
  */
  /**
  A slice represents a piece cut out of a larger document. It
  stores not only a fragment, but also the depth up to which nodes on
  both side are ‘open’ (cut through).
  */
  class Slice {
      /**
      Create a slice. When specifying a non-zero open depth, you must
      make sure that there are nodes of at least that depth at the
      appropriate side of the fragment—i.e. if the fragment is an
      empty paragraph node, `openStart` and `openEnd` can't be greater
      than 1.
      
      It is not necessary for the content of open nodes to conform to
      the schema's content constraints, though it should be a valid
      start/end/middle for such a node, depending on which sides are
      open.
      */
      constructor(
      /**
      The slice's content.
      */
      content, 
      /**
      The open depth at the start of the fragment.
      */
      openStart, 
      /**
      The open depth at the end.
      */
      openEnd) {
          this.content = content;
          this.openStart = openStart;
          this.openEnd = openEnd;
      }
      /**
      The size this slice would add when inserted into a document.
      */
      get size() {
          return this.content.size - this.openStart - this.openEnd;
      }
      /**
      @internal
      */
      insertAt(pos, fragment) {
          let content = insertInto(this.content, pos + this.openStart, fragment);
          return content && new Slice(content, this.openStart, this.openEnd);
      }
      /**
      @internal
      */
      removeBetween(from, to) {
          return new Slice(removeRange(this.content, from + this.openStart, to + this.openStart), this.openStart, this.openEnd);
      }
      /**
      Tests whether this slice is equal to another slice.
      */
      eq(other) {
          return this.content.eq(other.content) && this.openStart == other.openStart && this.openEnd == other.openEnd;
      }
      /**
      @internal
      */
      toString() {
          return this.content + "(" + this.openStart + "," + this.openEnd + ")";
      }
      /**
      Convert a slice to a JSON-serializable representation.
      */
      toJSON() {
          if (!this.content.size)
              return null;
          let json = { content: this.content.toJSON() };
          if (this.openStart > 0)
              json.openStart = this.openStart;
          if (this.openEnd > 0)
              json.openEnd = this.openEnd;
          return json;
      }
      /**
      Deserialize a slice from its JSON representation.
      */
      static fromJSON(schema, json) {
          if (!json)
              return Slice.empty;
          let openStart = json.openStart || 0, openEnd = json.openEnd || 0;
          if (typeof openStart != "number" || typeof openEnd != "number")
              throw new RangeError("Invalid input for Slice.fromJSON");
          return new Slice(Fragment.fromJSON(schema, json.content), openStart, openEnd);
      }
      /**
      Create a slice from a fragment by taking the maximum possible
      open value on both side of the fragment.
      */
      static maxOpen(fragment, openIsolating = true) {
          let openStart = 0, openEnd = 0;
          for (let n = fragment.firstChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.firstChild)
              openStart++;
          for (let n = fragment.lastChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.lastChild)
              openEnd++;
          return new Slice(fragment, openStart, openEnd);
      }
  }
  /**
  The empty slice.
  */
  Slice.empty = new Slice(Fragment.empty, 0, 0);
  function removeRange(content, from, to) {
      let { index, offset } = content.findIndex(from), child = content.maybeChild(index);
      let { index: indexTo, offset: offsetTo } = content.findIndex(to);
      if (offset == from || child.isText) {
          if (offsetTo != to && !content.child(indexTo).isText)
              throw new RangeError("Removing non-flat range");
          return content.cut(0, from).append(content.cut(to));
      }
      if (index != indexTo)
          throw new RangeError("Removing non-flat range");
      return content.replaceChild(index, child.copy(removeRange(child.content, from - offset - 1, to - offset - 1)));
  }
  function insertInto(content, dist, insert, parent) {
      let { index, offset } = content.findIndex(dist), child = content.maybeChild(index);
      if (offset == dist || child.isText) {
          if (parent && !parent.canReplace(index, index, insert))
              return null;
          return content.cut(0, dist).append(insert).append(content.cut(dist));
      }
      let inner = insertInto(child.content, dist - offset - 1, insert);
      return inner && content.replaceChild(index, child.copy(inner));
  }
  function replace($from, $to, slice) {
      if (slice.openStart > $from.depth)
          throw new ReplaceError("Inserted content deeper than insertion position");
      if ($from.depth - slice.openStart != $to.depth - slice.openEnd)
          throw new ReplaceError("Inconsistent open depths");
      return replaceOuter($from, $to, slice, 0);
  }
  function replaceOuter($from, $to, slice, depth) {
      let index = $from.index(depth), node = $from.node(depth);
      if (index == $to.index(depth) && depth < $from.depth - slice.openStart) {
          let inner = replaceOuter($from, $to, slice, depth + 1);
          return node.copy(node.content.replaceChild(index, inner));
      }
      else if (!slice.content.size) {
          return close(node, replaceTwoWay($from, $to, depth));
      }
      else if (!slice.openStart && !slice.openEnd && $from.depth == depth && $to.depth == depth) { // Simple, flat case
          let parent = $from.parent, content = parent.content;
          return close(parent, content.cut(0, $from.parentOffset).append(slice.content).append(content.cut($to.parentOffset)));
      }
      else {
          let { start, end } = prepareSliceForReplace(slice, $from);
          return close(node, replaceThreeWay($from, start, end, $to, depth));
      }
  }
  function checkJoin(main, sub) {
      if (!sub.type.compatibleContent(main.type))
          throw new ReplaceError("Cannot join " + sub.type.name + " onto " + main.type.name);
  }
  function joinable($before, $after, depth) {
      let node = $before.node(depth);
      checkJoin(node, $after.node(depth));
      return node;
  }
  function addNode(child, target) {
      let last = target.length - 1;
      if (last >= 0 && child.isText && child.sameMarkup(target[last]))
          target[last] = child.withText(target[last].text + child.text);
      else
          target.push(child);
  }
  function addRange($start, $end, depth, target) {
      let node = ($end || $start).node(depth);
      let startIndex = 0, endIndex = $end ? $end.index(depth) : node.childCount;
      if ($start) {
          startIndex = $start.index(depth);
          if ($start.depth > depth) {
              startIndex++;
          }
          else if ($start.textOffset) {
              addNode($start.nodeAfter, target);
              startIndex++;
          }
      }
      for (let i = startIndex; i < endIndex; i++)
          addNode(node.child(i), target);
      if ($end && $end.depth == depth && $end.textOffset)
          addNode($end.nodeBefore, target);
  }
  function close(node, content) {
      if (!node.type.validContent(content))
          throw new ReplaceError("Invalid content for node " + node.type.name);
      return node.copy(content);
  }
  function replaceThreeWay($from, $start, $end, $to, depth) {
      let openStart = $from.depth > depth && joinable($from, $start, depth + 1);
      let openEnd = $to.depth > depth && joinable($end, $to, depth + 1);
      let content = [];
      addRange(null, $from, depth, content);
      if (openStart && openEnd && $start.index(depth) == $end.index(depth)) {
          checkJoin(openStart, openEnd);
          addNode(close(openStart, replaceThreeWay($from, $start, $end, $to, depth + 1)), content);
      }
      else {
          if (openStart)
              addNode(close(openStart, replaceTwoWay($from, $start, depth + 1)), content);
          addRange($start, $end, depth, content);
          if (openEnd)
              addNode(close(openEnd, replaceTwoWay($end, $to, depth + 1)), content);
      }
      addRange($to, null, depth, content);
      return new Fragment(content);
  }
  function replaceTwoWay($from, $to, depth) {
      let content = [];
      addRange(null, $from, depth, content);
      if ($from.depth > depth) {
          let type = joinable($from, $to, depth + 1);
          addNode(close(type, replaceTwoWay($from, $to, depth + 1)), content);
      }
      addRange($to, null, depth, content);
      return new Fragment(content);
  }
  function prepareSliceForReplace(slice, $along) {
      let extra = $along.depth - slice.openStart, parent = $along.node(extra);
      let node = parent.copy(slice.content);
      for (let i = extra - 1; i >= 0; i--)
          node = $along.node(i).copy(Fragment.from(node));
      return { start: node.resolveNoCache(slice.openStart + extra),
          end: node.resolveNoCache(node.content.size - slice.openEnd - extra) };
  }

  /**
  You can [_resolve_](https://prosemirror.net/docs/ref/#model.Node.resolve) a position to get more
  information about it. Objects of this class represent such a
  resolved position, providing various pieces of context
  information, and some helper methods.

  Throughout this interface, methods that take an optional `depth`
  parameter will interpret undefined as `this.depth` and negative
  numbers as `this.depth + value`.
  */
  class ResolvedPos {
      /**
      @internal
      */
      constructor(
      /**
      The position that was resolved.
      */
      pos, 
      /**
      @internal
      */
      path, 
      /**
      The offset this position has into its parent node.
      */
      parentOffset) {
          this.pos = pos;
          this.path = path;
          this.parentOffset = parentOffset;
          this.depth = path.length / 3 - 1;
      }
      /**
      @internal
      */
      resolveDepth(val) {
          if (val == null)
              return this.depth;
          if (val < 0)
              return this.depth + val;
          return val;
      }
      /**
      The parent node that the position points into. Note that even if
      a position points into a text node, that node is not considered
      the parent—text nodes are ‘flat’ in this model, and have no content.
      */
      get parent() { return this.node(this.depth); }
      /**
      The root node in which the position was resolved.
      */
      get doc() { return this.node(0); }
      /**
      The ancestor node at the given level. `p.node(p.depth)` is the
      same as `p.parent`.
      */
      node(depth) { return this.path[this.resolveDepth(depth) * 3]; }
      /**
      The index into the ancestor at the given level. If this points
      at the 3rd node in the 2nd paragraph on the top level, for
      example, `p.index(0)` is 1 and `p.index(1)` is 2.
      */
      index(depth) { return this.path[this.resolveDepth(depth) * 3 + 1]; }
      /**
      The index pointing after this position into the ancestor at the
      given level.
      */
      indexAfter(depth) {
          depth = this.resolveDepth(depth);
          return this.index(depth) + (depth == this.depth && !this.textOffset ? 0 : 1);
      }
      /**
      The (absolute) position at the start of the node at the given
      level.
      */
      start(depth) {
          depth = this.resolveDepth(depth);
          return depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
      }
      /**
      The (absolute) position at the end of the node at the given
      level.
      */
      end(depth) {
          depth = this.resolveDepth(depth);
          return this.start(depth) + this.node(depth).content.size;
      }
      /**
      The (absolute) position directly before the wrapping node at the
      given level, or, when `depth` is `this.depth + 1`, the original
      position.
      */
      before(depth) {
          depth = this.resolveDepth(depth);
          if (!depth)
              throw new RangeError("There is no position before the top-level node");
          return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1];
      }
      /**
      The (absolute) position directly after the wrapping node at the
      given level, or the original position when `depth` is `this.depth + 1`.
      */
      after(depth) {
          depth = this.resolveDepth(depth);
          if (!depth)
              throw new RangeError("There is no position after the top-level node");
          return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1] + this.path[depth * 3].nodeSize;
      }
      /**
      When this position points into a text node, this returns the
      distance between the position and the start of the text node.
      Will be zero for positions that point between nodes.
      */
      get textOffset() { return this.pos - this.path[this.path.length - 1]; }
      /**
      Get the node directly after the position, if any. If the position
      points into a text node, only the part of that node after the
      position is returned.
      */
      get nodeAfter() {
          let parent = this.parent, index = this.index(this.depth);
          if (index == parent.childCount)
              return null;
          let dOff = this.pos - this.path[this.path.length - 1], child = parent.child(index);
          return dOff ? parent.child(index).cut(dOff) : child;
      }
      /**
      Get the node directly before the position, if any. If the
      position points into a text node, only the part of that node
      before the position is returned.
      */
      get nodeBefore() {
          let index = this.index(this.depth);
          let dOff = this.pos - this.path[this.path.length - 1];
          if (dOff)
              return this.parent.child(index).cut(0, dOff);
          return index == 0 ? null : this.parent.child(index - 1);
      }
      /**
      Get the position at the given index in the parent node at the
      given depth (which defaults to `this.depth`).
      */
      posAtIndex(index, depth) {
          depth = this.resolveDepth(depth);
          let node = this.path[depth * 3], pos = depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
          for (let i = 0; i < index; i++)
              pos += node.child(i).nodeSize;
          return pos;
      }
      /**
      Get the marks at this position, factoring in the surrounding
      marks' [`inclusive`](https://prosemirror.net/docs/ref/#model.MarkSpec.inclusive) property. If the
      position is at the start of a non-empty node, the marks of the
      node after it (if any) are returned.
      */
      marks() {
          let parent = this.parent, index = this.index();
          // In an empty parent, return the empty array
          if (parent.content.size == 0)
              return Mark.none;
          // When inside a text node, just return the text node's marks
          if (this.textOffset)
              return parent.child(index).marks;
          let main = parent.maybeChild(index - 1), other = parent.maybeChild(index);
          // If the `after` flag is true of there is no node before, make
          // the node after this position the main reference.
          if (!main) {
              let tmp = main;
              main = other;
              other = tmp;
          }
          // Use all marks in the main node, except those that have
          // `inclusive` set to false and are not present in the other node.
          let marks = main.marks;
          for (var i = 0; i < marks.length; i++)
              if (marks[i].type.spec.inclusive === false && (!other || !marks[i].isInSet(other.marks)))
                  marks = marks[i--].removeFromSet(marks);
          return marks;
      }
      /**
      Get the marks after the current position, if any, except those
      that are non-inclusive and not present at position `$end`. This
      is mostly useful for getting the set of marks to preserve after a
      deletion. Will return `null` if this position is at the end of
      its parent node or its parent node isn't a textblock (in which
      case no marks should be preserved).
      */
      marksAcross($end) {
          let after = this.parent.maybeChild(this.index());
          if (!after || !after.isInline)
              return null;
          let marks = after.marks, next = $end.parent.maybeChild($end.index());
          for (var i = 0; i < marks.length; i++)
              if (marks[i].type.spec.inclusive === false && (!next || !marks[i].isInSet(next.marks)))
                  marks = marks[i--].removeFromSet(marks);
          return marks;
      }
      /**
      The depth up to which this position and the given (non-resolved)
      position share the same parent nodes.
      */
      sharedDepth(pos) {
          for (let depth = this.depth; depth > 0; depth--)
              if (this.start(depth) <= pos && this.end(depth) >= pos)
                  return depth;
          return 0;
      }
      /**
      Returns a range based on the place where this position and the
      given position diverge around block content. If both point into
      the same textblock, for example, a range around that textblock
      will be returned. If they point into different blocks, the range
      around those blocks in their shared ancestor is returned. You can
      pass in an optional predicate that will be called with a parent
      node to see if a range into that parent is acceptable.
      */
      blockRange(other = this, pred) {
          if (other.pos < this.pos)
              return other.blockRange(this);
          for (let d = this.depth - (this.parent.inlineContent || this.pos == other.pos ? 1 : 0); d >= 0; d--)
              if (other.pos <= this.end(d) && (!pred || pred(this.node(d))))
                  return new NodeRange(this, other, d);
          return null;
      }
      /**
      Query whether the given position shares the same parent node.
      */
      sameParent(other) {
          return this.pos - this.parentOffset == other.pos - other.parentOffset;
      }
      /**
      Return the greater of this and the given position.
      */
      max(other) {
          return other.pos > this.pos ? other : this;
      }
      /**
      Return the smaller of this and the given position.
      */
      min(other) {
          return other.pos < this.pos ? other : this;
      }
      /**
      @internal
      */
      toString() {
          let str = "";
          for (let i = 1; i <= this.depth; i++)
              str += (str ? "/" : "") + this.node(i).type.name + "_" + this.index(i - 1);
          return str + ":" + this.parentOffset;
      }
      /**
      @internal
      */
      static resolve(doc, pos) {
          if (!(pos >= 0 && pos <= doc.content.size))
              throw new RangeError("Position " + pos + " out of range");
          let path = [];
          let start = 0, parentOffset = pos;
          for (let node = doc;;) {
              let { index, offset } = node.content.findIndex(parentOffset);
              let rem = parentOffset - offset;
              path.push(node, index, start + offset);
              if (!rem)
                  break;
              node = node.child(index);
              if (node.isText)
                  break;
              parentOffset = rem - 1;
              start += offset + 1;
          }
          return new ResolvedPos(pos, path, parentOffset);
      }
      /**
      @internal
      */
      static resolveCached(doc, pos) {
          for (let i = 0; i < resolveCache.length; i++) {
              let cached = resolveCache[i];
              if (cached.pos == pos && cached.doc == doc)
                  return cached;
          }
          let result = resolveCache[resolveCachePos] = ResolvedPos.resolve(doc, pos);
          resolveCachePos = (resolveCachePos + 1) % resolveCacheSize;
          return result;
      }
  }
  let resolveCache = [], resolveCachePos = 0, resolveCacheSize = 12;
  /**
  Represents a flat range of content, i.e. one that starts and
  ends in the same node.
  */
  class NodeRange {
      /**
      Construct a node range. `$from` and `$to` should point into the
      same node until at least the given `depth`, since a node range
      denotes an adjacent set of nodes in a single parent node.
      */
      constructor(
      /**
      A resolved position along the start of the content. May have a
      `depth` greater than this object's `depth` property, since
      these are the positions that were used to compute the range,
      not re-resolved positions directly at its boundaries.
      */
      $from, 
      /**
      A position along the end of the content. See
      caveat for [`$from`](https://prosemirror.net/docs/ref/#model.NodeRange.$from).
      */
      $to, 
      /**
      The depth of the node that this range points into.
      */
      depth) {
          this.$from = $from;
          this.$to = $to;
          this.depth = depth;
      }
      /**
      The position at the start of the range.
      */
      get start() { return this.$from.before(this.depth + 1); }
      /**
      The position at the end of the range.
      */
      get end() { return this.$to.after(this.depth + 1); }
      /**
      The parent node that the range points into.
      */
      get parent() { return this.$from.node(this.depth); }
      /**
      The start index of the range in the parent node.
      */
      get startIndex() { return this.$from.index(this.depth); }
      /**
      The end index of the range in the parent node.
      */
      get endIndex() { return this.$to.indexAfter(this.depth); }
  }

  const emptyAttrs = Object.create(null);
  /**
  This class represents a node in the tree that makes up a
  ProseMirror document. So a document is an instance of `Node`, with
  children that are also instances of `Node`.

  Nodes are persistent data structures. Instead of changing them, you
  create new ones with the content you want. Old ones keep pointing
  at the old document shape. This is made cheaper by sharing
  structure between the old and new data as much as possible, which a
  tree shape like this (without back pointers) makes easy.

  **Do not** directly mutate the properties of a `Node` object. See
  [the guide](/docs/guide/#doc) for more information.
  */
  class Node {
      /**
      @internal
      */
      constructor(
      /**
      The type of node that this is.
      */
      type, 
      /**
      An object mapping attribute names to values. The kind of
      attributes allowed and required are
      [determined](https://prosemirror.net/docs/ref/#model.NodeSpec.attrs) by the node type.
      */
      attrs, 
      // A fragment holding the node's children.
      content, 
      /**
      The marks (things like whether it is emphasized or part of a
      link) applied to this node.
      */
      marks = Mark.none) {
          this.type = type;
          this.attrs = attrs;
          this.marks = marks;
          this.content = content || Fragment.empty;
      }
      /**
      The size of this node, as defined by the integer-based [indexing
      scheme](/docs/guide/#doc.indexing). For text nodes, this is the
      amount of characters. For other leaf nodes, it is one. For
      non-leaf nodes, it is the size of the content plus two (the
      start and end token).
      */
      get nodeSize() { return this.isLeaf ? 1 : 2 + this.content.size; }
      /**
      The number of children that the node has.
      */
      get childCount() { return this.content.childCount; }
      /**
      Get the child node at the given index. Raises an error when the
      index is out of range.
      */
      child(index) { return this.content.child(index); }
      /**
      Get the child node at the given index, if it exists.
      */
      maybeChild(index) { return this.content.maybeChild(index); }
      /**
      Call `f` for every child node, passing the node, its offset
      into this parent node, and its index.
      */
      forEach(f) { this.content.forEach(f); }
      /**
      Invoke a callback for all descendant nodes recursively between
      the given two positions that are relative to start of this
      node's content. The callback is invoked with the node, its
      parent-relative position, its parent node, and its child index.
      When the callback returns false for a given node, that node's
      children will not be recursed over. The last parameter can be
      used to specify a starting position to count from.
      */
      nodesBetween(from, to, f, startPos = 0) {
          this.content.nodesBetween(from, to, f, startPos, this);
      }
      /**
      Call the given callback for every descendant node. Doesn't
      descend into a node when the callback returns `false`.
      */
      descendants(f) {
          this.nodesBetween(0, this.content.size, f);
      }
      /**
      Concatenates all the text nodes found in this fragment and its
      children.
      */
      get textContent() {
          return (this.isLeaf && this.type.spec.leafText)
              ? this.type.spec.leafText(this)
              : this.textBetween(0, this.content.size, "");
      }
      /**
      Get all text between positions `from` and `to`. When
      `blockSeparator` is given, it will be inserted to separate text
      from different block nodes. If `leafText` is given, it'll be
      inserted for every non-text leaf node encountered, otherwise
      [`leafText`](https://prosemirror.net/docs/ref/#model.NodeSpec^leafText) will be used.
      */
      textBetween(from, to, blockSeparator, leafText) {
          return this.content.textBetween(from, to, blockSeparator, leafText);
      }
      /**
      Returns this node's first child, or `null` if there are no
      children.
      */
      get firstChild() { return this.content.firstChild; }
      /**
      Returns this node's last child, or `null` if there are no
      children.
      */
      get lastChild() { return this.content.lastChild; }
      /**
      Test whether two nodes represent the same piece of document.
      */
      eq(other) {
          return this == other || (this.sameMarkup(other) && this.content.eq(other.content));
      }
      /**
      Compare the markup (type, attributes, and marks) of this node to
      those of another. Returns `true` if both have the same markup.
      */
      sameMarkup(other) {
          return this.hasMarkup(other.type, other.attrs, other.marks);
      }
      /**
      Check whether this node's markup correspond to the given type,
      attributes, and marks.
      */
      hasMarkup(type, attrs, marks) {
          return this.type == type &&
              compareDeep(this.attrs, attrs || type.defaultAttrs || emptyAttrs) &&
              Mark.sameSet(this.marks, marks || Mark.none);
      }
      /**
      Create a new node with the same markup as this node, containing
      the given content (or empty, if no content is given).
      */
      copy(content = null) {
          if (content == this.content)
              return this;
          return new Node(this.type, this.attrs, content, this.marks);
      }
      /**
      Create a copy of this node, with the given set of marks instead
      of the node's own marks.
      */
      mark(marks) {
          return marks == this.marks ? this : new Node(this.type, this.attrs, this.content, marks);
      }
      /**
      Create a copy of this node with only the content between the
      given positions. If `to` is not given, it defaults to the end of
      the node.
      */
      cut(from, to = this.content.size) {
          if (from == 0 && to == this.content.size)
              return this;
          return this.copy(this.content.cut(from, to));
      }
      /**
      Cut out the part of the document between the given positions, and
      return it as a `Slice` object.
      */
      slice(from, to = this.content.size, includeParents = false) {
          if (from == to)
              return Slice.empty;
          let $from = this.resolve(from), $to = this.resolve(to);
          let depth = includeParents ? 0 : $from.sharedDepth(to);
          let start = $from.start(depth), node = $from.node(depth);
          let content = node.content.cut($from.pos - start, $to.pos - start);
          return new Slice(content, $from.depth - depth, $to.depth - depth);
      }
      /**
      Replace the part of the document between the given positions with
      the given slice. The slice must 'fit', meaning its open sides
      must be able to connect to the surrounding content, and its
      content nodes must be valid children for the node they are placed
      into. If any of this is violated, an error of type
      [`ReplaceError`](https://prosemirror.net/docs/ref/#model.ReplaceError) is thrown.
      */
      replace(from, to, slice) {
          return replace(this.resolve(from), this.resolve(to), slice);
      }
      /**
      Find the node directly after the given position.
      */
      nodeAt(pos) {
          for (let node = this;;) {
              let { index, offset } = node.content.findIndex(pos);
              node = node.maybeChild(index);
              if (!node)
                  return null;
              if (offset == pos || node.isText)
                  return node;
              pos -= offset + 1;
          }
      }
      /**
      Find the (direct) child node after the given offset, if any,
      and return it along with its index and offset relative to this
      node.
      */
      childAfter(pos) {
          let { index, offset } = this.content.findIndex(pos);
          return { node: this.content.maybeChild(index), index, offset };
      }
      /**
      Find the (direct) child node before the given offset, if any,
      and return it along with its index and offset relative to this
      node.
      */
      childBefore(pos) {
          if (pos == 0)
              return { node: null, index: 0, offset: 0 };
          let { index, offset } = this.content.findIndex(pos);
          if (offset < pos)
              return { node: this.content.child(index), index, offset };
          let node = this.content.child(index - 1);
          return { node, index: index - 1, offset: offset - node.nodeSize };
      }
      /**
      Resolve the given position in the document, returning an
      [object](https://prosemirror.net/docs/ref/#model.ResolvedPos) with information about its context.
      */
      resolve(pos) { return ResolvedPos.resolveCached(this, pos); }
      /**
      @internal
      */
      resolveNoCache(pos) { return ResolvedPos.resolve(this, pos); }
      /**
      Test whether a given mark or mark type occurs in this document
      between the two given positions.
      */
      rangeHasMark(from, to, type) {
          let found = false;
          if (to > from)
              this.nodesBetween(from, to, node => {
                  if (type.isInSet(node.marks))
                      found = true;
                  return !found;
              });
          return found;
      }
      /**
      True when this is a block (non-inline node)
      */
      get isBlock() { return this.type.isBlock; }
      /**
      True when this is a textblock node, a block node with inline
      content.
      */
      get isTextblock() { return this.type.isTextblock; }
      /**
      True when this node allows inline content.
      */
      get inlineContent() { return this.type.inlineContent; }
      /**
      True when this is an inline node (a text node or a node that can
      appear among text).
      */
      get isInline() { return this.type.isInline; }
      /**
      True when this is a text node.
      */
      get isText() { return this.type.isText; }
      /**
      True when this is a leaf node.
      */
      get isLeaf() { return this.type.isLeaf; }
      /**
      True when this is an atom, i.e. when it does not have directly
      editable content. This is usually the same as `isLeaf`, but can
      be configured with the [`atom` property](https://prosemirror.net/docs/ref/#model.NodeSpec.atom)
      on a node's spec (typically used when the node is displayed as
      an uneditable [node view](https://prosemirror.net/docs/ref/#view.NodeView)).
      */
      get isAtom() { return this.type.isAtom; }
      /**
      Return a string representation of this node for debugging
      purposes.
      */
      toString() {
          if (this.type.spec.toDebugString)
              return this.type.spec.toDebugString(this);
          let name = this.type.name;
          if (this.content.size)
              name += "(" + this.content.toStringInner() + ")";
          return wrapMarks(this.marks, name);
      }
      /**
      Get the content match in this node at the given index.
      */
      contentMatchAt(index) {
          let match = this.type.contentMatch.matchFragment(this.content, 0, index);
          if (!match)
              throw new Error("Called contentMatchAt on a node with invalid content");
          return match;
      }
      /**
      Test whether replacing the range between `from` and `to` (by
      child index) with the given replacement fragment (which defaults
      to the empty fragment) would leave the node's content valid. You
      can optionally pass `start` and `end` indices into the
      replacement fragment.
      */
      canReplace(from, to, replacement = Fragment.empty, start = 0, end = replacement.childCount) {
          let one = this.contentMatchAt(from).matchFragment(replacement, start, end);
          let two = one && one.matchFragment(this.content, to);
          if (!two || !two.validEnd)
              return false;
          for (let i = start; i < end; i++)
              if (!this.type.allowsMarks(replacement.child(i).marks))
                  return false;
          return true;
      }
      /**
      Test whether replacing the range `from` to `to` (by index) with
      a node of the given type would leave the node's content valid.
      */
      canReplaceWith(from, to, type, marks) {
          if (marks && !this.type.allowsMarks(marks))
              return false;
          let start = this.contentMatchAt(from).matchType(type);
          let end = start && start.matchFragment(this.content, to);
          return end ? end.validEnd : false;
      }
      /**
      Test whether the given node's content could be appended to this
      node. If that node is empty, this will only return true if there
      is at least one node type that can appear in both nodes (to avoid
      merging completely incompatible nodes).
      */
      canAppend(other) {
          if (other.content.size)
              return this.canReplace(this.childCount, this.childCount, other.content);
          else
              return this.type.compatibleContent(other.type);
      }
      /**
      Check whether this node and its descendants conform to the
      schema, and raise error when they do not.
      */
      check() {
          if (!this.type.validContent(this.content))
              throw new RangeError(`Invalid content for node ${this.type.name}: ${this.content.toString().slice(0, 50)}`);
          let copy = Mark.none;
          for (let i = 0; i < this.marks.length; i++)
              copy = this.marks[i].addToSet(copy);
          if (!Mark.sameSet(copy, this.marks))
              throw new RangeError(`Invalid collection of marks for node ${this.type.name}: ${this.marks.map(m => m.type.name)}`);
          this.content.forEach(node => node.check());
      }
      /**
      Return a JSON-serializeable representation of this node.
      */
      toJSON() {
          let obj = { type: this.type.name };
          for (let _ in this.attrs) {
              obj.attrs = this.attrs;
              break;
          }
          if (this.content.size)
              obj.content = this.content.toJSON();
          if (this.marks.length)
              obj.marks = this.marks.map(n => n.toJSON());
          return obj;
      }
      /**
      Deserialize a node from its JSON representation.
      */
      static fromJSON(schema, json) {
          if (!json)
              throw new RangeError("Invalid input for Node.fromJSON");
          let marks = null;
          if (json.marks) {
              if (!Array.isArray(json.marks))
                  throw new RangeError("Invalid mark data for Node.fromJSON");
              marks = json.marks.map(schema.markFromJSON);
          }
          if (json.type == "text") {
              if (typeof json.text != "string")
                  throw new RangeError("Invalid text node in JSON");
              return schema.text(json.text, marks);
          }
          let content = Fragment.fromJSON(schema, json.content);
          return schema.nodeType(json.type).create(json.attrs, content, marks);
      }
  }
  Node.prototype.text = undefined;
  class TextNode extends Node {
      /**
      @internal
      */
      constructor(type, attrs, content, marks) {
          super(type, attrs, null, marks);
          if (!content)
              throw new RangeError("Empty text nodes are not allowed");
          this.text = content;
      }
      toString() {
          if (this.type.spec.toDebugString)
              return this.type.spec.toDebugString(this);
          return wrapMarks(this.marks, JSON.stringify(this.text));
      }
      get textContent() { return this.text; }
      textBetween(from, to) { return this.text.slice(from, to); }
      get nodeSize() { return this.text.length; }
      mark(marks) {
          return marks == this.marks ? this : new TextNode(this.type, this.attrs, this.text, marks);
      }
      withText(text) {
          if (text == this.text)
              return this;
          return new TextNode(this.type, this.attrs, text, this.marks);
      }
      cut(from = 0, to = this.text.length) {
          if (from == 0 && to == this.text.length)
              return this;
          return this.withText(this.text.slice(from, to));
      }
      eq(other) {
          return this.sameMarkup(other) && this.text == other.text;
      }
      toJSON() {
          let base = super.toJSON();
          base.text = this.text;
          return base;
      }
  }
  function wrapMarks(marks, str) {
      for (let i = marks.length - 1; i >= 0; i--)
          str = marks[i].type.name + "(" + str + ")";
      return str;
  }

  /**
  Instances of this class represent a match state of a node type's
  [content expression](https://prosemirror.net/docs/ref/#model.NodeSpec.content), and can be used to
  find out whether further content matches here, and whether a given
  position is a valid end of the node.
  */
  class ContentMatch {
      /**
      @internal
      */
      constructor(
      /**
      True when this match state represents a valid end of the node.
      */
      validEnd) {
          this.validEnd = validEnd;
          /**
          @internal
          */
          this.next = [];
          /**
          @internal
          */
          this.wrapCache = [];
      }
      /**
      @internal
      */
      static parse(string, nodeTypes) {
          let stream = new TokenStream(string, nodeTypes);
          if (stream.next == null)
              return ContentMatch.empty;
          let expr = parseExpr(stream);
          if (stream.next)
              stream.err("Unexpected trailing text");
          let match = dfa(nfa(expr));
          checkForDeadEnds(match, stream);
          return match;
      }
      /**
      Match a node type, returning a match after that node if
      successful.
      */
      matchType(type) {
          for (let i = 0; i < this.next.length; i++)
              if (this.next[i].type == type)
                  return this.next[i].next;
          return null;
      }
      /**
      Try to match a fragment. Returns the resulting match when
      successful.
      */
      matchFragment(frag, start = 0, end = frag.childCount) {
          let cur = this;
          for (let i = start; cur && i < end; i++)
              cur = cur.matchType(frag.child(i).type);
          return cur;
      }
      /**
      @internal
      */
      get inlineContent() {
          return this.next.length && this.next[0].type.isInline;
      }
      /**
      Get the first matching node type at this match position that can
      be generated.
      */
      get defaultType() {
          for (let i = 0; i < this.next.length; i++) {
              let { type } = this.next[i];
              if (!(type.isText || type.hasRequiredAttrs()))
                  return type;
          }
          return null;
      }
      /**
      @internal
      */
      compatible(other) {
          for (let i = 0; i < this.next.length; i++)
              for (let j = 0; j < other.next.length; j++)
                  if (this.next[i].type == other.next[j].type)
                      return true;
          return false;
      }
      /**
      Try to match the given fragment, and if that fails, see if it can
      be made to match by inserting nodes in front of it. When
      successful, return a fragment of inserted nodes (which may be
      empty if nothing had to be inserted). When `toEnd` is true, only
      return a fragment if the resulting match goes to the end of the
      content expression.
      */
      fillBefore(after, toEnd = false, startIndex = 0) {
          let seen = [this];
          function search(match, types) {
              let finished = match.matchFragment(after, startIndex);
              if (finished && (!toEnd || finished.validEnd))
                  return Fragment.from(types.map(tp => tp.createAndFill()));
              for (let i = 0; i < match.next.length; i++) {
                  let { type, next } = match.next[i];
                  if (!(type.isText || type.hasRequiredAttrs()) && seen.indexOf(next) == -1) {
                      seen.push(next);
                      let found = search(next, types.concat(type));
                      if (found)
                          return found;
                  }
              }
              return null;
          }
          return search(this, []);
      }
      /**
      Find a set of wrapping node types that would allow a node of the
      given type to appear at this position. The result may be empty
      (when it fits directly) and will be null when no such wrapping
      exists.
      */
      findWrapping(target) {
          for (let i = 0; i < this.wrapCache.length; i += 2)
              if (this.wrapCache[i] == target)
                  return this.wrapCache[i + 1];
          let computed = this.computeWrapping(target);
          this.wrapCache.push(target, computed);
          return computed;
      }
      /**
      @internal
      */
      computeWrapping(target) {
          let seen = Object.create(null), active = [{ match: this, type: null, via: null }];
          while (active.length) {
              let current = active.shift(), match = current.match;
              if (match.matchType(target)) {
                  let result = [];
                  for (let obj = current; obj.type; obj = obj.via)
                      result.push(obj.type);
                  return result.reverse();
              }
              for (let i = 0; i < match.next.length; i++) {
                  let { type, next } = match.next[i];
                  if (!type.isLeaf && !type.hasRequiredAttrs() && !(type.name in seen) && (!current.type || next.validEnd)) {
                      active.push({ match: type.contentMatch, type, via: current });
                      seen[type.name] = true;
                  }
              }
          }
          return null;
      }
      /**
      The number of outgoing edges this node has in the finite
      automaton that describes the content expression.
      */
      get edgeCount() {
          return this.next.length;
      }
      /**
      Get the _n_​th outgoing edge from this node in the finite
      automaton that describes the content expression.
      */
      edge(n) {
          if (n >= this.next.length)
              throw new RangeError(`There's no ${n}th edge in this content match`);
          return this.next[n];
      }
      /**
      @internal
      */
      toString() {
          let seen = [];
          function scan(m) {
              seen.push(m);
              for (let i = 0; i < m.next.length; i++)
                  if (seen.indexOf(m.next[i].next) == -1)
                      scan(m.next[i].next);
          }
          scan(this);
          return seen.map((m, i) => {
              let out = i + (m.validEnd ? "*" : " ") + " ";
              for (let i = 0; i < m.next.length; i++)
                  out += (i ? ", " : "") + m.next[i].type.name + "->" + seen.indexOf(m.next[i].next);
              return out;
          }).join("\n");
      }
  }
  /**
  @internal
  */
  ContentMatch.empty = new ContentMatch(true);
  class TokenStream {
      constructor(string, nodeTypes) {
          this.string = string;
          this.nodeTypes = nodeTypes;
          this.inline = null;
          this.pos = 0;
          this.tokens = string.split(/\s*(?=\b|\W|$)/);
          if (this.tokens[this.tokens.length - 1] == "")
              this.tokens.pop();
          if (this.tokens[0] == "")
              this.tokens.shift();
      }
      get next() { return this.tokens[this.pos]; }
      eat(tok) { return this.next == tok && (this.pos++ || true); }
      err(str) { throw new SyntaxError(str + " (in content expression '" + this.string + "')"); }
  }
  function parseExpr(stream) {
      let exprs = [];
      do {
          exprs.push(parseExprSeq(stream));
      } while (stream.eat("|"));
      return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
  }
  function parseExprSeq(stream) {
      let exprs = [];
      do {
          exprs.push(parseExprSubscript(stream));
      } while (stream.next && stream.next != ")" && stream.next != "|");
      return exprs.length == 1 ? exprs[0] : { type: "seq", exprs };
  }
  function parseExprSubscript(stream) {
      let expr = parseExprAtom(stream);
      for (;;) {
          if (stream.eat("+"))
              expr = { type: "plus", expr };
          else if (stream.eat("*"))
              expr = { type: "star", expr };
          else if (stream.eat("?"))
              expr = { type: "opt", expr };
          else if (stream.eat("{"))
              expr = parseExprRange(stream, expr);
          else
              break;
      }
      return expr;
  }
  function parseNum(stream) {
      if (/\D/.test(stream.next))
          stream.err("Expected number, got '" + stream.next + "'");
      let result = Number(stream.next);
      stream.pos++;
      return result;
  }
  function parseExprRange(stream, expr) {
      let min = parseNum(stream), max = min;
      if (stream.eat(",")) {
          if (stream.next != "}")
              max = parseNum(stream);
          else
              max = -1;
      }
      if (!stream.eat("}"))
          stream.err("Unclosed braced range");
      return { type: "range", min, max, expr };
  }
  function resolveName(stream, name) {
      let types = stream.nodeTypes, type = types[name];
      if (type)
          return [type];
      let result = [];
      for (let typeName in types) {
          let type = types[typeName];
          if (type.groups.indexOf(name) > -1)
              result.push(type);
      }
      if (result.length == 0)
          stream.err("No node type or group '" + name + "' found");
      return result;
  }
  function parseExprAtom(stream) {
      if (stream.eat("(")) {
          let expr = parseExpr(stream);
          if (!stream.eat(")"))
              stream.err("Missing closing paren");
          return expr;
      }
      else if (!/\W/.test(stream.next)) {
          let exprs = resolveName(stream, stream.next).map(type => {
              if (stream.inline == null)
                  stream.inline = type.isInline;
              else if (stream.inline != type.isInline)
                  stream.err("Mixing inline and block content");
              return { type: "name", value: type };
          });
          stream.pos++;
          return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
      }
      else {
          stream.err("Unexpected token '" + stream.next + "'");
      }
  }
  /**
  Construct an NFA from an expression as returned by the parser. The
  NFA is represented as an array of states, which are themselves
  arrays of edges, which are `{term, to}` objects. The first state is
  the entry state and the last node is the success state.

  Note that unlike typical NFAs, the edge ordering in this one is
  significant, in that it is used to contruct filler content when
  necessary.
  */
  function nfa(expr) {
      let nfa = [[]];
      connect(compile(expr, 0), node());
      return nfa;
      function node() { return nfa.push([]) - 1; }
      function edge(from, to, term) {
          let edge = { term, to };
          nfa[from].push(edge);
          return edge;
      }
      function connect(edges, to) {
          edges.forEach(edge => edge.to = to);
      }
      function compile(expr, from) {
          if (expr.type == "choice") {
              return expr.exprs.reduce((out, expr) => out.concat(compile(expr, from)), []);
          }
          else if (expr.type == "seq") {
              for (let i = 0;; i++) {
                  let next = compile(expr.exprs[i], from);
                  if (i == expr.exprs.length - 1)
                      return next;
                  connect(next, from = node());
              }
          }
          else if (expr.type == "star") {
              let loop = node();
              edge(from, loop);
              connect(compile(expr.expr, loop), loop);
              return [edge(loop)];
          }
          else if (expr.type == "plus") {
              let loop = node();
              connect(compile(expr.expr, from), loop);
              connect(compile(expr.expr, loop), loop);
              return [edge(loop)];
          }
          else if (expr.type == "opt") {
              return [edge(from)].concat(compile(expr.expr, from));
          }
          else if (expr.type == "range") {
              let cur = from;
              for (let i = 0; i < expr.min; i++) {
                  let next = node();
                  connect(compile(expr.expr, cur), next);
                  cur = next;
              }
              if (expr.max == -1) {
                  connect(compile(expr.expr, cur), cur);
              }
              else {
                  for (let i = expr.min; i < expr.max; i++) {
                      let next = node();
                      edge(cur, next);
                      connect(compile(expr.expr, cur), next);
                      cur = next;
                  }
              }
              return [edge(cur)];
          }
          else if (expr.type == "name") {
              return [edge(from, undefined, expr.value)];
          }
          else {
              throw new Error("Unknown expr type");
          }
      }
  }
  function cmp(a, b) { return b - a; }
  // Get the set of nodes reachable by null edges from `node`. Omit
  // nodes with only a single null-out-edge, since they may lead to
  // needless duplicated nodes.
  function nullFrom(nfa, node) {
      let result = [];
      scan(node);
      return result.sort(cmp);
      function scan(node) {
          let edges = nfa[node];
          if (edges.length == 1 && !edges[0].term)
              return scan(edges[0].to);
          result.push(node);
          for (let i = 0; i < edges.length; i++) {
              let { term, to } = edges[i];
              if (!term && result.indexOf(to) == -1)
                  scan(to);
          }
      }
  }
  // Compiles an NFA as produced by `nfa` into a DFA, modeled as a set
  // of state objects (`ContentMatch` instances) with transitions
  // between them.
  function dfa(nfa) {
      let labeled = Object.create(null);
      return explore(nullFrom(nfa, 0));
      function explore(states) {
          let out = [];
          states.forEach(node => {
              nfa[node].forEach(({ term, to }) => {
                  if (!term)
                      return;
                  let set;
                  for (let i = 0; i < out.length; i++)
                      if (out[i][0] == term)
                          set = out[i][1];
                  nullFrom(nfa, to).forEach(node => {
                      if (!set)
                          out.push([term, set = []]);
                      if (set.indexOf(node) == -1)
                          set.push(node);
                  });
              });
          });
          let state = labeled[states.join(",")] = new ContentMatch(states.indexOf(nfa.length - 1) > -1);
          for (let i = 0; i < out.length; i++) {
              let states = out[i][1].sort(cmp);
              state.next.push({ type: out[i][0], next: labeled[states.join(",")] || explore(states) });
          }
          return state;
      }
  }
  function checkForDeadEnds(match, stream) {
      for (let i = 0, work = [match]; i < work.length; i++) {
          let state = work[i], dead = !state.validEnd, nodes = [];
          for (let j = 0; j < state.next.length; j++) {
              let { type, next } = state.next[j];
              nodes.push(type.name);
              if (dead && !(type.isText || type.hasRequiredAttrs()))
                  dead = false;
              if (work.indexOf(next) == -1)
                  work.push(next);
          }
          if (dead)
              stream.err("Only non-generatable nodes (" + nodes.join(", ") + ") in a required position (see https://prosemirror.net/docs/guide/#generatable)");
      }
  }

  // For node types where all attrs have a default value (or which don't
  // have any attributes), build up a single reusable default attribute
  // object, and use it for all nodes that don't specify specific
  // attributes.
  function defaultAttrs(attrs) {
      let defaults = Object.create(null);
      for (let attrName in attrs) {
          let attr = attrs[attrName];
          if (!attr.hasDefault)
              return null;
          defaults[attrName] = attr.default;
      }
      return defaults;
  }
  function computeAttrs(attrs, value) {
      let built = Object.create(null);
      for (let name in attrs) {
          let given = value && value[name];
          if (given === undefined) {
              let attr = attrs[name];
              if (attr.hasDefault)
                  given = attr.default;
              else
                  throw new RangeError("No value supplied for attribute " + name);
          }
          built[name] = given;
      }
      return built;
  }
  function initAttrs(attrs) {
      let result = Object.create(null);
      if (attrs)
          for (let name in attrs)
              result[name] = new Attribute(attrs[name]);
      return result;
  }
  /**
  Node types are objects allocated once per `Schema` and used to
  [tag](https://prosemirror.net/docs/ref/#model.Node.type) `Node` instances. They contain information
  about the node type, such as its name and what kind of node it
  represents.
  */
  class NodeType$1 {
      /**
      @internal
      */
      constructor(
      /**
      The name the node type has in this schema.
      */
      name, 
      /**
      A link back to the `Schema` the node type belongs to.
      */
      schema, 
      /**
      The spec that this type is based on
      */
      spec) {
          this.name = name;
          this.schema = schema;
          this.spec = spec;
          /**
          The set of marks allowed in this node. `null` means all marks
          are allowed.
          */
          this.markSet = null;
          this.groups = spec.group ? spec.group.split(" ") : [];
          this.attrs = initAttrs(spec.attrs);
          this.defaultAttrs = defaultAttrs(this.attrs);
          this.contentMatch = null;
          this.inlineContent = null;
          this.isBlock = !(spec.inline || name == "text");
          this.isText = name == "text";
      }
      /**
      True if this is an inline type.
      */
      get isInline() { return !this.isBlock; }
      /**
      True if this is a textblock type, a block that contains inline
      content.
      */
      get isTextblock() { return this.isBlock && this.inlineContent; }
      /**
      True for node types that allow no content.
      */
      get isLeaf() { return this.contentMatch == ContentMatch.empty; }
      /**
      True when this node is an atom, i.e. when it does not have
      directly editable content.
      */
      get isAtom() { return this.isLeaf || !!this.spec.atom; }
      /**
      The node type's [whitespace](https://prosemirror.net/docs/ref/#model.NodeSpec.whitespace) option.
      */
      get whitespace() {
          return this.spec.whitespace || (this.spec.code ? "pre" : "normal");
      }
      /**
      Tells you whether this node type has any required attributes.
      */
      hasRequiredAttrs() {
          for (let n in this.attrs)
              if (this.attrs[n].isRequired)
                  return true;
          return false;
      }
      /**
      Indicates whether this node allows some of the same content as
      the given node type.
      */
      compatibleContent(other) {
          return this == other || this.contentMatch.compatible(other.contentMatch);
      }
      /**
      @internal
      */
      computeAttrs(attrs) {
          if (!attrs && this.defaultAttrs)
              return this.defaultAttrs;
          else
              return computeAttrs(this.attrs, attrs);
      }
      /**
      Create a `Node` of this type. The given attributes are
      checked and defaulted (you can pass `null` to use the type's
      defaults entirely, if no required attributes exist). `content`
      may be a `Fragment`, a node, an array of nodes, or
      `null`. Similarly `marks` may be `null` to default to the empty
      set of marks.
      */
      create(attrs = null, content, marks) {
          if (this.isText)
              throw new Error("NodeType.create can't construct text nodes");
          return new Node(this, this.computeAttrs(attrs), Fragment.from(content), Mark.setFrom(marks));
      }
      /**
      Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but check the given content
      against the node type's content restrictions, and throw an error
      if it doesn't match.
      */
      createChecked(attrs = null, content, marks) {
          content = Fragment.from(content);
          if (!this.validContent(content))
              throw new RangeError("Invalid content for node " + this.name);
          return new Node(this, this.computeAttrs(attrs), content, Mark.setFrom(marks));
      }
      /**
      Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but see if it is
      necessary to add nodes to the start or end of the given fragment
      to make it fit the node. If no fitting wrapping can be found,
      return null. Note that, due to the fact that required nodes can
      always be created, this will always succeed if you pass null or
      `Fragment.empty` as content.
      */
      createAndFill(attrs = null, content, marks) {
          attrs = this.computeAttrs(attrs);
          content = Fragment.from(content);
          if (content.size) {
              let before = this.contentMatch.fillBefore(content);
              if (!before)
                  return null;
              content = before.append(content);
          }
          let matched = this.contentMatch.matchFragment(content);
          let after = matched && matched.fillBefore(Fragment.empty, true);
          if (!after)
              return null;
          return new Node(this, attrs, content.append(after), Mark.setFrom(marks));
      }
      /**
      Returns true if the given fragment is valid content for this node
      type with the given attributes.
      */
      validContent(content) {
          let result = this.contentMatch.matchFragment(content);
          if (!result || !result.validEnd)
              return false;
          for (let i = 0; i < content.childCount; i++)
              if (!this.allowsMarks(content.child(i).marks))
                  return false;
          return true;
      }
      /**
      Check whether the given mark type is allowed in this node.
      */
      allowsMarkType(markType) {
          return this.markSet == null || this.markSet.indexOf(markType) > -1;
      }
      /**
      Test whether the given set of marks are allowed in this node.
      */
      allowsMarks(marks) {
          if (this.markSet == null)
              return true;
          for (let i = 0; i < marks.length; i++)
              if (!this.allowsMarkType(marks[i].type))
                  return false;
          return true;
      }
      /**
      Removes the marks that are not allowed in this node from the given set.
      */
      allowedMarks(marks) {
          if (this.markSet == null)
              return marks;
          let copy;
          for (let i = 0; i < marks.length; i++) {
              if (!this.allowsMarkType(marks[i].type)) {
                  if (!copy)
                      copy = marks.slice(0, i);
              }
              else if (copy) {
                  copy.push(marks[i]);
              }
          }
          return !copy ? marks : copy.length ? copy : Mark.none;
      }
      /**
      @internal
      */
      static compile(nodes, schema) {
          let result = Object.create(null);
          nodes.forEach((name, spec) => result[name] = new NodeType$1(name, schema, spec));
          let topType = schema.spec.topNode || "doc";
          if (!result[topType])
              throw new RangeError("Schema is missing its top node type ('" + topType + "')");
          if (!result.text)
              throw new RangeError("Every schema needs a 'text' type");
          for (let _ in result.text.attrs)
              throw new RangeError("The text node type should not have attributes");
          return result;
      }
  }
  // Attribute descriptors
  class Attribute {
      constructor(options) {
          this.hasDefault = Object.prototype.hasOwnProperty.call(options, "default");
          this.default = options.default;
      }
      get isRequired() {
          return !this.hasDefault;
      }
  }
  // Marks
  /**
  Like nodes, marks (which are associated with nodes to signify
  things like emphasis or being part of a link) are
  [tagged](https://prosemirror.net/docs/ref/#model.Mark.type) with type objects, which are
  instantiated once per `Schema`.
  */
  class MarkType {
      /**
      @internal
      */
      constructor(
      /**
      The name of the mark type.
      */
      name, 
      /**
      @internal
      */
      rank, 
      /**
      The schema that this mark type instance is part of.
      */
      schema, 
      /**
      The spec on which the type is based.
      */
      spec) {
          this.name = name;
          this.rank = rank;
          this.schema = schema;
          this.spec = spec;
          this.attrs = initAttrs(spec.attrs);
          this.excluded = null;
          let defaults = defaultAttrs(this.attrs);
          this.instance = defaults ? new Mark(this, defaults) : null;
      }
      /**
      Create a mark of this type. `attrs` may be `null` or an object
      containing only some of the mark's attributes. The others, if
      they have defaults, will be added.
      */
      create(attrs = null) {
          if (!attrs && this.instance)
              return this.instance;
          return new Mark(this, computeAttrs(this.attrs, attrs));
      }
      /**
      @internal
      */
      static compile(marks, schema) {
          let result = Object.create(null), rank = 0;
          marks.forEach((name, spec) => result[name] = new MarkType(name, rank++, schema, spec));
          return result;
      }
      /**
      When there is a mark of this type in the given set, a new set
      without it is returned. Otherwise, the input set is returned.
      */
      removeFromSet(set) {
          for (var i = 0; i < set.length; i++)
              if (set[i].type == this) {
                  set = set.slice(0, i).concat(set.slice(i + 1));
                  i--;
              }
          return set;
      }
      /**
      Tests whether there is a mark of this type in the given set.
      */
      isInSet(set) {
          for (let i = 0; i < set.length; i++)
              if (set[i].type == this)
                  return set[i];
      }
      /**
      Queries whether a given mark type is
      [excluded](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) by this one.
      */
      excludes(other) {
          return this.excluded.indexOf(other) > -1;
      }
  }
  /**
  A document schema. Holds [node](https://prosemirror.net/docs/ref/#model.NodeType) and [mark
  type](https://prosemirror.net/docs/ref/#model.MarkType) objects for the nodes and marks that may
  occur in conforming documents, and provides functionality for
  creating and deserializing such documents.

  When given, the type parameters provide the names of the nodes and
  marks in this schema.
  */
  class Schema {
      /**
      Construct a schema from a schema [specification](https://prosemirror.net/docs/ref/#model.SchemaSpec).
      */
      constructor(spec) {
          /**
          An object for storing whatever values modules may want to
          compute and cache per schema. (If you want to store something
          in it, try to use property names unlikely to clash.)
          */
          this.cached = Object.create(null);
          this.spec = {
              nodes: OrderedMap.from(spec.nodes),
              marks: OrderedMap.from(spec.marks || {}),
              topNode: spec.topNode
          };
          this.nodes = NodeType$1.compile(this.spec.nodes, this);
          this.marks = MarkType.compile(this.spec.marks, this);
          let contentExprCache = Object.create(null);
          for (let prop in this.nodes) {
              if (prop in this.marks)
                  throw new RangeError(prop + " can not be both a node and a mark");
              let type = this.nodes[prop], contentExpr = type.spec.content || "", markExpr = type.spec.marks;
              type.contentMatch = contentExprCache[contentExpr] ||
                  (contentExprCache[contentExpr] = ContentMatch.parse(contentExpr, this.nodes));
              type.inlineContent = type.contentMatch.inlineContent;
              type.markSet = markExpr == "_" ? null :
                  markExpr ? gatherMarks(this, markExpr.split(" ")) :
                      markExpr == "" || !type.inlineContent ? [] : null;
          }
          for (let prop in this.marks) {
              let type = this.marks[prop], excl = type.spec.excludes;
              type.excluded = excl == null ? [type] : excl == "" ? [] : gatherMarks(this, excl.split(" "));
          }
          this.nodeFromJSON = this.nodeFromJSON.bind(this);
          this.markFromJSON = this.markFromJSON.bind(this);
          this.topNodeType = this.nodes[this.spec.topNode || "doc"];
          this.cached.wrappings = Object.create(null);
      }
      /**
      Create a node in this schema. The `type` may be a string or a
      `NodeType` instance. Attributes will be extended with defaults,
      `content` may be a `Fragment`, `null`, a `Node`, or an array of
      nodes.
      */
      node(type, attrs = null, content, marks) {
          if (typeof type == "string")
              type = this.nodeType(type);
          else if (!(type instanceof NodeType$1))
              throw new RangeError("Invalid node type: " + type);
          else if (type.schema != this)
              throw new RangeError("Node type from different schema used (" + type.name + ")");
          return type.createChecked(attrs, content, marks);
      }
      /**
      Create a text node in the schema. Empty text nodes are not
      allowed.
      */
      text(text, marks) {
          let type = this.nodes.text;
          return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks));
      }
      /**
      Create a mark with the given type and attributes.
      */
      mark(type, attrs) {
          if (typeof type == "string")
              type = this.marks[type];
          return type.create(attrs);
      }
      /**
      Deserialize a node from its JSON representation. This method is
      bound.
      */
      nodeFromJSON(json) {
          return Node.fromJSON(this, json);
      }
      /**
      Deserialize a mark from its JSON representation. This method is
      bound.
      */
      markFromJSON(json) {
          return Mark.fromJSON(this, json);
      }
      /**
      @internal
      */
      nodeType(name) {
          let found = this.nodes[name];
          if (!found)
              throw new RangeError("Unknown node type: " + name);
          return found;
      }
  }
  function gatherMarks(schema, marks) {
      let found = [];
      for (let i = 0; i < marks.length; i++) {
          let name = marks[i], mark = schema.marks[name], ok = mark;
          if (mark) {
              found.push(mark);
          }
          else {
              for (let prop in schema.marks) {
                  let mark = schema.marks[prop];
                  if (name == "_" || (mark.spec.group && mark.spec.group.split(" ").indexOf(name) > -1))
                      found.push(ok = mark);
              }
          }
          if (!ok)
              throw new SyntaxError("Unknown mark type: '" + marks[i] + "'");
      }
      return found;
  }

  /**
  A DOM parser represents a strategy for parsing DOM content into a
  ProseMirror document conforming to a given schema. Its behavior is
  defined by an array of [rules](https://prosemirror.net/docs/ref/#model.ParseRule).
  */
  class DOMParser$1 {
      /**
      Create a parser that targets the given schema, using the given
      parsing rules.
      */
      constructor(
      /**
      The schema into which the parser parses.
      */
      schema, 
      /**
      The set of [parse rules](https://prosemirror.net/docs/ref/#model.ParseRule) that the parser
      uses, in order of precedence.
      */
      rules) {
          this.schema = schema;
          this.rules = rules;
          /**
          @internal
          */
          this.tags = [];
          /**
          @internal
          */
          this.styles = [];
          rules.forEach(rule => {
              if (rule.tag)
                  this.tags.push(rule);
              else if (rule.style)
                  this.styles.push(rule);
          });
          // Only normalize list elements when lists in the schema can't directly contain themselves
          this.normalizeLists = !this.tags.some(r => {
              if (!/^(ul|ol)\b/.test(r.tag) || !r.node)
                  return false;
              let node = schema.nodes[r.node];
              return node.contentMatch.matchType(node);
          });
      }
      /**
      Parse a document from the content of a DOM node.
      */
      parse(dom, options = {}) {
          let context = new ParseContext(this, options, false);
          context.addAll(dom, options.from, options.to);
          return context.finish();
      }
      /**
      Parses the content of the given DOM node, like
      [`parse`](https://prosemirror.net/docs/ref/#model.DOMParser.parse), and takes the same set of
      options. But unlike that method, which produces a whole node,
      this one returns a slice that is open at the sides, meaning that
      the schema constraints aren't applied to the start of nodes to
      the left of the input and the end of nodes at the end.
      */
      parseSlice(dom, options = {}) {
          let context = new ParseContext(this, options, true);
          context.addAll(dom, options.from, options.to);
          return Slice.maxOpen(context.finish());
      }
      /**
      @internal
      */
      matchTag(dom, context, after) {
          for (let i = after ? this.tags.indexOf(after) + 1 : 0; i < this.tags.length; i++) {
              let rule = this.tags[i];
              if (matches(dom, rule.tag) &&
                  (rule.namespace === undefined || dom.namespaceURI == rule.namespace) &&
                  (!rule.context || context.matchesContext(rule.context))) {
                  if (rule.getAttrs) {
                      let result = rule.getAttrs(dom);
                      if (result === false)
                          continue;
                      rule.attrs = result || undefined;
                  }
                  return rule;
              }
          }
      }
      /**
      @internal
      */
      matchStyle(prop, value, context, after) {
          for (let i = after ? this.styles.indexOf(after) + 1 : 0; i < this.styles.length; i++) {
              let rule = this.styles[i], style = rule.style;
              if (style.indexOf(prop) != 0 ||
                  rule.context && !context.matchesContext(rule.context) ||
                  // Test that the style string either precisely matches the prop,
                  // or has an '=' sign after the prop, followed by the given
                  // value.
                  style.length > prop.length &&
                      (style.charCodeAt(prop.length) != 61 || style.slice(prop.length + 1) != value))
                  continue;
              if (rule.getAttrs) {
                  let result = rule.getAttrs(value);
                  if (result === false)
                      continue;
                  rule.attrs = result || undefined;
              }
              return rule;
          }
      }
      /**
      @internal
      */
      static schemaRules(schema) {
          let result = [];
          function insert(rule) {
              let priority = rule.priority == null ? 50 : rule.priority, i = 0;
              for (; i < result.length; i++) {
                  let next = result[i], nextPriority = next.priority == null ? 50 : next.priority;
                  if (nextPriority < priority)
                      break;
              }
              result.splice(i, 0, rule);
          }
          for (let name in schema.marks) {
              let rules = schema.marks[name].spec.parseDOM;
              if (rules)
                  rules.forEach(rule => {
                      insert(rule = copy(rule));
                      rule.mark = name;
                  });
          }
          for (let name in schema.nodes) {
              let rules = schema.nodes[name].spec.parseDOM;
              if (rules)
                  rules.forEach(rule => {
                      insert(rule = copy(rule));
                      rule.node = name;
                  });
          }
          return result;
      }
      /**
      Construct a DOM parser using the parsing rules listed in a
      schema's [node specs](https://prosemirror.net/docs/ref/#model.NodeSpec.parseDOM), reordered by
      [priority](https://prosemirror.net/docs/ref/#model.ParseRule.priority).
      */
      static fromSchema(schema) {
          return schema.cached.domParser ||
              (schema.cached.domParser = new DOMParser$1(schema, DOMParser$1.schemaRules(schema)));
      }
  }
  const blockTags = {
      address: true, article: true, aside: true, blockquote: true, canvas: true,
      dd: true, div: true, dl: true, fieldset: true, figcaption: true, figure: true,
      footer: true, form: true, h1: true, h2: true, h3: true, h4: true, h5: true,
      h6: true, header: true, hgroup: true, hr: true, li: true, noscript: true, ol: true,
      output: true, p: true, pre: true, section: true, table: true, tfoot: true, ul: true
  };
  const ignoreTags = {
      head: true, noscript: true, object: true, script: true, style: true, title: true
  };
  const listTags = { ol: true, ul: true };
  // Using a bitfield for node context options
  const OPT_PRESERVE_WS = 1, OPT_PRESERVE_WS_FULL = 2, OPT_OPEN_LEFT = 4;
  function wsOptionsFor(type, preserveWhitespace, base) {
      if (preserveWhitespace != null)
          return (preserveWhitespace ? OPT_PRESERVE_WS : 0) |
              (preserveWhitespace === "full" ? OPT_PRESERVE_WS_FULL : 0);
      return type && type.whitespace == "pre" ? OPT_PRESERVE_WS | OPT_PRESERVE_WS_FULL : base & ~OPT_OPEN_LEFT;
  }
  class NodeContext {
      constructor(type, attrs, 
      // Marks applied to this node itself
      marks, 
      // Marks that can't apply here, but will be used in children if possible
      pendingMarks, solid, match, options) {
          this.type = type;
          this.attrs = attrs;
          this.marks = marks;
          this.pendingMarks = pendingMarks;
          this.solid = solid;
          this.options = options;
          this.content = [];
          // Marks applied to the node's children
          this.activeMarks = Mark.none;
          // Nested Marks with same type
          this.stashMarks = [];
          this.match = match || (options & OPT_OPEN_LEFT ? null : type.contentMatch);
      }
      findWrapping(node) {
          if (!this.match) {
              if (!this.type)
                  return [];
              let fill = this.type.contentMatch.fillBefore(Fragment.from(node));
              if (fill) {
                  this.match = this.type.contentMatch.matchFragment(fill);
              }
              else {
                  let start = this.type.contentMatch, wrap;
                  if (wrap = start.findWrapping(node.type)) {
                      this.match = start;
                      return wrap;
                  }
                  else {
                      return null;
                  }
              }
          }
          return this.match.findWrapping(node.type);
      }
      finish(openEnd) {
          if (!(this.options & OPT_PRESERVE_WS)) { // Strip trailing whitespace
              let last = this.content[this.content.length - 1], m;
              if (last && last.isText && (m = /[ \t\r\n\u000c]+$/.exec(last.text))) {
                  let text = last;
                  if (last.text.length == m[0].length)
                      this.content.pop();
                  else
                      this.content[this.content.length - 1] = text.withText(text.text.slice(0, text.text.length - m[0].length));
              }
          }
          let content = Fragment.from(this.content);
          if (!openEnd && this.match)
              content = content.append(this.match.fillBefore(Fragment.empty, true));
          return this.type ? this.type.create(this.attrs, content, this.marks) : content;
      }
      popFromStashMark(mark) {
          for (let i = this.stashMarks.length - 1; i >= 0; i--)
              if (mark.eq(this.stashMarks[i]))
                  return this.stashMarks.splice(i, 1)[0];
      }
      applyPending(nextType) {
          for (let i = 0, pending = this.pendingMarks; i < pending.length; i++) {
              let mark = pending[i];
              if ((this.type ? this.type.allowsMarkType(mark.type) : markMayApply(mark.type, nextType)) &&
                  !mark.isInSet(this.activeMarks)) {
                  this.activeMarks = mark.addToSet(this.activeMarks);
                  this.pendingMarks = mark.removeFromSet(this.pendingMarks);
              }
          }
      }
      inlineContext(node) {
          if (this.type)
              return this.type.inlineContent;
          if (this.content.length)
              return this.content[0].isInline;
          return node.parentNode && !blockTags.hasOwnProperty(node.parentNode.nodeName.toLowerCase());
      }
  }
  class ParseContext {
      constructor(
      // The parser we are using.
      parser, 
      // The options passed to this parse.
      options, isOpen) {
          this.parser = parser;
          this.options = options;
          this.isOpen = isOpen;
          this.open = 0;
          let topNode = options.topNode, topContext;
          let topOptions = wsOptionsFor(null, options.preserveWhitespace, 0) | (isOpen ? OPT_OPEN_LEFT : 0);
          if (topNode)
              topContext = new NodeContext(topNode.type, topNode.attrs, Mark.none, Mark.none, true, options.topMatch || topNode.type.contentMatch, topOptions);
          else if (isOpen)
              topContext = new NodeContext(null, null, Mark.none, Mark.none, true, null, topOptions);
          else
              topContext = new NodeContext(parser.schema.topNodeType, null, Mark.none, Mark.none, true, null, topOptions);
          this.nodes = [topContext];
          this.find = options.findPositions;
          this.needsBlock = false;
      }
      get top() {
          return this.nodes[this.open];
      }
      // Add a DOM node to the content. Text is inserted as text node,
      // otherwise, the node is passed to `addElement` or, if it has a
      // `style` attribute, `addElementWithStyles`.
      addDOM(dom) {
          if (dom.nodeType == 3) {
              this.addTextNode(dom);
          }
          else if (dom.nodeType == 1) {
              let style = dom.getAttribute("style");
              let marks = style ? this.readStyles(parseStyles(style)) : null, top = this.top;
              if (marks != null)
                  for (let i = 0; i < marks.length; i++)
                      this.addPendingMark(marks[i]);
              this.addElement(dom);
              if (marks != null)
                  for (let i = 0; i < marks.length; i++)
                      this.removePendingMark(marks[i], top);
          }
      }
      addTextNode(dom) {
          let value = dom.nodeValue;
          let top = this.top;
          if (top.options & OPT_PRESERVE_WS_FULL ||
              top.inlineContext(dom) ||
              /[^ \t\r\n\u000c]/.test(value)) {
              if (!(top.options & OPT_PRESERVE_WS)) {
                  value = value.replace(/[ \t\r\n\u000c]+/g, " ");
                  // If this starts with whitespace, and there is no node before it, or
                  // a hard break, or a text node that ends with whitespace, strip the
                  // leading space.
                  if (/^[ \t\r\n\u000c]/.test(value) && this.open == this.nodes.length - 1) {
                      let nodeBefore = top.content[top.content.length - 1];
                      let domNodeBefore = dom.previousSibling;
                      if (!nodeBefore ||
                          (domNodeBefore && domNodeBefore.nodeName == 'BR') ||
                          (nodeBefore.isText && /[ \t\r\n\u000c]$/.test(nodeBefore.text)))
                          value = value.slice(1);
                  }
              }
              else if (!(top.options & OPT_PRESERVE_WS_FULL)) {
                  value = value.replace(/\r?\n|\r/g, " ");
              }
              else {
                  value = value.replace(/\r\n?/g, "\n");
              }
              if (value)
                  this.insertNode(this.parser.schema.text(value));
              this.findInText(dom);
          }
          else {
              this.findInside(dom);
          }
      }
      // Try to find a handler for the given tag and use that to parse. If
      // none is found, the element's content nodes are added directly.
      addElement(dom, matchAfter) {
          let name = dom.nodeName.toLowerCase(), ruleID;
          if (listTags.hasOwnProperty(name) && this.parser.normalizeLists)
              normalizeList(dom);
          let rule = (this.options.ruleFromNode && this.options.ruleFromNode(dom)) ||
              (ruleID = this.parser.matchTag(dom, this, matchAfter));
          if (rule ? rule.ignore : ignoreTags.hasOwnProperty(name)) {
              this.findInside(dom);
              this.ignoreFallback(dom);
          }
          else if (!rule || rule.skip || rule.closeParent) {
              if (rule && rule.closeParent)
                  this.open = Math.max(0, this.open - 1);
              else if (rule && rule.skip.nodeType)
                  dom = rule.skip;
              let sync, top = this.top, oldNeedsBlock = this.needsBlock;
              if (blockTags.hasOwnProperty(name)) {
                  sync = true;
                  if (!top.type)
                      this.needsBlock = true;
              }
              else if (!dom.firstChild) {
                  this.leafFallback(dom);
                  return;
              }
              this.addAll(dom);
              if (sync)
                  this.sync(top);
              this.needsBlock = oldNeedsBlock;
          }
          else {
              this.addElementByRule(dom, rule, rule.consuming === false ? ruleID : undefined);
          }
      }
      // Called for leaf DOM nodes that would otherwise be ignored
      leafFallback(dom) {
          if (dom.nodeName == "BR" && this.top.type && this.top.type.inlineContent)
              this.addTextNode(dom.ownerDocument.createTextNode("\n"));
      }
      // Called for ignored nodes
      ignoreFallback(dom) {
          // Ignored BR nodes should at least create an inline context
          if (dom.nodeName == "BR" && (!this.top.type || !this.top.type.inlineContent))
              this.findPlace(this.parser.schema.text("-"));
      }
      // Run any style parser associated with the node's styles. Either
      // return an array of marks, or null to indicate some of the styles
      // had a rule with `ignore` set.
      readStyles(styles) {
          let marks = Mark.none;
          style: for (let i = 0; i < styles.length; i += 2) {
              for (let after = undefined;;) {
                  let rule = this.parser.matchStyle(styles[i], styles[i + 1], this, after);
                  if (!rule)
                      continue style;
                  if (rule.ignore)
                      return null;
                  marks = this.parser.schema.marks[rule.mark].create(rule.attrs).addToSet(marks);
                  if (rule.consuming === false)
                      after = rule;
                  else
                      break;
              }
          }
          return marks;
      }
      // Look up a handler for the given node. If none are found, return
      // false. Otherwise, apply it, use its return value to drive the way
      // the node's content is wrapped, and return true.
      addElementByRule(dom, rule, continueAfter) {
          let sync, nodeType, mark;
          if (rule.node) {
              nodeType = this.parser.schema.nodes[rule.node];
              if (!nodeType.isLeaf) {
                  sync = this.enter(nodeType, rule.attrs || null, rule.preserveWhitespace);
              }
              else if (!this.insertNode(nodeType.create(rule.attrs))) {
                  this.leafFallback(dom);
              }
          }
          else {
              let markType = this.parser.schema.marks[rule.mark];
              mark = markType.create(rule.attrs);
              this.addPendingMark(mark);
          }
          let startIn = this.top;
          if (nodeType && nodeType.isLeaf) {
              this.findInside(dom);
          }
          else if (continueAfter) {
              this.addElement(dom, continueAfter);
          }
          else if (rule.getContent) {
              this.findInside(dom);
              rule.getContent(dom, this.parser.schema).forEach(node => this.insertNode(node));
          }
          else {
              let contentDOM = dom;
              if (typeof rule.contentElement == "string")
                  contentDOM = dom.querySelector(rule.contentElement);
              else if (typeof rule.contentElement == "function")
                  contentDOM = rule.contentElement(dom);
              else if (rule.contentElement)
                  contentDOM = rule.contentElement;
              this.findAround(dom, contentDOM, true);
              this.addAll(contentDOM);
          }
          if (sync && this.sync(startIn))
              this.open--;
          if (mark)
              this.removePendingMark(mark, startIn);
      }
      // Add all child nodes between `startIndex` and `endIndex` (or the
      // whole node, if not given). If `sync` is passed, use it to
      // synchronize after every block element.
      addAll(parent, startIndex, endIndex) {
          let index = startIndex || 0;
          for (let dom = startIndex ? parent.childNodes[startIndex] : parent.firstChild, end = endIndex == null ? null : parent.childNodes[endIndex]; dom != end; dom = dom.nextSibling, ++index) {
              this.findAtPoint(parent, index);
              this.addDOM(dom);
          }
          this.findAtPoint(parent, index);
      }
      // Try to find a way to fit the given node type into the current
      // context. May add intermediate wrappers and/or leave non-solid
      // nodes that we're in.
      findPlace(node) {
          let route, sync;
          for (let depth = this.open; depth >= 0; depth--) {
              let cx = this.nodes[depth];
              let found = cx.findWrapping(node);
              if (found && (!route || route.length > found.length)) {
                  route = found;
                  sync = cx;
                  if (!found.length)
                      break;
              }
              if (cx.solid)
                  break;
          }
          if (!route)
              return false;
          this.sync(sync);
          for (let i = 0; i < route.length; i++)
              this.enterInner(route[i], null, false);
          return true;
      }
      // Try to insert the given node, adjusting the context when needed.
      insertNode(node) {
          if (node.isInline && this.needsBlock && !this.top.type) {
              let block = this.textblockFromContext();
              if (block)
                  this.enterInner(block);
          }
          if (this.findPlace(node)) {
              this.closeExtra();
              let top = this.top;
              top.applyPending(node.type);
              if (top.match)
                  top.match = top.match.matchType(node.type);
              let marks = top.activeMarks;
              for (let i = 0; i < node.marks.length; i++)
                  if (!top.type || top.type.allowsMarkType(node.marks[i].type))
                      marks = node.marks[i].addToSet(marks);
              top.content.push(node.mark(marks));
              return true;
          }
          return false;
      }
      // Try to start a node of the given type, adjusting the context when
      // necessary.
      enter(type, attrs, preserveWS) {
          let ok = this.findPlace(type.create(attrs));
          if (ok)
              this.enterInner(type, attrs, true, preserveWS);
          return ok;
      }
      // Open a node of the given type
      enterInner(type, attrs = null, solid = false, preserveWS) {
          this.closeExtra();
          let top = this.top;
          top.applyPending(type);
          top.match = top.match && top.match.matchType(type);
          let options = wsOptionsFor(type, preserveWS, top.options);
          if ((top.options & OPT_OPEN_LEFT) && top.content.length == 0)
              options |= OPT_OPEN_LEFT;
          this.nodes.push(new NodeContext(type, attrs, top.activeMarks, top.pendingMarks, solid, null, options));
          this.open++;
      }
      // Make sure all nodes above this.open are finished and added to
      // their parents
      closeExtra(openEnd = false) {
          let i = this.nodes.length - 1;
          if (i > this.open) {
              for (; i > this.open; i--)
                  this.nodes[i - 1].content.push(this.nodes[i].finish(openEnd));
              this.nodes.length = this.open + 1;
          }
      }
      finish() {
          this.open = 0;
          this.closeExtra(this.isOpen);
          return this.nodes[0].finish(this.isOpen || this.options.topOpen);
      }
      sync(to) {
          for (let i = this.open; i >= 0; i--)
              if (this.nodes[i] == to) {
                  this.open = i;
                  return true;
              }
          return false;
      }
      get currentPos() {
          this.closeExtra();
          let pos = 0;
          for (let i = this.open; i >= 0; i--) {
              let content = this.nodes[i].content;
              for (let j = content.length - 1; j >= 0; j--)
                  pos += content[j].nodeSize;
              if (i)
                  pos++;
          }
          return pos;
      }
      findAtPoint(parent, offset) {
          if (this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].node == parent && this.find[i].offset == offset)
                      this.find[i].pos = this.currentPos;
              }
      }
      findInside(parent) {
          if (this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node))
                      this.find[i].pos = this.currentPos;
              }
      }
      findAround(parent, content, before) {
          if (parent != content && this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node)) {
                      let pos = content.compareDocumentPosition(this.find[i].node);
                      if (pos & (before ? 2 : 4))
                          this.find[i].pos = this.currentPos;
                  }
              }
      }
      findInText(textNode) {
          if (this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].node == textNode)
                      this.find[i].pos = this.currentPos - (textNode.nodeValue.length - this.find[i].offset);
              }
      }
      // Determines whether the given context string matches this context.
      matchesContext(context) {
          if (context.indexOf("|") > -1)
              return context.split(/\s*\|\s*/).some(this.matchesContext, this);
          let parts = context.split("/");
          let option = this.options.context;
          let useRoot = !this.isOpen && (!option || option.parent.type == this.nodes[0].type);
          let minDepth = -(option ? option.depth + 1 : 0) + (useRoot ? 0 : 1);
          let match = (i, depth) => {
              for (; i >= 0; i--) {
                  let part = parts[i];
                  if (part == "") {
                      if (i == parts.length - 1 || i == 0)
                          continue;
                      for (; depth >= minDepth; depth--)
                          if (match(i - 1, depth))
                              return true;
                      return false;
                  }
                  else {
                      let next = depth > 0 || (depth == 0 && useRoot) ? this.nodes[depth].type
                          : option && depth >= minDepth ? option.node(depth - minDepth).type
                              : null;
                      if (!next || (next.name != part && next.groups.indexOf(part) == -1))
                          return false;
                      depth--;
                  }
              }
              return true;
          };
          return match(parts.length - 1, this.open);
      }
      textblockFromContext() {
          let $context = this.options.context;
          if ($context)
              for (let d = $context.depth; d >= 0; d--) {
                  let deflt = $context.node(d).contentMatchAt($context.indexAfter(d)).defaultType;
                  if (deflt && deflt.isTextblock && deflt.defaultAttrs)
                      return deflt;
              }
          for (let name in this.parser.schema.nodes) {
              let type = this.parser.schema.nodes[name];
              if (type.isTextblock && type.defaultAttrs)
                  return type;
          }
      }
      addPendingMark(mark) {
          let found = findSameMarkInSet(mark, this.top.pendingMarks);
          if (found)
              this.top.stashMarks.push(found);
          this.top.pendingMarks = mark.addToSet(this.top.pendingMarks);
      }
      removePendingMark(mark, upto) {
          for (let depth = this.open; depth >= 0; depth--) {
              let level = this.nodes[depth];
              let found = level.pendingMarks.lastIndexOf(mark);
              if (found > -1) {
                  level.pendingMarks = mark.removeFromSet(level.pendingMarks);
              }
              else {
                  level.activeMarks = mark.removeFromSet(level.activeMarks);
                  let stashMark = level.popFromStashMark(mark);
                  if (stashMark && level.type && level.type.allowsMarkType(stashMark.type))
                      level.activeMarks = stashMark.addToSet(level.activeMarks);
              }
              if (level == upto)
                  break;
          }
      }
  }
  // Kludge to work around directly nested list nodes produced by some
  // tools and allowed by browsers to mean that the nested list is
  // actually part of the list item above it.
  function normalizeList(dom) {
      for (let child = dom.firstChild, prevItem = null; child; child = child.nextSibling) {
          let name = child.nodeType == 1 ? child.nodeName.toLowerCase() : null;
          if (name && listTags.hasOwnProperty(name) && prevItem) {
              prevItem.appendChild(child);
              child = prevItem;
          }
          else if (name == "li") {
              prevItem = child;
          }
          else if (name) {
              prevItem = null;
          }
      }
  }
  // Apply a CSS selector.
  function matches(dom, selector) {
      return (dom.matches || dom.msMatchesSelector || dom.webkitMatchesSelector || dom.mozMatchesSelector).call(dom, selector);
  }
  // Tokenize a style attribute into property/value pairs.
  function parseStyles(style) {
      let re = /\s*([\w-]+)\s*:\s*([^;]+)/g, m, result = [];
      while (m = re.exec(style))
          result.push(m[1], m[2].trim());
      return result;
  }
  function copy(obj) {
      let copy = {};
      for (let prop in obj)
          copy[prop] = obj[prop];
      return copy;
  }
  // Used when finding a mark at the top level of a fragment parse.
  // Checks whether it would be reasonable to apply a given mark type to
  // a given node, by looking at the way the mark occurs in the schema.
  function markMayApply(markType, nodeType) {
      let nodes = nodeType.schema.nodes;
      for (let name in nodes) {
          let parent = nodes[name];
          if (!parent.allowsMarkType(markType))
              continue;
          let seen = [], scan = (match) => {
              seen.push(match);
              for (let i = 0; i < match.edgeCount; i++) {
                  let { type, next } = match.edge(i);
                  if (type == nodeType)
                      return true;
                  if (seen.indexOf(next) < 0 && scan(next))
                      return true;
              }
          };
          if (scan(parent.contentMatch))
              return true;
      }
  }
  function findSameMarkInSet(mark, set) {
      for (let i = 0; i < set.length; i++) {
          if (mark.eq(set[i]))
              return set[i];
      }
  }

  /**
  A DOM serializer knows how to convert ProseMirror nodes and
  marks of various types to DOM nodes.
  */
  class DOMSerializer {
      /**
      Create a serializer. `nodes` should map node names to functions
      that take a node and return a description of the corresponding
      DOM. `marks` does the same for mark names, but also gets an
      argument that tells it whether the mark's content is block or
      inline content (for typical use, it'll always be inline). A mark
      serializer may be `null` to indicate that marks of that type
      should not be serialized.
      */
      constructor(
      /**
      The node serialization functions.
      */
      nodes, 
      /**
      The mark serialization functions.
      */
      marks) {
          this.nodes = nodes;
          this.marks = marks;
      }
      /**
      Serialize the content of this fragment to a DOM fragment. When
      not in the browser, the `document` option, containing a DOM
      document, should be passed so that the serializer can create
      nodes.
      */
      serializeFragment(fragment, options = {}, target) {
          if (!target)
              target = doc$1(options).createDocumentFragment();
          let top = target, active = [];
          fragment.forEach(node => {
              if (active.length || node.marks.length) {
                  let keep = 0, rendered = 0;
                  while (keep < active.length && rendered < node.marks.length) {
                      let next = node.marks[rendered];
                      if (!this.marks[next.type.name]) {
                          rendered++;
                          continue;
                      }
                      if (!next.eq(active[keep][0]) || next.type.spec.spanning === false)
                          break;
                      keep++;
                      rendered++;
                  }
                  while (keep < active.length)
                      top = active.pop()[1];
                  while (rendered < node.marks.length) {
                      let add = node.marks[rendered++];
                      let markDOM = this.serializeMark(add, node.isInline, options);
                      if (markDOM) {
                          active.push([add, top]);
                          top.appendChild(markDOM.dom);
                          top = markDOM.contentDOM || markDOM.dom;
                      }
                  }
              }
              top.appendChild(this.serializeNodeInner(node, options));
          });
          return target;
      }
      /**
      @internal
      */
      serializeNodeInner(node, options) {
          let { dom, contentDOM } = DOMSerializer.renderSpec(doc$1(options), this.nodes[node.type.name](node));
          if (contentDOM) {
              if (node.isLeaf)
                  throw new RangeError("Content hole not allowed in a leaf node spec");
              this.serializeFragment(node.content, options, contentDOM);
          }
          return dom;
      }
      /**
      Serialize this node to a DOM node. This can be useful when you
      need to serialize a part of a document, as opposed to the whole
      document. To serialize a whole document, use
      [`serializeFragment`](https://prosemirror.net/docs/ref/#model.DOMSerializer.serializeFragment) on
      its [content](https://prosemirror.net/docs/ref/#model.Node.content).
      */
      serializeNode(node, options = {}) {
          let dom = this.serializeNodeInner(node, options);
          for (let i = node.marks.length - 1; i >= 0; i--) {
              let wrap = this.serializeMark(node.marks[i], node.isInline, options);
              if (wrap) {
                  (wrap.contentDOM || wrap.dom).appendChild(dom);
                  dom = wrap.dom;
              }
          }
          return dom;
      }
      /**
      @internal
      */
      serializeMark(mark, inline, options = {}) {
          let toDOM = this.marks[mark.type.name];
          return toDOM && DOMSerializer.renderSpec(doc$1(options), toDOM(mark, inline));
      }
      /**
      Render an [output spec](https://prosemirror.net/docs/ref/#model.DOMOutputSpec) to a DOM node. If
      the spec has a hole (zero) in it, `contentDOM` will point at the
      node with the hole.
      */
      static renderSpec(doc, structure, xmlNS = null) {
          if (typeof structure == "string")
              return { dom: doc.createTextNode(structure) };
          if (structure.nodeType != null)
              return { dom: structure };
          if (structure.dom && structure.dom.nodeType != null)
              return structure;
          let tagName = structure[0], space = tagName.indexOf(" ");
          if (space > 0) {
              xmlNS = tagName.slice(0, space);
              tagName = tagName.slice(space + 1);
          }
          let contentDOM;
          let dom = (xmlNS ? doc.createElementNS(xmlNS, tagName) : doc.createElement(tagName));
          let attrs = structure[1], start = 1;
          if (attrs && typeof attrs == "object" && attrs.nodeType == null && !Array.isArray(attrs)) {
              start = 2;
              for (let name in attrs)
                  if (attrs[name] != null) {
                      let space = name.indexOf(" ");
                      if (space > 0)
                          dom.setAttributeNS(name.slice(0, space), name.slice(space + 1), attrs[name]);
                      else
                          dom.setAttribute(name, attrs[name]);
                  }
          }
          for (let i = start; i < structure.length; i++) {
              let child = structure[i];
              if (child === 0) {
                  if (i < structure.length - 1 || i > start)
                      throw new RangeError("Content hole must be the only child of its parent node");
                  return { dom, contentDOM: dom };
              }
              else {
                  let { dom: inner, contentDOM: innerContent } = DOMSerializer.renderSpec(doc, child, xmlNS);
                  dom.appendChild(inner);
                  if (innerContent) {
                      if (contentDOM)
                          throw new RangeError("Multiple content holes");
                      contentDOM = innerContent;
                  }
              }
          }
          return { dom, contentDOM };
      }
      /**
      Build a serializer using the [`toDOM`](https://prosemirror.net/docs/ref/#model.NodeSpec.toDOM)
      properties in a schema's node and mark specs.
      */
      static fromSchema(schema) {
          return schema.cached.domSerializer ||
              (schema.cached.domSerializer = new DOMSerializer(this.nodesFromSchema(schema), this.marksFromSchema(schema)));
      }
      /**
      Gather the serializers in a schema's node specs into an object.
      This can be useful as a base to build a custom serializer from.
      */
      static nodesFromSchema(schema) {
          let result = gatherToDOM(schema.nodes);
          if (!result.text)
              result.text = node => node.text;
          return result;
      }
      /**
      Gather the serializers in a schema's mark specs into an object.
      */
      static marksFromSchema(schema) {
          return gatherToDOM(schema.marks);
      }
  }
  function gatherToDOM(obj) {
      let result = {};
      for (let name in obj) {
          let toDOM = obj[name].spec.toDOM;
          if (toDOM)
              result[name] = toDOM;
      }
      return result;
  }
  function doc$1(options) {
      return options.document || window.document;
  }

  // Recovery values encode a range index and an offset. They are
  // represented as numbers, because tons of them will be created when
  // mapping, for example, a large number of decorations. The number's
  // lower 16 bits provide the index, the remaining bits the offset.
  //
  // Note: We intentionally don't use bit shift operators to en- and
  // decode these, since those clip to 32 bits, which we might in rare
  // cases want to overflow. A 64-bit float can represent 48-bit
  // integers precisely.
  const lower16 = 0xffff;
  const factor16 = Math.pow(2, 16);
  function makeRecover(index, offset) { return index + offset * factor16; }
  function recoverIndex(value) { return value & lower16; }
  function recoverOffset(value) { return (value - (value & lower16)) / factor16; }
  const DEL_BEFORE = 1, DEL_AFTER = 2, DEL_ACROSS = 4, DEL_SIDE = 8;
  /**
  An object representing a mapped position with extra
  information.
  */
  class MapResult {
      /**
      @internal
      */
      constructor(
      /**
      The mapped version of the position.
      */
      pos, 
      /**
      @internal
      */
      delInfo, 
      /**
      @internal
      */
      recover) {
          this.pos = pos;
          this.delInfo = delInfo;
          this.recover = recover;
      }
      /**
      Tells you whether the position was deleted, that is, whether the
      step removed the token on the side queried (via the `assoc`)
      argument from the document.
      */
      get deleted() { return (this.delInfo & DEL_SIDE) > 0; }
      /**
      Tells you whether the token before the mapped position was deleted.
      */
      get deletedBefore() { return (this.delInfo & (DEL_BEFORE | DEL_ACROSS)) > 0; }
      /**
      True when the token after the mapped position was deleted.
      */
      get deletedAfter() { return (this.delInfo & (DEL_AFTER | DEL_ACROSS)) > 0; }
      /**
      Tells whether any of the steps mapped through deletes across the
      position (including both the token before and after the
      position).
      */
      get deletedAcross() { return (this.delInfo & DEL_ACROSS) > 0; }
  }
  /**
  A map describing the deletions and insertions made by a step, which
  can be used to find the correspondence between positions in the
  pre-step version of a document and the same position in the
  post-step version.
  */
  class StepMap {
      /**
      Create a position map. The modifications to the document are
      represented as an array of numbers, in which each group of three
      represents a modified chunk as `[start, oldSize, newSize]`.
      */
      constructor(
      /**
      @internal
      */
      ranges, 
      /**
      @internal
      */
      inverted = false) {
          this.ranges = ranges;
          this.inverted = inverted;
          if (!ranges.length && StepMap.empty)
              return StepMap.empty;
      }
      /**
      @internal
      */
      recover(value) {
          let diff = 0, index = recoverIndex(value);
          if (!this.inverted)
              for (let i = 0; i < index; i++)
                  diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1];
          return this.ranges[index * 3] + diff + recoverOffset(value);
      }
      mapResult(pos, assoc = 1) { return this._map(pos, assoc, false); }
      map(pos, assoc = 1) { return this._map(pos, assoc, true); }
      /**
      @internal
      */
      _map(pos, assoc, simple) {
          let diff = 0, oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
          for (let i = 0; i < this.ranges.length; i += 3) {
              let start = this.ranges[i] - (this.inverted ? diff : 0);
              if (start > pos)
                  break;
              let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex], end = start + oldSize;
              if (pos <= end) {
                  let side = !oldSize ? assoc : pos == start ? -1 : pos == end ? 1 : assoc;
                  let result = start + diff + (side < 0 ? 0 : newSize);
                  if (simple)
                      return result;
                  let recover = pos == (assoc < 0 ? start : end) ? null : makeRecover(i / 3, pos - start);
                  let del = pos == start ? DEL_AFTER : pos == end ? DEL_BEFORE : DEL_ACROSS;
                  if (assoc < 0 ? pos != start : pos != end)
                      del |= DEL_SIDE;
                  return new MapResult(result, del, recover);
              }
              diff += newSize - oldSize;
          }
          return simple ? pos + diff : new MapResult(pos + diff, 0, null);
      }
      /**
      @internal
      */
      touches(pos, recover) {
          let diff = 0, index = recoverIndex(recover);
          let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
          for (let i = 0; i < this.ranges.length; i += 3) {
              let start = this.ranges[i] - (this.inverted ? diff : 0);
              if (start > pos)
                  break;
              let oldSize = this.ranges[i + oldIndex], end = start + oldSize;
              if (pos <= end && i == index * 3)
                  return true;
              diff += this.ranges[i + newIndex] - oldSize;
          }
          return false;
      }
      /**
      Calls the given function on each of the changed ranges included in
      this map.
      */
      forEach(f) {
          let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
          for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
              let start = this.ranges[i], oldStart = start - (this.inverted ? diff : 0), newStart = start + (this.inverted ? 0 : diff);
              let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex];
              f(oldStart, oldStart + oldSize, newStart, newStart + newSize);
              diff += newSize - oldSize;
          }
      }
      /**
      Create an inverted version of this map. The result can be used to
      map positions in the post-step document to the pre-step document.
      */
      invert() {
          return new StepMap(this.ranges, !this.inverted);
      }
      /**
      @internal
      */
      toString() {
          return (this.inverted ? "-" : "") + JSON.stringify(this.ranges);
      }
      /**
      Create a map that moves all positions by offset `n` (which may be
      negative). This can be useful when applying steps meant for a
      sub-document to a larger document, or vice-versa.
      */
      static offset(n) {
          return n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n]);
      }
  }
  /**
  A StepMap that contains no changed ranges.
  */
  StepMap.empty = new StepMap([]);
  /**
  A mapping represents a pipeline of zero or more [step
  maps](https://prosemirror.net/docs/ref/#transform.StepMap). It has special provisions for losslessly
  handling mapping positions through a series of steps in which some
  steps are inverted versions of earlier steps. (This comes up when
  ‘[rebasing](/docs/guide/#transform.rebasing)’ steps for
  collaboration or history management.)
  */
  class Mapping {
      /**
      Create a new mapping with the given position maps.
      */
      constructor(
      /**
      The step maps in this mapping.
      */
      maps = [], 
      /**
      @internal
      */
      mirror, 
      /**
      The starting position in the `maps` array, used when `map` or
      `mapResult` is called.
      */
      from = 0, 
      /**
      The end position in the `maps` array.
      */
      to = maps.length) {
          this.maps = maps;
          this.mirror = mirror;
          this.from = from;
          this.to = to;
      }
      /**
      Create a mapping that maps only through a part of this one.
      */
      slice(from = 0, to = this.maps.length) {
          return new Mapping(this.maps, this.mirror, from, to);
      }
      /**
      @internal
      */
      copy() {
          return new Mapping(this.maps.slice(), this.mirror && this.mirror.slice(), this.from, this.to);
      }
      /**
      Add a step map to the end of this mapping. If `mirrors` is
      given, it should be the index of the step map that is the mirror
      image of this one.
      */
      appendMap(map, mirrors) {
          this.to = this.maps.push(map);
          if (mirrors != null)
              this.setMirror(this.maps.length - 1, mirrors);
      }
      /**
      Add all the step maps in a given mapping to this one (preserving
      mirroring information).
      */
      appendMapping(mapping) {
          for (let i = 0, startSize = this.maps.length; i < mapping.maps.length; i++) {
              let mirr = mapping.getMirror(i);
              this.appendMap(mapping.maps[i], mirr != null && mirr < i ? startSize + mirr : undefined);
          }
      }
      /**
      Finds the offset of the step map that mirrors the map at the
      given offset, in this mapping (as per the second argument to
      `appendMap`).
      */
      getMirror(n) {
          if (this.mirror)
              for (let i = 0; i < this.mirror.length; i++)
                  if (this.mirror[i] == n)
                      return this.mirror[i + (i % 2 ? -1 : 1)];
      }
      /**
      @internal
      */
      setMirror(n, m) {
          if (!this.mirror)
              this.mirror = [];
          this.mirror.push(n, m);
      }
      /**
      Append the inverse of the given mapping to this one.
      */
      appendMappingInverted(mapping) {
          for (let i = mapping.maps.length - 1, totalSize = this.maps.length + mapping.maps.length; i >= 0; i--) {
              let mirr = mapping.getMirror(i);
              this.appendMap(mapping.maps[i].invert(), mirr != null && mirr > i ? totalSize - mirr - 1 : undefined);
          }
      }
      /**
      Create an inverted version of this mapping.
      */
      invert() {
          let inverse = new Mapping;
          inverse.appendMappingInverted(this);
          return inverse;
      }
      /**
      Map a position through this mapping.
      */
      map(pos, assoc = 1) {
          if (this.mirror)
              return this._map(pos, assoc, true);
          for (let i = this.from; i < this.to; i++)
              pos = this.maps[i].map(pos, assoc);
          return pos;
      }
      /**
      Map a position through this mapping, returning a mapping
      result.
      */
      mapResult(pos, assoc = 1) { return this._map(pos, assoc, false); }
      /**
      @internal
      */
      _map(pos, assoc, simple) {
          let delInfo = 0;
          for (let i = this.from; i < this.to; i++) {
              let map = this.maps[i], result = map.mapResult(pos, assoc);
              if (result.recover != null) {
                  let corr = this.getMirror(i);
                  if (corr != null && corr > i && corr < this.to) {
                      i = corr;
                      pos = this.maps[corr].recover(result.recover);
                      continue;
                  }
              }
              delInfo |= result.delInfo;
              pos = result.pos;
          }
          return simple ? pos : new MapResult(pos, delInfo, null);
      }
  }

  const stepsByID = Object.create(null);
  /**
  A step object represents an atomic change. It generally applies
  only to the document it was created for, since the positions
  stored in it will only make sense for that document.

  New steps are defined by creating classes that extend `Step`,
  overriding the `apply`, `invert`, `map`, `getMap` and `fromJSON`
  methods, and registering your class with a unique
  JSON-serialization identifier using
  [`Step.jsonID`](https://prosemirror.net/docs/ref/#transform.Step^jsonID).
  */
  class Step {
      /**
      Get the step map that represents the changes made by this step,
      and which can be used to transform between positions in the old
      and the new document.
      */
      getMap() { return StepMap.empty; }
      /**
      Try to merge this step with another one, to be applied directly
      after it. Returns the merged step when possible, null if the
      steps can't be merged.
      */
      merge(other) { return null; }
      /**
      Deserialize a step from its JSON representation. Will call
      through to the step class' own implementation of this method.
      */
      static fromJSON(schema, json) {
          if (!json || !json.stepType)
              throw new RangeError("Invalid input for Step.fromJSON");
          let type = stepsByID[json.stepType];
          if (!type)
              throw new RangeError(`No step type ${json.stepType} defined`);
          return type.fromJSON(schema, json);
      }
      /**
      To be able to serialize steps to JSON, each step needs a string
      ID to attach to its JSON representation. Use this method to
      register an ID for your step classes. Try to pick something
      that's unlikely to clash with steps from other modules.
      */
      static jsonID(id, stepClass) {
          if (id in stepsByID)
              throw new RangeError("Duplicate use of step JSON ID " + id);
          stepsByID[id] = stepClass;
          stepClass.prototype.jsonID = id;
          return stepClass;
      }
  }
  /**
  The result of [applying](https://prosemirror.net/docs/ref/#transform.Step.apply) a step. Contains either a
  new document or a failure value.
  */
  class StepResult {
      /**
      @internal
      */
      constructor(
      /**
      The transformed document, if successful.
      */
      doc, 
      /**
      The failure message, if unsuccessful.
      */
      failed) {
          this.doc = doc;
          this.failed = failed;
      }
      /**
      Create a successful step result.
      */
      static ok(doc) { return new StepResult(doc, null); }
      /**
      Create a failed step result.
      */
      static fail(message) { return new StepResult(null, message); }
      /**
      Call [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) with the given
      arguments. Create a successful result if it succeeds, and a
      failed one if it throws a `ReplaceError`.
      */
      static fromReplace(doc, from, to, slice) {
          try {
              return StepResult.ok(doc.replace(from, to, slice));
          }
          catch (e) {
              if (e instanceof ReplaceError)
                  return StepResult.fail(e.message);
              throw e;
          }
      }
  }

  function mapFragment(fragment, f, parent) {
      let mapped = [];
      for (let i = 0; i < fragment.childCount; i++) {
          let child = fragment.child(i);
          if (child.content.size)
              child = child.copy(mapFragment(child.content, f, child));
          if (child.isInline)
              child = f(child, parent, i);
          mapped.push(child);
      }
      return Fragment.fromArray(mapped);
  }
  /**
  Add a mark to all inline content between two positions.
  */
  class AddMarkStep extends Step {
      /**
      Create a mark step.
      */
      constructor(
      /**
      The start of the marked range.
      */
      from, 
      /**
      The end of the marked range.
      */
      to, 
      /**
      The mark to add.
      */
      mark) {
          super();
          this.from = from;
          this.to = to;
          this.mark = mark;
      }
      apply(doc) {
          let oldSlice = doc.slice(this.from, this.to), $from = doc.resolve(this.from);
          let parent = $from.node($from.sharedDepth(this.to));
          let slice = new Slice(mapFragment(oldSlice.content, (node, parent) => {
              if (!node.isAtom || !parent.type.allowsMarkType(this.mark.type))
                  return node;
              return node.mark(this.mark.addToSet(node.marks));
          }, parent), oldSlice.openStart, oldSlice.openEnd);
          return StepResult.fromReplace(doc, this.from, this.to, slice);
      }
      invert() {
          return new RemoveMarkStep(this.from, this.to, this.mark);
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          if (from.deleted && to.deleted || from.pos >= to.pos)
              return null;
          return new AddMarkStep(from.pos, to.pos, this.mark);
      }
      merge(other) {
          if (other instanceof AddMarkStep &&
              other.mark.eq(this.mark) &&
              this.from <= other.to && this.to >= other.from)
              return new AddMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
          return null;
      }
      toJSON() {
          return { stepType: "addMark", mark: this.mark.toJSON(),
              from: this.from, to: this.to };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number")
              throw new RangeError("Invalid input for AddMarkStep.fromJSON");
          return new AddMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("addMark", AddMarkStep);
  /**
  Remove a mark from all inline content between two positions.
  */
  class RemoveMarkStep extends Step {
      /**
      Create a mark-removing step.
      */
      constructor(
      /**
      The start of the unmarked range.
      */
      from, 
      /**
      The end of the unmarked range.
      */
      to, 
      /**
      The mark to remove.
      */
      mark) {
          super();
          this.from = from;
          this.to = to;
          this.mark = mark;
      }
      apply(doc) {
          let oldSlice = doc.slice(this.from, this.to);
          let slice = new Slice(mapFragment(oldSlice.content, node => {
              return node.mark(this.mark.removeFromSet(node.marks));
          }, doc), oldSlice.openStart, oldSlice.openEnd);
          return StepResult.fromReplace(doc, this.from, this.to, slice);
      }
      invert() {
          return new AddMarkStep(this.from, this.to, this.mark);
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          if (from.deleted && to.deleted || from.pos >= to.pos)
              return null;
          return new RemoveMarkStep(from.pos, to.pos, this.mark);
      }
      merge(other) {
          if (other instanceof RemoveMarkStep &&
              other.mark.eq(this.mark) &&
              this.from <= other.to && this.to >= other.from)
              return new RemoveMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
          return null;
      }
      toJSON() {
          return { stepType: "removeMark", mark: this.mark.toJSON(),
              from: this.from, to: this.to };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number")
              throw new RangeError("Invalid input for RemoveMarkStep.fromJSON");
          return new RemoveMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("removeMark", RemoveMarkStep);
  /**
  Add a mark to a specific node.
  */
  class AddNodeMarkStep extends Step {
      /**
      Create a node mark step.
      */
      constructor(
      /**
      The position of the target node.
      */
      pos, 
      /**
      The mark to add.
      */
      mark) {
          super();
          this.pos = pos;
          this.mark = mark;
      }
      apply(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node)
              return StepResult.fail("No node at mark step's position");
          let updated = node.type.create(node.attrs, null, this.mark.addToSet(node.marks));
          return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
      }
      invert(doc) {
          let node = doc.nodeAt(this.pos);
          if (node) {
              let newSet = this.mark.addToSet(node.marks);
              if (newSet.length == node.marks.length) {
                  for (let i = 0; i < node.marks.length; i++)
                      if (!node.marks[i].isInSet(newSet))
                          return new AddNodeMarkStep(this.pos, node.marks[i]);
                  return new AddNodeMarkStep(this.pos, this.mark);
              }
          }
          return new RemoveNodeMarkStep(this.pos, this.mark);
      }
      map(mapping) {
          let pos = mapping.mapResult(this.pos, 1);
          return pos.deletedAfter ? null : new AddNodeMarkStep(pos.pos, this.mark);
      }
      toJSON() {
          return { stepType: "addNodeMark", pos: this.pos, mark: this.mark.toJSON() };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.pos != "number")
              throw new RangeError("Invalid input for AddNodeMarkStep.fromJSON");
          return new AddNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("addNodeMark", AddNodeMarkStep);
  /**
  Remove a mark from a specific node.
  */
  class RemoveNodeMarkStep extends Step {
      /**
      Create a mark-removing step.
      */
      constructor(
      /**
      The position of the target node.
      */
      pos, 
      /**
      The mark to remove.
      */
      mark) {
          super();
          this.pos = pos;
          this.mark = mark;
      }
      apply(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node)
              return StepResult.fail("No node at mark step's position");
          let updated = node.type.create(node.attrs, null, this.mark.removeFromSet(node.marks));
          return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
      }
      invert(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node || !this.mark.isInSet(node.marks))
              return this;
          return new AddNodeMarkStep(this.pos, this.mark);
      }
      map(mapping) {
          let pos = mapping.mapResult(this.pos, 1);
          return pos.deletedAfter ? null : new RemoveNodeMarkStep(pos.pos, this.mark);
      }
      toJSON() {
          return { stepType: "removeNodeMark", pos: this.pos, mark: this.mark.toJSON() };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.pos != "number")
              throw new RangeError("Invalid input for RemoveNodeMarkStep.fromJSON");
          return new RemoveNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("removeNodeMark", RemoveNodeMarkStep);

  /**
  Replace a part of the document with a slice of new content.
  */
  class ReplaceStep extends Step {
      /**
      The given `slice` should fit the 'gap' between `from` and
      `to`—the depths must line up, and the surrounding nodes must be
      able to be joined with the open sides of the slice. When
      `structure` is true, the step will fail if the content between
      from and to is not just a sequence of closing and then opening
      tokens (this is to guard against rebased replace steps
      overwriting something they weren't supposed to).
      */
      constructor(
      /**
      The start position of the replaced range.
      */
      from, 
      /**
      The end position of the replaced range.
      */
      to, 
      /**
      The slice to insert.
      */
      slice, 
      /**
      @internal
      */
      structure = false) {
          super();
          this.from = from;
          this.to = to;
          this.slice = slice;
          this.structure = structure;
      }
      apply(doc) {
          if (this.structure && contentBetween(doc, this.from, this.to))
              return StepResult.fail("Structure replace would overwrite content");
          return StepResult.fromReplace(doc, this.from, this.to, this.slice);
      }
      getMap() {
          return new StepMap([this.from, this.to - this.from, this.slice.size]);
      }
      invert(doc) {
          return new ReplaceStep(this.from, this.from + this.slice.size, doc.slice(this.from, this.to));
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          if (from.deletedAcross && to.deletedAcross)
              return null;
          return new ReplaceStep(from.pos, Math.max(from.pos, to.pos), this.slice);
      }
      merge(other) {
          if (!(other instanceof ReplaceStep) || other.structure || this.structure)
              return null;
          if (this.from + this.slice.size == other.from && !this.slice.openEnd && !other.slice.openStart) {
              let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                  : new Slice(this.slice.content.append(other.slice.content), this.slice.openStart, other.slice.openEnd);
              return new ReplaceStep(this.from, this.to + (other.to - other.from), slice, this.structure);
          }
          else if (other.to == this.from && !this.slice.openStart && !other.slice.openEnd) {
              let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                  : new Slice(other.slice.content.append(this.slice.content), other.slice.openStart, this.slice.openEnd);
              return new ReplaceStep(other.from, this.to, slice, this.structure);
          }
          else {
              return null;
          }
      }
      toJSON() {
          let json = { stepType: "replace", from: this.from, to: this.to };
          if (this.slice.size)
              json.slice = this.slice.toJSON();
          if (this.structure)
              json.structure = true;
          return json;
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number")
              throw new RangeError("Invalid input for ReplaceStep.fromJSON");
          return new ReplaceStep(json.from, json.to, Slice.fromJSON(schema, json.slice), !!json.structure);
      }
  }
  Step.jsonID("replace", ReplaceStep);
  /**
  Replace a part of the document with a slice of content, but
  preserve a range of the replaced content by moving it into the
  slice.
  */
  class ReplaceAroundStep extends Step {
      /**
      Create a replace-around step with the given range and gap.
      `insert` should be the point in the slice into which the content
      of the gap should be moved. `structure` has the same meaning as
      it has in the [`ReplaceStep`](https://prosemirror.net/docs/ref/#transform.ReplaceStep) class.
      */
      constructor(
      /**
      The start position of the replaced range.
      */
      from, 
      /**
      The end position of the replaced range.
      */
      to, 
      /**
      The start of preserved range.
      */
      gapFrom, 
      /**
      The end of preserved range.
      */
      gapTo, 
      /**
      The slice to insert.
      */
      slice, 
      /**
      The position in the slice where the preserved range should be
      inserted.
      */
      insert, 
      /**
      @internal
      */
      structure = false) {
          super();
          this.from = from;
          this.to = to;
          this.gapFrom = gapFrom;
          this.gapTo = gapTo;
          this.slice = slice;
          this.insert = insert;
          this.structure = structure;
      }
      apply(doc) {
          if (this.structure && (contentBetween(doc, this.from, this.gapFrom) ||
              contentBetween(doc, this.gapTo, this.to)))
              return StepResult.fail("Structure gap-replace would overwrite content");
          let gap = doc.slice(this.gapFrom, this.gapTo);
          if (gap.openStart || gap.openEnd)
              return StepResult.fail("Gap is not a flat range");
          let inserted = this.slice.insertAt(this.insert, gap.content);
          if (!inserted)
              return StepResult.fail("Content does not fit in gap");
          return StepResult.fromReplace(doc, this.from, this.to, inserted);
      }
      getMap() {
          return new StepMap([this.from, this.gapFrom - this.from, this.insert,
              this.gapTo, this.to - this.gapTo, this.slice.size - this.insert]);
      }
      invert(doc) {
          let gap = this.gapTo - this.gapFrom;
          return new ReplaceAroundStep(this.from, this.from + this.slice.size + gap, this.from + this.insert, this.from + this.insert + gap, doc.slice(this.from, this.to).removeBetween(this.gapFrom - this.from, this.gapTo - this.from), this.gapFrom - this.from, this.structure);
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          let gapFrom = mapping.map(this.gapFrom, -1), gapTo = mapping.map(this.gapTo, 1);
          if ((from.deletedAcross && to.deletedAcross) || gapFrom < from.pos || gapTo > to.pos)
              return null;
          return new ReplaceAroundStep(from.pos, to.pos, gapFrom, gapTo, this.slice, this.insert, this.structure);
      }
      toJSON() {
          let json = { stepType: "replaceAround", from: this.from, to: this.to,
              gapFrom: this.gapFrom, gapTo: this.gapTo, insert: this.insert };
          if (this.slice.size)
              json.slice = this.slice.toJSON();
          if (this.structure)
              json.structure = true;
          return json;
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number" ||
              typeof json.gapFrom != "number" || typeof json.gapTo != "number" || typeof json.insert != "number")
              throw new RangeError("Invalid input for ReplaceAroundStep.fromJSON");
          return new ReplaceAroundStep(json.from, json.to, json.gapFrom, json.gapTo, Slice.fromJSON(schema, json.slice), json.insert, !!json.structure);
      }
  }
  Step.jsonID("replaceAround", ReplaceAroundStep);
  function contentBetween(doc, from, to) {
      let $from = doc.resolve(from), dist = to - from, depth = $from.depth;
      while (dist > 0 && depth > 0 && $from.indexAfter(depth) == $from.node(depth).childCount) {
          depth--;
          dist--;
      }
      if (dist > 0) {
          let next = $from.node(depth).maybeChild($from.indexAfter(depth));
          while (dist > 0) {
              if (!next || next.isLeaf)
                  return true;
              next = next.firstChild;
              dist--;
          }
      }
      return false;
  }

  function addMark(tr, from, to, mark) {
      let removed = [], added = [];
      let removing, adding;
      tr.doc.nodesBetween(from, to, (node, pos, parent) => {
          if (!node.isInline)
              return;
          let marks = node.marks;
          if (!mark.isInSet(marks) && parent.type.allowsMarkType(mark.type)) {
              let start = Math.max(pos, from), end = Math.min(pos + node.nodeSize, to);
              let newSet = mark.addToSet(marks);
              for (let i = 0; i < marks.length; i++) {
                  if (!marks[i].isInSet(newSet)) {
                      if (removing && removing.to == start && removing.mark.eq(marks[i]))
                          removing.to = end;
                      else
                          removed.push(removing = new RemoveMarkStep(start, end, marks[i]));
                  }
              }
              if (adding && adding.to == start)
                  adding.to = end;
              else
                  added.push(adding = new AddMarkStep(start, end, mark));
          }
      });
      removed.forEach(s => tr.step(s));
      added.forEach(s => tr.step(s));
  }
  function removeMark(tr, from, to, mark) {
      let matched = [], step = 0;
      tr.doc.nodesBetween(from, to, (node, pos) => {
          if (!node.isInline)
              return;
          step++;
          let toRemove = null;
          if (mark instanceof MarkType) {
              let set = node.marks, found;
              while (found = mark.isInSet(set)) {
                  (toRemove || (toRemove = [])).push(found);
                  set = found.removeFromSet(set);
              }
          }
          else if (mark) {
              if (mark.isInSet(node.marks))
                  toRemove = [mark];
          }
          else {
              toRemove = node.marks;
          }
          if (toRemove && toRemove.length) {
              let end = Math.min(pos + node.nodeSize, to);
              for (let i = 0; i < toRemove.length; i++) {
                  let style = toRemove[i], found;
                  for (let j = 0; j < matched.length; j++) {
                      let m = matched[j];
                      if (m.step == step - 1 && style.eq(matched[j].style))
                          found = m;
                  }
                  if (found) {
                      found.to = end;
                      found.step = step;
                  }
                  else {
                      matched.push({ style, from: Math.max(pos, from), to: end, step });
                  }
              }
          }
      });
      matched.forEach(m => tr.step(new RemoveMarkStep(m.from, m.to, m.style)));
  }
  function clearIncompatible(tr, pos, parentType, match = parentType.contentMatch) {
      let node = tr.doc.nodeAt(pos);
      let delSteps = [], cur = pos + 1;
      for (let i = 0; i < node.childCount; i++) {
          let child = node.child(i), end = cur + child.nodeSize;
          let allowed = match.matchType(child.type);
          if (!allowed) {
              delSteps.push(new ReplaceStep(cur, end, Slice.empty));
          }
          else {
              match = allowed;
              for (let j = 0; j < child.marks.length; j++)
                  if (!parentType.allowsMarkType(child.marks[j].type))
                      tr.step(new RemoveMarkStep(cur, end, child.marks[j]));
          }
          cur = end;
      }
      if (!match.validEnd) {
          let fill = match.fillBefore(Fragment.empty, true);
          tr.replace(cur, cur, new Slice(fill, 0, 0));
      }
      for (let i = delSteps.length - 1; i >= 0; i--)
          tr.step(delSteps[i]);
  }
  function lift(tr, range, target) {
      let { $from, $to, depth } = range;
      let gapStart = $from.before(depth + 1), gapEnd = $to.after(depth + 1);
      let start = gapStart, end = gapEnd;
      let before = Fragment.empty, openStart = 0;
      for (let d = depth, splitting = false; d > target; d--)
          if (splitting || $from.index(d) > 0) {
              splitting = true;
              before = Fragment.from($from.node(d).copy(before));
              openStart++;
          }
          else {
              start--;
          }
      let after = Fragment.empty, openEnd = 0;
      for (let d = depth, splitting = false; d > target; d--)
          if (splitting || $to.after(d + 1) < $to.end(d)) {
              splitting = true;
              after = Fragment.from($to.node(d).copy(after));
              openEnd++;
          }
          else {
              end++;
          }
      tr.step(new ReplaceAroundStep(start, end, gapStart, gapEnd, new Slice(before.append(after), openStart, openEnd), before.size - openStart, true));
  }
  /**
  Try to find a valid way to wrap the content in the given range in a
  node of the given type. May introduce extra nodes around and inside
  the wrapper node, if necessary. Returns null if no valid wrapping
  could be found. When `innerRange` is given, that range's content is
  used as the content to fit into the wrapping, instead of the
  content of `range`.
  */
  function findWrapping(range, nodeType, attrs = null, innerRange = range) {
      let around = findWrappingOutside(range, nodeType);
      let inner = around && findWrappingInside(innerRange, nodeType);
      if (!inner)
          return null;
      return around.map(withAttrs)
          .concat({ type: nodeType, attrs }).concat(inner.map(withAttrs));
  }
  function withAttrs(type) { return { type, attrs: null }; }
  function findWrappingOutside(range, type) {
      let { parent, startIndex, endIndex } = range;
      let around = parent.contentMatchAt(startIndex).findWrapping(type);
      if (!around)
          return null;
      let outer = around.length ? around[0] : type;
      return parent.canReplaceWith(startIndex, endIndex, outer) ? around : null;
  }
  function findWrappingInside(range, type) {
      let { parent, startIndex, endIndex } = range;
      let inner = parent.child(startIndex);
      let inside = type.contentMatch.findWrapping(inner.type);
      if (!inside)
          return null;
      let lastType = inside.length ? inside[inside.length - 1] : type;
      let innerMatch = lastType.contentMatch;
      for (let i = startIndex; innerMatch && i < endIndex; i++)
          innerMatch = innerMatch.matchType(parent.child(i).type);
      if (!innerMatch || !innerMatch.validEnd)
          return null;
      return inside;
  }
  function wrap(tr, range, wrappers) {
      let content = Fragment.empty;
      for (let i = wrappers.length - 1; i >= 0; i--) {
          if (content.size) {
              let match = wrappers[i].type.contentMatch.matchFragment(content);
              if (!match || !match.validEnd)
                  throw new RangeError("Wrapper type given to Transform.wrap does not form valid content of its parent wrapper");
          }
          content = Fragment.from(wrappers[i].type.create(wrappers[i].attrs, content));
      }
      let start = range.start, end = range.end;
      tr.step(new ReplaceAroundStep(start, end, start, end, new Slice(content, 0, 0), wrappers.length, true));
  }
  function setBlockType(tr, from, to, type, attrs) {
      if (!type.isTextblock)
          throw new RangeError("Type given to setBlockType should be a textblock");
      let mapFrom = tr.steps.length;
      tr.doc.nodesBetween(from, to, (node, pos) => {
          if (node.isTextblock && !node.hasMarkup(type, attrs) && canChangeType(tr.doc, tr.mapping.slice(mapFrom).map(pos), type)) {
              // Ensure all markup that isn't allowed in the new node type is cleared
              tr.clearIncompatible(tr.mapping.slice(mapFrom).map(pos, 1), type);
              let mapping = tr.mapping.slice(mapFrom);
              let startM = mapping.map(pos, 1), endM = mapping.map(pos + node.nodeSize, 1);
              tr.step(new ReplaceAroundStep(startM, endM, startM + 1, endM - 1, new Slice(Fragment.from(type.create(attrs, null, node.marks)), 0, 0), 1, true));
              return false;
          }
      });
  }
  function canChangeType(doc, pos, type) {
      let $pos = doc.resolve(pos), index = $pos.index();
      return $pos.parent.canReplaceWith(index, index + 1, type);
  }
  /**
  Change the type, attributes, and/or marks of the node at `pos`.
  When `type` isn't given, the existing node type is preserved,
  */
  function setNodeMarkup(tr, pos, type, attrs, marks) {
      let node = tr.doc.nodeAt(pos);
      if (!node)
          throw new RangeError("No node at given position");
      if (!type)
          type = node.type;
      let newNode = type.create(attrs, null, marks || node.marks);
      if (node.isLeaf)
          return tr.replaceWith(pos, pos + node.nodeSize, newNode);
      if (!type.validContent(node.content))
          throw new RangeError("Invalid content for node type " + type.name);
      tr.step(new ReplaceAroundStep(pos, pos + node.nodeSize, pos + 1, pos + node.nodeSize - 1, new Slice(Fragment.from(newNode), 0, 0), 1, true));
  }
  function split(tr, pos, depth = 1, typesAfter) {
      let $pos = tr.doc.resolve(pos), before = Fragment.empty, after = Fragment.empty;
      for (let d = $pos.depth, e = $pos.depth - depth, i = depth - 1; d > e; d--, i--) {
          before = Fragment.from($pos.node(d).copy(before));
          let typeAfter = typesAfter && typesAfter[i];
          after = Fragment.from(typeAfter ? typeAfter.type.create(typeAfter.attrs, after) : $pos.node(d).copy(after));
      }
      tr.step(new ReplaceStep(pos, pos, new Slice(before.append(after), depth, depth), true));
  }
  function join(tr, pos, depth) {
      let step = new ReplaceStep(pos - depth, pos + depth, Slice.empty, true);
      tr.step(step);
  }
  /**
  Try to find a point where a node of the given type can be inserted
  near `pos`, by searching up the node hierarchy when `pos` itself
  isn't a valid place but is at the start or end of a node. Return
  null if no position was found.
  */
  function insertPoint(doc, pos, nodeType) {
      let $pos = doc.resolve(pos);
      if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), nodeType))
          return pos;
      if ($pos.parentOffset == 0)
          for (let d = $pos.depth - 1; d >= 0; d--) {
              let index = $pos.index(d);
              if ($pos.node(d).canReplaceWith(index, index, nodeType))
                  return $pos.before(d + 1);
              if (index > 0)
                  return null;
          }
      if ($pos.parentOffset == $pos.parent.content.size)
          for (let d = $pos.depth - 1; d >= 0; d--) {
              let index = $pos.indexAfter(d);
              if ($pos.node(d).canReplaceWith(index, index, nodeType))
                  return $pos.after(d + 1);
              if (index < $pos.node(d).childCount)
                  return null;
          }
      return null;
  }
  /**
  Finds a position at or around the given position where the given
  slice can be inserted. Will look at parent nodes' nearest boundary
  and try there, even if the original position wasn't directly at the
  start or end of that node. Returns null when no position was found.
  */
  function dropPoint(doc, pos, slice) {
      let $pos = doc.resolve(pos);
      if (!slice.content.size)
          return pos;
      let content = slice.content;
      for (let i = 0; i < slice.openStart; i++)
          content = content.firstChild.content;
      for (let pass = 1; pass <= (slice.openStart == 0 && slice.size ? 2 : 1); pass++) {
          for (let d = $pos.depth; d >= 0; d--) {
              let bias = d == $pos.depth ? 0 : $pos.pos <= ($pos.start(d + 1) + $pos.end(d + 1)) / 2 ? -1 : 1;
              let insertPos = $pos.index(d) + (bias > 0 ? 1 : 0);
              let parent = $pos.node(d), fits = false;
              if (pass == 1) {
                  fits = parent.canReplace(insertPos, insertPos, content);
              }
              else {
                  let wrapping = parent.contentMatchAt(insertPos).findWrapping(content.firstChild.type);
                  fits = wrapping && parent.canReplaceWith(insertPos, insertPos, wrapping[0]);
              }
              if (fits)
                  return bias == 0 ? $pos.pos : bias < 0 ? $pos.before(d + 1) : $pos.after(d + 1);
          }
      }
      return null;
  }

  /**
  ‘Fit’ a slice into a given position in the document, producing a
  [step](https://prosemirror.net/docs/ref/#transform.Step) that inserts it. Will return null if
  there's no meaningful way to insert the slice here, or inserting it
  would be a no-op (an empty slice over an empty range).
  */
  function replaceStep(doc, from, to = from, slice = Slice.empty) {
      if (from == to && !slice.size)
          return null;
      let $from = doc.resolve(from), $to = doc.resolve(to);
      // Optimization -- avoid work if it's obvious that it's not needed.
      if (fitsTrivially($from, $to, slice))
          return new ReplaceStep(from, to, slice);
      return new Fitter($from, $to, slice).fit();
  }
  function fitsTrivially($from, $to, slice) {
      return !slice.openStart && !slice.openEnd && $from.start() == $to.start() &&
          $from.parent.canReplace($from.index(), $to.index(), slice.content);
  }
  // Algorithm for 'placing' the elements of a slice into a gap:
  //
  // We consider the content of each node that is open to the left to be
  // independently placeable. I.e. in <p("foo"), p("bar")>, when the
  // paragraph on the left is open, "foo" can be placed (somewhere on
  // the left side of the replacement gap) independently from p("bar").
  //
  // This class tracks the state of the placement progress in the
  // following properties:
  //
  //  - `frontier` holds a stack of `{type, match}` objects that
  //    represent the open side of the replacement. It starts at
  //    `$from`, then moves forward as content is placed, and is finally
  //    reconciled with `$to`.
  //
  //  - `unplaced` is a slice that represents the content that hasn't
  //    been placed yet.
  //
  //  - `placed` is a fragment of placed content. Its open-start value
  //    is implicit in `$from`, and its open-end value in `frontier`.
  class Fitter {
      constructor($from, $to, unplaced) {
          this.$from = $from;
          this.$to = $to;
          this.unplaced = unplaced;
          this.frontier = [];
          this.placed = Fragment.empty;
          for (let i = 0; i <= $from.depth; i++) {
              let node = $from.node(i);
              this.frontier.push({
                  type: node.type,
                  match: node.contentMatchAt($from.indexAfter(i))
              });
          }
          for (let i = $from.depth; i > 0; i--)
              this.placed = Fragment.from($from.node(i).copy(this.placed));
      }
      get depth() { return this.frontier.length - 1; }
      fit() {
          // As long as there's unplaced content, try to place some of it.
          // If that fails, either increase the open score of the unplaced
          // slice, or drop nodes from it, and then try again.
          while (this.unplaced.size) {
              let fit = this.findFittable();
              if (fit)
                  this.placeNodes(fit);
              else
                  this.openMore() || this.dropNode();
          }
          // When there's inline content directly after the frontier _and_
          // directly after `this.$to`, we must generate a `ReplaceAround`
          // step that pulls that content into the node after the frontier.
          // That means the fitting must be done to the end of the textblock
          // node after `this.$to`, not `this.$to` itself.
          let moveInline = this.mustMoveInline(), placedSize = this.placed.size - this.depth - this.$from.depth;
          let $from = this.$from, $to = this.close(moveInline < 0 ? this.$to : $from.doc.resolve(moveInline));
          if (!$to)
              return null;
          // If closing to `$to` succeeded, create a step
          let content = this.placed, openStart = $from.depth, openEnd = $to.depth;
          while (openStart && openEnd && content.childCount == 1) { // Normalize by dropping open parent nodes
              content = content.firstChild.content;
              openStart--;
              openEnd--;
          }
          let slice = new Slice(content, openStart, openEnd);
          if (moveInline > -1)
              return new ReplaceAroundStep($from.pos, moveInline, this.$to.pos, this.$to.end(), slice, placedSize);
          if (slice.size || $from.pos != this.$to.pos) // Don't generate no-op steps
              return new ReplaceStep($from.pos, $to.pos, slice);
          return null;
      }
      // Find a position on the start spine of `this.unplaced` that has
      // content that can be moved somewhere on the frontier. Returns two
      // depths, one for the slice and one for the frontier.
      findFittable() {
          // Only try wrapping nodes (pass 2) after finding a place without
          // wrapping failed.
          for (let pass = 1; pass <= 2; pass++) {
              for (let sliceDepth = this.unplaced.openStart; sliceDepth >= 0; sliceDepth--) {
                  let fragment, parent = null;
                  if (sliceDepth) {
                      parent = contentAt(this.unplaced.content, sliceDepth - 1).firstChild;
                      fragment = parent.content;
                  }
                  else {
                      fragment = this.unplaced.content;
                  }
                  let first = fragment.firstChild;
                  for (let frontierDepth = this.depth; frontierDepth >= 0; frontierDepth--) {
                      let { type, match } = this.frontier[frontierDepth], wrap, inject = null;
                      // In pass 1, if the next node matches, or there is no next
                      // node but the parents look compatible, we've found a
                      // place.
                      if (pass == 1 && (first ? match.matchType(first.type) || (inject = match.fillBefore(Fragment.from(first), false))
                          : parent && type.compatibleContent(parent.type)))
                          return { sliceDepth, frontierDepth, parent, inject };
                      // In pass 2, look for a set of wrapping nodes that make
                      // `first` fit here.
                      else if (pass == 2 && first && (wrap = match.findWrapping(first.type)))
                          return { sliceDepth, frontierDepth, parent, wrap };
                      // Don't continue looking further up if the parent node
                      // would fit here.
                      if (parent && match.matchType(parent.type))
                          break;
                  }
              }
          }
      }
      openMore() {
          let { content, openStart, openEnd } = this.unplaced;
          let inner = contentAt(content, openStart);
          if (!inner.childCount || inner.firstChild.isLeaf)
              return false;
          this.unplaced = new Slice(content, openStart + 1, Math.max(openEnd, inner.size + openStart >= content.size - openEnd ? openStart + 1 : 0));
          return true;
      }
      dropNode() {
          let { content, openStart, openEnd } = this.unplaced;
          let inner = contentAt(content, openStart);
          if (inner.childCount <= 1 && openStart > 0) {
              let openAtEnd = content.size - openStart <= openStart + inner.size;
              this.unplaced = new Slice(dropFromFragment(content, openStart - 1, 1), openStart - 1, openAtEnd ? openStart - 1 : openEnd);
          }
          else {
              this.unplaced = new Slice(dropFromFragment(content, openStart, 1), openStart, openEnd);
          }
      }
      // Move content from the unplaced slice at `sliceDepth` to the
      // frontier node at `frontierDepth`. Close that frontier node when
      // applicable.
      placeNodes({ sliceDepth, frontierDepth, parent, inject, wrap }) {
          while (this.depth > frontierDepth)
              this.closeFrontierNode();
          if (wrap)
              for (let i = 0; i < wrap.length; i++)
                  this.openFrontierNode(wrap[i]);
          let slice = this.unplaced, fragment = parent ? parent.content : slice.content;
          let openStart = slice.openStart - sliceDepth;
          let taken = 0, add = [];
          let { match, type } = this.frontier[frontierDepth];
          if (inject) {
              for (let i = 0; i < inject.childCount; i++)
                  add.push(inject.child(i));
              match = match.matchFragment(inject);
          }
          // Computes the amount of (end) open nodes at the end of the
          // fragment. When 0, the parent is open, but no more. When
          // negative, nothing is open.
          let openEndCount = (fragment.size + sliceDepth) - (slice.content.size - slice.openEnd);
          // Scan over the fragment, fitting as many child nodes as
          // possible.
          while (taken < fragment.childCount) {
              let next = fragment.child(taken), matches = match.matchType(next.type);
              if (!matches)
                  break;
              taken++;
              if (taken > 1 || openStart == 0 || next.content.size) { // Drop empty open nodes
                  match = matches;
                  add.push(closeNodeStart(next.mark(type.allowedMarks(next.marks)), taken == 1 ? openStart : 0, taken == fragment.childCount ? openEndCount : -1));
              }
          }
          let toEnd = taken == fragment.childCount;
          if (!toEnd)
              openEndCount = -1;
          this.placed = addToFragment(this.placed, frontierDepth, Fragment.from(add));
          this.frontier[frontierDepth].match = match;
          // If the parent types match, and the entire node was moved, and
          // it's not open, close this frontier node right away.
          if (toEnd && openEndCount < 0 && parent && parent.type == this.frontier[this.depth].type && this.frontier.length > 1)
              this.closeFrontierNode();
          // Add new frontier nodes for any open nodes at the end.
          for (let i = 0, cur = fragment; i < openEndCount; i++) {
              let node = cur.lastChild;
              this.frontier.push({ type: node.type, match: node.contentMatchAt(node.childCount) });
              cur = node.content;
          }
          // Update `this.unplaced`. Drop the entire node from which we
          // placed it we got to its end, otherwise just drop the placed
          // nodes.
          this.unplaced = !toEnd ? new Slice(dropFromFragment(slice.content, sliceDepth, taken), slice.openStart, slice.openEnd)
              : sliceDepth == 0 ? Slice.empty
                  : new Slice(dropFromFragment(slice.content, sliceDepth - 1, 1), sliceDepth - 1, openEndCount < 0 ? slice.openEnd : sliceDepth - 1);
      }
      mustMoveInline() {
          if (!this.$to.parent.isTextblock)
              return -1;
          let top = this.frontier[this.depth], level;
          if (!top.type.isTextblock || !contentAfterFits(this.$to, this.$to.depth, top.type, top.match, false) ||
              (this.$to.depth == this.depth && (level = this.findCloseLevel(this.$to)) && level.depth == this.depth))
              return -1;
          let { depth } = this.$to, after = this.$to.after(depth);
          while (depth > 1 && after == this.$to.end(--depth))
              ++after;
          return after;
      }
      findCloseLevel($to) {
          scan: for (let i = Math.min(this.depth, $to.depth); i >= 0; i--) {
              let { match, type } = this.frontier[i];
              let dropInner = i < $to.depth && $to.end(i + 1) == $to.pos + ($to.depth - (i + 1));
              let fit = contentAfterFits($to, i, type, match, dropInner);
              if (!fit)
                  continue;
              for (let d = i - 1; d >= 0; d--) {
                  let { match, type } = this.frontier[d];
                  let matches = contentAfterFits($to, d, type, match, true);
                  if (!matches || matches.childCount)
                      continue scan;
              }
              return { depth: i, fit, move: dropInner ? $to.doc.resolve($to.after(i + 1)) : $to };
          }
      }
      close($to) {
          let close = this.findCloseLevel($to);
          if (!close)
              return null;
          while (this.depth > close.depth)
              this.closeFrontierNode();
          if (close.fit.childCount)
              this.placed = addToFragment(this.placed, close.depth, close.fit);
          $to = close.move;
          for (let d = close.depth + 1; d <= $to.depth; d++) {
              let node = $to.node(d), add = node.type.contentMatch.fillBefore(node.content, true, $to.index(d));
              this.openFrontierNode(node.type, node.attrs, add);
          }
          return $to;
      }
      openFrontierNode(type, attrs = null, content) {
          let top = this.frontier[this.depth];
          top.match = top.match.matchType(type);
          this.placed = addToFragment(this.placed, this.depth, Fragment.from(type.create(attrs, content)));
          this.frontier.push({ type, match: type.contentMatch });
      }
      closeFrontierNode() {
          let open = this.frontier.pop();
          let add = open.match.fillBefore(Fragment.empty, true);
          if (add.childCount)
              this.placed = addToFragment(this.placed, this.frontier.length, add);
      }
  }
  function dropFromFragment(fragment, depth, count) {
      if (depth == 0)
          return fragment.cutByIndex(count, fragment.childCount);
      return fragment.replaceChild(0, fragment.firstChild.copy(dropFromFragment(fragment.firstChild.content, depth - 1, count)));
  }
  function addToFragment(fragment, depth, content) {
      if (depth == 0)
          return fragment.append(content);
      return fragment.replaceChild(fragment.childCount - 1, fragment.lastChild.copy(addToFragment(fragment.lastChild.content, depth - 1, content)));
  }
  function contentAt(fragment, depth) {
      for (let i = 0; i < depth; i++)
          fragment = fragment.firstChild.content;
      return fragment;
  }
  function closeNodeStart(node, openStart, openEnd) {
      if (openStart <= 0)
          return node;
      let frag = node.content;
      if (openStart > 1)
          frag = frag.replaceChild(0, closeNodeStart(frag.firstChild, openStart - 1, frag.childCount == 1 ? openEnd - 1 : 0));
      if (openStart > 0) {
          frag = node.type.contentMatch.fillBefore(frag).append(frag);
          if (openEnd <= 0)
              frag = frag.append(node.type.contentMatch.matchFragment(frag).fillBefore(Fragment.empty, true));
      }
      return node.copy(frag);
  }
  function contentAfterFits($to, depth, type, match, open) {
      let node = $to.node(depth), index = open ? $to.indexAfter(depth) : $to.index(depth);
      if (index == node.childCount && !type.compatibleContent(node.type))
          return null;
      let fit = match.fillBefore(node.content, true, index);
      return fit && !invalidMarks(type, node.content, index) ? fit : null;
  }
  function invalidMarks(type, fragment, start) {
      for (let i = start; i < fragment.childCount; i++)
          if (!type.allowsMarks(fragment.child(i).marks))
              return true;
      return false;
  }
  function definesContent(type) {
      return type.spec.defining || type.spec.definingForContent;
  }
  function replaceRange(tr, from, to, slice) {
      if (!slice.size)
          return tr.deleteRange(from, to);
      let $from = tr.doc.resolve(from), $to = tr.doc.resolve(to);
      if (fitsTrivially($from, $to, slice))
          return tr.step(new ReplaceStep(from, to, slice));
      let targetDepths = coveredDepths($from, tr.doc.resolve(to));
      // Can't replace the whole document, so remove 0 if it's present
      if (targetDepths[targetDepths.length - 1] == 0)
          targetDepths.pop();
      // Negative numbers represent not expansion over the whole node at
      // that depth, but replacing from $from.before(-D) to $to.pos.
      let preferredTarget = -($from.depth + 1);
      targetDepths.unshift(preferredTarget);
      // This loop picks a preferred target depth, if one of the covering
      // depths is not outside of a defining node, and adds negative
      // depths for any depth that has $from at its start and does not
      // cross a defining node.
      for (let d = $from.depth, pos = $from.pos - 1; d > 0; d--, pos--) {
          let spec = $from.node(d).type.spec;
          if (spec.defining || spec.definingAsContext || spec.isolating)
              break;
          if (targetDepths.indexOf(d) > -1)
              preferredTarget = d;
          else if ($from.before(d) == pos)
              targetDepths.splice(1, 0, -d);
      }
      // Try to fit each possible depth of the slice into each possible
      // target depth, starting with the preferred depths.
      let preferredTargetIndex = targetDepths.indexOf(preferredTarget);
      let leftNodes = [], preferredDepth = slice.openStart;
      for (let content = slice.content, i = 0;; i++) {
          let node = content.firstChild;
          leftNodes.push(node);
          if (i == slice.openStart)
              break;
          content = node.content;
      }
      // Back up preferredDepth to cover defining textblocks directly
      // above it, possibly skipping a non-defining textblock.
      for (let d = preferredDepth - 1; d >= 0; d--) {
          let type = leftNodes[d].type, def = definesContent(type);
          if (def && $from.node(preferredTargetIndex).type != type)
              preferredDepth = d;
          else if (def || !type.isTextblock)
              break;
      }
      for (let j = slice.openStart; j >= 0; j--) {
          let openDepth = (j + preferredDepth + 1) % (slice.openStart + 1);
          let insert = leftNodes[openDepth];
          if (!insert)
              continue;
          for (let i = 0; i < targetDepths.length; i++) {
              // Loop over possible expansion levels, starting with the
              // preferred one
              let targetDepth = targetDepths[(i + preferredTargetIndex) % targetDepths.length], expand = true;
              if (targetDepth < 0) {
                  expand = false;
                  targetDepth = -targetDepth;
              }
              let parent = $from.node(targetDepth - 1), index = $from.index(targetDepth - 1);
              if (parent.canReplaceWith(index, index, insert.type, insert.marks))
                  return tr.replace($from.before(targetDepth), expand ? $to.after(targetDepth) : to, new Slice(closeFragment(slice.content, 0, slice.openStart, openDepth), openDepth, slice.openEnd));
          }
      }
      let startSteps = tr.steps.length;
      for (let i = targetDepths.length - 1; i >= 0; i--) {
          tr.replace(from, to, slice);
          if (tr.steps.length > startSteps)
              break;
          let depth = targetDepths[i];
          if (depth < 0)
              continue;
          from = $from.before(depth);
          to = $to.after(depth);
      }
  }
  function closeFragment(fragment, depth, oldOpen, newOpen, parent) {
      if (depth < oldOpen) {
          let first = fragment.firstChild;
          fragment = fragment.replaceChild(0, first.copy(closeFragment(first.content, depth + 1, oldOpen, newOpen, first)));
      }
      if (depth > newOpen) {
          let match = parent.contentMatchAt(0);
          let start = match.fillBefore(fragment).append(fragment);
          fragment = start.append(match.matchFragment(start).fillBefore(Fragment.empty, true));
      }
      return fragment;
  }
  function replaceRangeWith(tr, from, to, node) {
      if (!node.isInline && from == to && tr.doc.resolve(from).parent.content.size) {
          let point = insertPoint(tr.doc, from, node.type);
          if (point != null)
              from = to = point;
      }
      tr.replaceRange(from, to, new Slice(Fragment.from(node), 0, 0));
  }
  function deleteRange(tr, from, to) {
      let $from = tr.doc.resolve(from), $to = tr.doc.resolve(to);
      let covered = coveredDepths($from, $to);
      for (let i = 0; i < covered.length; i++) {
          let depth = covered[i], last = i == covered.length - 1;
          if ((last && depth == 0) || $from.node(depth).type.contentMatch.validEnd)
              return tr.delete($from.start(depth), $to.end(depth));
          if (depth > 0 && (last || $from.node(depth - 1).canReplace($from.index(depth - 1), $to.indexAfter(depth - 1))))
              return tr.delete($from.before(depth), $to.after(depth));
      }
      for (let d = 1; d <= $from.depth && d <= $to.depth; d++) {
          if (from - $from.start(d) == $from.depth - d && to > $from.end(d) && $to.end(d) - to != $to.depth - d)
              return tr.delete($from.before(d), to);
      }
      tr.delete(from, to);
  }
  // Returns an array of all depths for which $from - $to spans the
  // whole content of the nodes at that depth.
  function coveredDepths($from, $to) {
      let result = [], minDepth = Math.min($from.depth, $to.depth);
      for (let d = minDepth; d >= 0; d--) {
          let start = $from.start(d);
          if (start < $from.pos - ($from.depth - d) ||
              $to.end(d) > $to.pos + ($to.depth - d) ||
              $from.node(d).type.spec.isolating ||
              $to.node(d).type.spec.isolating)
              break;
          if (start == $to.start(d) ||
              (d == $from.depth && d == $to.depth && $from.parent.inlineContent && $to.parent.inlineContent &&
                  d && $to.start(d - 1) == start - 1))
              result.push(d);
      }
      return result;
  }

  /**
  Update an attribute in a specific node.
  */
  class AttrStep extends Step {
      /**
      Construct an attribute step.
      */
      constructor(
      /**
      The position of the target node.
      */
      pos, 
      /**
      The attribute to set.
      */
      attr, 
      // The attribute's new value.
      value) {
          super();
          this.pos = pos;
          this.attr = attr;
          this.value = value;
      }
      apply(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node)
              return StepResult.fail("No node at attribute step's position");
          let attrs = Object.create(null);
          for (let name in node.attrs)
              attrs[name] = node.attrs[name];
          attrs[this.attr] = this.value;
          let updated = node.type.create(attrs, null, node.marks);
          return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
      }
      getMap() {
          return StepMap.empty;
      }
      invert(doc) {
          return new AttrStep(this.pos, this.attr, doc.nodeAt(this.pos).attrs[this.attr]);
      }
      map(mapping) {
          let pos = mapping.mapResult(this.pos, 1);
          return pos.deletedAfter ? null : new AttrStep(pos.pos, this.attr, this.value);
      }
      toJSON() {
          return { stepType: "attr", pos: this.pos, attr: this.attr, value: this.value };
      }
      static fromJSON(schema, json) {
          if (typeof json.pos != "number" || typeof json.attr != "string")
              throw new RangeError("Invalid input for AttrStep.fromJSON");
          return new AttrStep(json.pos, json.attr, json.value);
      }
  }
  Step.jsonID("attr", AttrStep);

  /**
  @internal
  */
  let TransformError = class extends Error {
  };
  TransformError = function TransformError(message) {
      let err = Error.call(this, message);
      err.__proto__ = TransformError.prototype;
      return err;
  };
  TransformError.prototype = Object.create(Error.prototype);
  TransformError.prototype.constructor = TransformError;
  TransformError.prototype.name = "TransformError";
  /**
  Abstraction to build up and track an array of
  [steps](https://prosemirror.net/docs/ref/#transform.Step) representing a document transformation.

  Most transforming methods return the `Transform` object itself, so
  that they can be chained.
  */
  class Transform {
      /**
      Create a transform that starts with the given document.
      */
      constructor(
      /**
      The current document (the result of applying the steps in the
      transform).
      */
      doc) {
          this.doc = doc;
          /**
          The steps in this transform.
          */
          this.steps = [];
          /**
          The documents before each of the steps.
          */
          this.docs = [];
          /**
          A mapping with the maps for each of the steps in this transform.
          */
          this.mapping = new Mapping;
      }
      /**
      The starting document.
      */
      get before() { return this.docs.length ? this.docs[0] : this.doc; }
      /**
      Apply a new step in this transform, saving the result. Throws an
      error when the step fails.
      */
      step(step) {
          let result = this.maybeStep(step);
          if (result.failed)
              throw new TransformError(result.failed);
          return this;
      }
      /**
      Try to apply a step in this transformation, ignoring it if it
      fails. Returns the step result.
      */
      maybeStep(step) {
          let result = step.apply(this.doc);
          if (!result.failed)
              this.addStep(step, result.doc);
          return result;
      }
      /**
      True when the document has been changed (when there are any
      steps).
      */
      get docChanged() {
          return this.steps.length > 0;
      }
      /**
      @internal
      */
      addStep(step, doc) {
          this.docs.push(this.doc);
          this.steps.push(step);
          this.mapping.appendMap(step.getMap());
          this.doc = doc;
      }
      /**
      Replace the part of the document between `from` and `to` with the
      given `slice`.
      */
      replace(from, to = from, slice = Slice.empty) {
          let step = replaceStep(this.doc, from, to, slice);
          if (step)
              this.step(step);
          return this;
      }
      /**
      Replace the given range with the given content, which may be a
      fragment, node, or array of nodes.
      */
      replaceWith(from, to, content) {
          return this.replace(from, to, new Slice(Fragment.from(content), 0, 0));
      }
      /**
      Delete the content between the given positions.
      */
      delete(from, to) {
          return this.replace(from, to, Slice.empty);
      }
      /**
      Insert the given content at the given position.
      */
      insert(pos, content) {
          return this.replaceWith(pos, pos, content);
      }
      /**
      Replace a range of the document with a given slice, using
      `from`, `to`, and the slice's
      [`openStart`](https://prosemirror.net/docs/ref/#model.Slice.openStart) property as hints, rather
      than fixed start and end points. This method may grow the
      replaced area or close open nodes in the slice in order to get a
      fit that is more in line with WYSIWYG expectations, by dropping
      fully covered parent nodes of the replaced region when they are
      marked [non-defining as
      context](https://prosemirror.net/docs/ref/#model.NodeSpec.definingAsContext), or including an
      open parent node from the slice that _is_ marked as [defining
      its content](https://prosemirror.net/docs/ref/#model.NodeSpec.definingForContent).
      
      This is the method, for example, to handle paste. The similar
      [`replace`](https://prosemirror.net/docs/ref/#transform.Transform.replace) method is a more
      primitive tool which will _not_ move the start and end of its given
      range, and is useful in situations where you need more precise
      control over what happens.
      */
      replaceRange(from, to, slice) {
          replaceRange(this, from, to, slice);
          return this;
      }
      /**
      Replace the given range with a node, but use `from` and `to` as
      hints, rather than precise positions. When from and to are the same
      and are at the start or end of a parent node in which the given
      node doesn't fit, this method may _move_ them out towards a parent
      that does allow the given node to be placed. When the given range
      completely covers a parent node, this method may completely replace
      that parent node.
      */
      replaceRangeWith(from, to, node) {
          replaceRangeWith(this, from, to, node);
          return this;
      }
      /**
      Delete the given range, expanding it to cover fully covered
      parent nodes until a valid replace is found.
      */
      deleteRange(from, to) {
          deleteRange(this, from, to);
          return this;
      }
      /**
      Split the content in the given range off from its parent, if there
      is sibling content before or after it, and move it up the tree to
      the depth specified by `target`. You'll probably want to use
      [`liftTarget`](https://prosemirror.net/docs/ref/#transform.liftTarget) to compute `target`, to make
      sure the lift is valid.
      */
      lift(range, target) {
          lift(this, range, target);
          return this;
      }
      /**
      Join the blocks around the given position. If depth is 2, their
      last and first siblings are also joined, and so on.
      */
      join(pos, depth = 1) {
          join(this, pos, depth);
          return this;
      }
      /**
      Wrap the given [range](https://prosemirror.net/docs/ref/#model.NodeRange) in the given set of wrappers.
      The wrappers are assumed to be valid in this position, and should
      probably be computed with [`findWrapping`](https://prosemirror.net/docs/ref/#transform.findWrapping).
      */
      wrap(range, wrappers) {
          wrap(this, range, wrappers);
          return this;
      }
      /**
      Set the type of all textblocks (partly) between `from` and `to` to
      the given node type with the given attributes.
      */
      setBlockType(from, to = from, type, attrs = null) {
          setBlockType(this, from, to, type, attrs);
          return this;
      }
      /**
      Change the type, attributes, and/or marks of the node at `pos`.
      When `type` isn't given, the existing node type is preserved,
      */
      setNodeMarkup(pos, type, attrs = null, marks = []) {
          setNodeMarkup(this, pos, type, attrs, marks);
          return this;
      }
      /**
      Set a single attribute on a given node to a new value.
      */
      setNodeAttribute(pos, attr, value) {
          this.step(new AttrStep(pos, attr, value));
          return this;
      }
      /**
      Add a mark to the node at position `pos`.
      */
      addNodeMark(pos, mark) {
          this.step(new AddNodeMarkStep(pos, mark));
          return this;
      }
      /**
      Remove a mark (or a mark of the given type) from the node at
      position `pos`.
      */
      removeNodeMark(pos, mark) {
          if (!(mark instanceof Mark)) {
              let node = this.doc.nodeAt(pos);
              if (!node)
                  throw new RangeError("No node at position " + pos);
              mark = mark.isInSet(node.marks);
              if (!mark)
                  return this;
          }
          this.step(new RemoveNodeMarkStep(pos, mark));
          return this;
      }
      /**
      Split the node at the given position, and optionally, if `depth` is
      greater than one, any number of nodes above that. By default, the
      parts split off will inherit the node type of the original node.
      This can be changed by passing an array of types and attributes to
      use after the split.
      */
      split(pos, depth = 1, typesAfter) {
          split(this, pos, depth, typesAfter);
          return this;
      }
      /**
      Add the given mark to the inline content between `from` and `to`.
      */
      addMark(from, to, mark) {
          addMark(this, from, to, mark);
          return this;
      }
      /**
      Remove marks from inline nodes between `from` and `to`. When
      `mark` is a single mark, remove precisely that mark. When it is
      a mark type, remove all marks of that type. When it is null,
      remove all marks of any type.
      */
      removeMark(from, to, mark) {
          removeMark(this, from, to, mark);
          return this;
      }
      /**
      Removes all marks and nodes from the content of the node at
      `pos` that don't match the given new parent node type. Accepts
      an optional starting [content match](https://prosemirror.net/docs/ref/#model.ContentMatch) as
      third argument.
      */
      clearIncompatible(pos, parentType, match) {
          clearIncompatible(this, pos, parentType, match);
          return this;
      }
  }

  const classesById = Object.create(null);
  /**
  Superclass for editor selections. Every selection type should
  extend this. Should not be instantiated directly.
  */
  class Selection {
      /**
      Initialize a selection with the head and anchor and ranges. If no
      ranges are given, constructs a single range across `$anchor` and
      `$head`.
      */
      constructor(
      /**
      The resolved anchor of the selection (the side that stays in
      place when the selection is modified).
      */
      $anchor, 
      /**
      The resolved head of the selection (the side that moves when
      the selection is modified).
      */
      $head, ranges) {
          this.$anchor = $anchor;
          this.$head = $head;
          this.ranges = ranges || [new SelectionRange($anchor.min($head), $anchor.max($head))];
      }
      /**
      The selection's anchor, as an unresolved position.
      */
      get anchor() { return this.$anchor.pos; }
      /**
      The selection's head.
      */
      get head() { return this.$head.pos; }
      /**
      The lower bound of the selection's main range.
      */
      get from() { return this.$from.pos; }
      /**
      The upper bound of the selection's main range.
      */
      get to() { return this.$to.pos; }
      /**
      The resolved lower  bound of the selection's main range.
      */
      get $from() {
          return this.ranges[0].$from;
      }
      /**
      The resolved upper bound of the selection's main range.
      */
      get $to() {
          return this.ranges[0].$to;
      }
      /**
      Indicates whether the selection contains any content.
      */
      get empty() {
          let ranges = this.ranges;
          for (let i = 0; i < ranges.length; i++)
              if (ranges[i].$from.pos != ranges[i].$to.pos)
                  return false;
          return true;
      }
      /**
      Get the content of this selection as a slice.
      */
      content() {
          return this.$from.doc.slice(this.from, this.to, true);
      }
      /**
      Replace the selection with a slice or, if no slice is given,
      delete the selection. Will append to the given transaction.
      */
      replace(tr, content = Slice.empty) {
          // Put the new selection at the position after the inserted
          // content. When that ended in an inline node, search backwards,
          // to get the position after that node. If not, search forward.
          let lastNode = content.content.lastChild, lastParent = null;
          for (let i = 0; i < content.openEnd; i++) {
              lastParent = lastNode;
              lastNode = lastNode.lastChild;
          }
          let mapFrom = tr.steps.length, ranges = this.ranges;
          for (let i = 0; i < ranges.length; i++) {
              let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
              tr.replaceRange(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content);
              if (i == 0)
                  selectionToInsertionEnd(tr, mapFrom, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1);
          }
      }
      /**
      Replace the selection with the given node, appending the changes
      to the given transaction.
      */
      replaceWith(tr, node) {
          let mapFrom = tr.steps.length, ranges = this.ranges;
          for (let i = 0; i < ranges.length; i++) {
              let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
              let from = mapping.map($from.pos), to = mapping.map($to.pos);
              if (i) {
                  tr.deleteRange(from, to);
              }
              else {
                  tr.replaceRangeWith(from, to, node);
                  selectionToInsertionEnd(tr, mapFrom, node.isInline ? -1 : 1);
              }
          }
      }
      /**
      Find a valid cursor or leaf node selection starting at the given
      position and searching back if `dir` is negative, and forward if
      positive. When `textOnly` is true, only consider cursor
      selections. Will return null when no valid selection position is
      found.
      */
      static findFrom($pos, dir, textOnly = false) {
          let inner = $pos.parent.inlineContent ? new TextSelection($pos)
              : findSelectionIn($pos.node(0), $pos.parent, $pos.pos, $pos.index(), dir, textOnly);
          if (inner)
              return inner;
          for (let depth = $pos.depth - 1; depth >= 0; depth--) {
              let found = dir < 0
                  ? findSelectionIn($pos.node(0), $pos.node(depth), $pos.before(depth + 1), $pos.index(depth), dir, textOnly)
                  : findSelectionIn($pos.node(0), $pos.node(depth), $pos.after(depth + 1), $pos.index(depth) + 1, dir, textOnly);
              if (found)
                  return found;
          }
          return null;
      }
      /**
      Find a valid cursor or leaf node selection near the given
      position. Searches forward first by default, but if `bias` is
      negative, it will search backwards first.
      */
      static near($pos, bias = 1) {
          return this.findFrom($pos, bias) || this.findFrom($pos, -bias) || new AllSelection($pos.node(0));
      }
      /**
      Find the cursor or leaf node selection closest to the start of
      the given document. Will return an
      [`AllSelection`](https://prosemirror.net/docs/ref/#state.AllSelection) if no valid position
      exists.
      */
      static atStart(doc) {
          return findSelectionIn(doc, doc, 0, 0, 1) || new AllSelection(doc);
      }
      /**
      Find the cursor or leaf node selection closest to the end of the
      given document.
      */
      static atEnd(doc) {
          return findSelectionIn(doc, doc, doc.content.size, doc.childCount, -1) || new AllSelection(doc);
      }
      /**
      Deserialize the JSON representation of a selection. Must be
      implemented for custom classes (as a static class method).
      */
      static fromJSON(doc, json) {
          if (!json || !json.type)
              throw new RangeError("Invalid input for Selection.fromJSON");
          let cls = classesById[json.type];
          if (!cls)
              throw new RangeError(`No selection type ${json.type} defined`);
          return cls.fromJSON(doc, json);
      }
      /**
      To be able to deserialize selections from JSON, custom selection
      classes must register themselves with an ID string, so that they
      can be disambiguated. Try to pick something that's unlikely to
      clash with classes from other modules.
      */
      static jsonID(id, selectionClass) {
          if (id in classesById)
              throw new RangeError("Duplicate use of selection JSON ID " + id);
          classesById[id] = selectionClass;
          selectionClass.prototype.jsonID = id;
          return selectionClass;
      }
      /**
      Get a [bookmark](https://prosemirror.net/docs/ref/#state.SelectionBookmark) for this selection,
      which is a value that can be mapped without having access to a
      current document, and later resolved to a real selection for a
      given document again. (This is used mostly by the history to
      track and restore old selections.) The default implementation of
      this method just converts the selection to a text selection and
      returns the bookmark for that.
      */
      getBookmark() {
          return TextSelection.between(this.$anchor, this.$head).getBookmark();
      }
  }
  Selection.prototype.visible = true;
  /**
  Represents a selected range in a document.
  */
  class SelectionRange {
      /**
      Create a range.
      */
      constructor(
      /**
      The lower bound of the range.
      */
      $from, 
      /**
      The upper bound of the range.
      */
      $to) {
          this.$from = $from;
          this.$to = $to;
      }
  }
  let warnedAboutTextSelection = false;
  function checkTextSelection($pos) {
      if (!warnedAboutTextSelection && !$pos.parent.inlineContent) {
          warnedAboutTextSelection = true;
          console["warn"]("TextSelection endpoint not pointing into a node with inline content (" + $pos.parent.type.name + ")");
      }
  }
  /**
  A text selection represents a classical editor selection, with a
  head (the moving side) and anchor (immobile side), both of which
  point into textblock nodes. It can be empty (a regular cursor
  position).
  */
  class TextSelection extends Selection {
      /**
      Construct a text selection between the given points.
      */
      constructor($anchor, $head = $anchor) {
          checkTextSelection($anchor);
          checkTextSelection($head);
          super($anchor, $head);
      }
      /**
      Returns a resolved position if this is a cursor selection (an
      empty text selection), and null otherwise.
      */
      get $cursor() { return this.$anchor.pos == this.$head.pos ? this.$head : null; }
      map(doc, mapping) {
          let $head = doc.resolve(mapping.map(this.head));
          if (!$head.parent.inlineContent)
              return Selection.near($head);
          let $anchor = doc.resolve(mapping.map(this.anchor));
          return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head);
      }
      replace(tr, content = Slice.empty) {
          super.replace(tr, content);
          if (content == Slice.empty) {
              let marks = this.$from.marksAcross(this.$to);
              if (marks)
                  tr.ensureMarks(marks);
          }
      }
      eq(other) {
          return other instanceof TextSelection && other.anchor == this.anchor && other.head == this.head;
      }
      getBookmark() {
          return new TextBookmark(this.anchor, this.head);
      }
      toJSON() {
          return { type: "text", anchor: this.anchor, head: this.head };
      }
      /**
      @internal
      */
      static fromJSON(doc, json) {
          if (typeof json.anchor != "number" || typeof json.head != "number")
              throw new RangeError("Invalid input for TextSelection.fromJSON");
          return new TextSelection(doc.resolve(json.anchor), doc.resolve(json.head));
      }
      /**
      Create a text selection from non-resolved positions.
      */
      static create(doc, anchor, head = anchor) {
          let $anchor = doc.resolve(anchor);
          return new this($anchor, head == anchor ? $anchor : doc.resolve(head));
      }
      /**
      Return a text selection that spans the given positions or, if
      they aren't text positions, find a text selection near them.
      `bias` determines whether the method searches forward (default)
      or backwards (negative number) first. Will fall back to calling
      [`Selection.near`](https://prosemirror.net/docs/ref/#state.Selection^near) when the document
      doesn't contain a valid text position.
      */
      static between($anchor, $head, bias) {
          let dPos = $anchor.pos - $head.pos;
          if (!bias || dPos)
              bias = dPos >= 0 ? 1 : -1;
          if (!$head.parent.inlineContent) {
              let found = Selection.findFrom($head, bias, true) || Selection.findFrom($head, -bias, true);
              if (found)
                  $head = found.$head;
              else
                  return Selection.near($head, bias);
          }
          if (!$anchor.parent.inlineContent) {
              if (dPos == 0) {
                  $anchor = $head;
              }
              else {
                  $anchor = (Selection.findFrom($anchor, -bias, true) || Selection.findFrom($anchor, bias, true)).$anchor;
                  if (($anchor.pos < $head.pos) != (dPos < 0))
                      $anchor = $head;
              }
          }
          return new TextSelection($anchor, $head);
      }
  }
  Selection.jsonID("text", TextSelection);
  class TextBookmark {
      constructor(anchor, head) {
          this.anchor = anchor;
          this.head = head;
      }
      map(mapping) {
          return new TextBookmark(mapping.map(this.anchor), mapping.map(this.head));
      }
      resolve(doc) {
          return TextSelection.between(doc.resolve(this.anchor), doc.resolve(this.head));
      }
  }
  /**
  A node selection is a selection that points at a single node. All
  nodes marked [selectable](https://prosemirror.net/docs/ref/#model.NodeSpec.selectable) can be the
  target of a node selection. In such a selection, `from` and `to`
  point directly before and after the selected node, `anchor` equals
  `from`, and `head` equals `to`..
  */
  class NodeSelection extends Selection {
      /**
      Create a node selection. Does not verify the validity of its
      argument.
      */
      constructor($pos) {
          let node = $pos.nodeAfter;
          let $end = $pos.node(0).resolve($pos.pos + node.nodeSize);
          super($pos, $end);
          this.node = node;
      }
      map(doc, mapping) {
          let { deleted, pos } = mapping.mapResult(this.anchor);
          let $pos = doc.resolve(pos);
          if (deleted)
              return Selection.near($pos);
          return new NodeSelection($pos);
      }
      content() {
          return new Slice(Fragment.from(this.node), 0, 0);
      }
      eq(other) {
          return other instanceof NodeSelection && other.anchor == this.anchor;
      }
      toJSON() {
          return { type: "node", anchor: this.anchor };
      }
      getBookmark() { return new NodeBookmark(this.anchor); }
      /**
      @internal
      */
      static fromJSON(doc, json) {
          if (typeof json.anchor != "number")
              throw new RangeError("Invalid input for NodeSelection.fromJSON");
          return new NodeSelection(doc.resolve(json.anchor));
      }
      /**
      Create a node selection from non-resolved positions.
      */
      static create(doc, from) {
          return new NodeSelection(doc.resolve(from));
      }
      /**
      Determines whether the given node may be selected as a node
      selection.
      */
      static isSelectable(node) {
          return !node.isText && node.type.spec.selectable !== false;
      }
  }
  NodeSelection.prototype.visible = false;
  Selection.jsonID("node", NodeSelection);
  class NodeBookmark {
      constructor(anchor) {
          this.anchor = anchor;
      }
      map(mapping) {
          let { deleted, pos } = mapping.mapResult(this.anchor);
          return deleted ? new TextBookmark(pos, pos) : new NodeBookmark(pos);
      }
      resolve(doc) {
          let $pos = doc.resolve(this.anchor), node = $pos.nodeAfter;
          if (node && NodeSelection.isSelectable(node))
              return new NodeSelection($pos);
          return Selection.near($pos);
      }
  }
  /**
  A selection type that represents selecting the whole document
  (which can not necessarily be expressed with a text selection, when
  there are for example leaf block nodes at the start or end of the
  document).
  */
  class AllSelection extends Selection {
      /**
      Create an all-selection over the given document.
      */
      constructor(doc) {
          super(doc.resolve(0), doc.resolve(doc.content.size));
      }
      replace(tr, content = Slice.empty) {
          if (content == Slice.empty) {
              tr.delete(0, tr.doc.content.size);
              let sel = Selection.atStart(tr.doc);
              if (!sel.eq(tr.selection))
                  tr.setSelection(sel);
          }
          else {
              super.replace(tr, content);
          }
      }
      toJSON() { return { type: "all" }; }
      /**
      @internal
      */
      static fromJSON(doc) { return new AllSelection(doc); }
      map(doc) { return new AllSelection(doc); }
      eq(other) { return other instanceof AllSelection; }
      getBookmark() { return AllBookmark; }
  }
  Selection.jsonID("all", AllSelection);
  const AllBookmark = {
      map() { return this; },
      resolve(doc) { return new AllSelection(doc); }
  };
  // FIXME we'll need some awareness of text direction when scanning for selections
  // Try to find a selection inside the given node. `pos` points at the
  // position where the search starts. When `text` is true, only return
  // text selections.
  function findSelectionIn(doc, node, pos, index, dir, text = false) {
      if (node.inlineContent)
          return TextSelection.create(doc, pos);
      for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
          let child = node.child(i);
          if (!child.isAtom) {
              let inner = findSelectionIn(doc, child, pos + dir, dir < 0 ? child.childCount : 0, dir, text);
              if (inner)
                  return inner;
          }
          else if (!text && NodeSelection.isSelectable(child)) {
              return NodeSelection.create(doc, pos - (dir < 0 ? child.nodeSize : 0));
          }
          pos += child.nodeSize * dir;
      }
      return null;
  }
  function selectionToInsertionEnd(tr, startLen, bias) {
      let last = tr.steps.length - 1;
      if (last < startLen)
          return;
      let step = tr.steps[last];
      if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep))
          return;
      let map = tr.mapping.maps[last], end;
      map.forEach((_from, _to, _newFrom, newTo) => { if (end == null)
          end = newTo; });
      tr.setSelection(Selection.near(tr.doc.resolve(end), bias));
  }

  const UPDATED_SEL = 1, UPDATED_MARKS = 2, UPDATED_SCROLL = 4;
  /**
  An editor state transaction, which can be applied to a state to
  create an updated state. Use
  [`EditorState.tr`](https://prosemirror.net/docs/ref/#state.EditorState.tr) to create an instance.

  Transactions track changes to the document (they are a subclass of
  [`Transform`](https://prosemirror.net/docs/ref/#transform.Transform)), but also other state changes,
  like selection updates and adjustments of the set of [stored
  marks](https://prosemirror.net/docs/ref/#state.EditorState.storedMarks). In addition, you can store
  metadata properties in a transaction, which are extra pieces of
  information that client code or plugins can use to describe what a
  transaction represents, so that they can update their [own
  state](https://prosemirror.net/docs/ref/#state.StateField) accordingly.

  The [editor view](https://prosemirror.net/docs/ref/#view.EditorView) uses a few metadata properties:
  it will attach a property `"pointer"` with the value `true` to
  selection transactions directly caused by mouse or touch input, and
  a `"uiEvent"` property of that may be `"paste"`, `"cut"`, or `"drop"`.
  */
  class Transaction extends Transform {
      /**
      @internal
      */
      constructor(state) {
          super(state.doc);
          // The step count for which the current selection is valid.
          this.curSelectionFor = 0;
          // Bitfield to track which aspects of the state were updated by
          // this transaction.
          this.updated = 0;
          // Object used to store metadata properties for the transaction.
          this.meta = Object.create(null);
          this.time = Date.now();
          this.curSelection = state.selection;
          this.storedMarks = state.storedMarks;
      }
      /**
      The transaction's current selection. This defaults to the editor
      selection [mapped](https://prosemirror.net/docs/ref/#state.Selection.map) through the steps in the
      transaction, but can be overwritten with
      [`setSelection`](https://prosemirror.net/docs/ref/#state.Transaction.setSelection).
      */
      get selection() {
          if (this.curSelectionFor < this.steps.length) {
              this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionFor));
              this.curSelectionFor = this.steps.length;
          }
          return this.curSelection;
      }
      /**
      Update the transaction's current selection. Will determine the
      selection that the editor gets when the transaction is applied.
      */
      setSelection(selection) {
          if (selection.$from.doc != this.doc)
              throw new RangeError("Selection passed to setSelection must point at the current document");
          this.curSelection = selection;
          this.curSelectionFor = this.steps.length;
          this.updated = (this.updated | UPDATED_SEL) & ~UPDATED_MARKS;
          this.storedMarks = null;
          return this;
      }
      /**
      Whether the selection was explicitly updated by this transaction.
      */
      get selectionSet() {
          return (this.updated & UPDATED_SEL) > 0;
      }
      /**
      Set the current stored marks.
      */
      setStoredMarks(marks) {
          this.storedMarks = marks;
          this.updated |= UPDATED_MARKS;
          return this;
      }
      /**
      Make sure the current stored marks or, if that is null, the marks
      at the selection, match the given set of marks. Does nothing if
      this is already the case.
      */
      ensureMarks(marks) {
          if (!Mark.sameSet(this.storedMarks || this.selection.$from.marks(), marks))
              this.setStoredMarks(marks);
          return this;
      }
      /**
      Add a mark to the set of stored marks.
      */
      addStoredMark(mark) {
          return this.ensureMarks(mark.addToSet(this.storedMarks || this.selection.$head.marks()));
      }
      /**
      Remove a mark or mark type from the set of stored marks.
      */
      removeStoredMark(mark) {
          return this.ensureMarks(mark.removeFromSet(this.storedMarks || this.selection.$head.marks()));
      }
      /**
      Whether the stored marks were explicitly set for this transaction.
      */
      get storedMarksSet() {
          return (this.updated & UPDATED_MARKS) > 0;
      }
      /**
      @internal
      */
      addStep(step, doc) {
          super.addStep(step, doc);
          this.updated = this.updated & ~UPDATED_MARKS;
          this.storedMarks = null;
      }
      /**
      Update the timestamp for the transaction.
      */
      setTime(time) {
          this.time = time;
          return this;
      }
      /**
      Replace the current selection with the given slice.
      */
      replaceSelection(slice) {
          this.selection.replace(this, slice);
          return this;
      }
      /**
      Replace the selection with the given node. When `inheritMarks` is
      true and the content is inline, it inherits the marks from the
      place where it is inserted.
      */
      replaceSelectionWith(node, inheritMarks = true) {
          let selection = this.selection;
          if (inheritMarks)
              node = node.mark(this.storedMarks || (selection.empty ? selection.$from.marks() : (selection.$from.marksAcross(selection.$to) || Mark.none)));
          selection.replaceWith(this, node);
          return this;
      }
      /**
      Delete the selection.
      */
      deleteSelection() {
          this.selection.replace(this);
          return this;
      }
      /**
      Replace the given range, or the selection if no range is given,
      with a text node containing the given string.
      */
      insertText(text, from, to) {
          let schema = this.doc.type.schema;
          if (from == null) {
              if (!text)
                  return this.deleteSelection();
              return this.replaceSelectionWith(schema.text(text), true);
          }
          else {
              if (to == null)
                  to = from;
              to = to == null ? from : to;
              if (!text)
                  return this.deleteRange(from, to);
              let marks = this.storedMarks;
              if (!marks) {
                  let $from = this.doc.resolve(from);
                  marks = to == from ? $from.marks() : $from.marksAcross(this.doc.resolve(to));
              }
              this.replaceRangeWith(from, to, schema.text(text, marks));
              if (!this.selection.empty)
                  this.setSelection(Selection.near(this.selection.$to));
              return this;
          }
      }
      /**
      Store a metadata property in this transaction, keyed either by
      name or by plugin.
      */
      setMeta(key, value) {
          this.meta[typeof key == "string" ? key : key.key] = value;
          return this;
      }
      /**
      Retrieve a metadata property for a given name or plugin.
      */
      getMeta(key) {
          return this.meta[typeof key == "string" ? key : key.key];
      }
      /**
      Returns true if this transaction doesn't contain any metadata,
      and can thus safely be extended.
      */
      get isGeneric() {
          for (let _ in this.meta)
              return false;
          return true;
      }
      /**
      Indicate that the editor should scroll the selection into view
      when updated to the state produced by this transaction.
      */
      scrollIntoView() {
          this.updated |= UPDATED_SCROLL;
          return this;
      }
      /**
      True when this transaction has had `scrollIntoView` called on it.
      */
      get scrolledIntoView() {
          return (this.updated & UPDATED_SCROLL) > 0;
      }
  }

  function bind(f, self) {
      return !self || !f ? f : f.bind(self);
  }
  class FieldDesc {
      constructor(name, desc, self) {
          this.name = name;
          this.init = bind(desc.init, self);
          this.apply = bind(desc.apply, self);
      }
  }
  const baseFields = [
      new FieldDesc("doc", {
          init(config) { return config.doc || config.schema.topNodeType.createAndFill(); },
          apply(tr) { return tr.doc; }
      }),
      new FieldDesc("selection", {
          init(config, instance) { return config.selection || Selection.atStart(instance.doc); },
          apply(tr) { return tr.selection; }
      }),
      new FieldDesc("storedMarks", {
          init(config) { return config.storedMarks || null; },
          apply(tr, _marks, _old, state) { return state.selection.$cursor ? tr.storedMarks : null; }
      }),
      new FieldDesc("scrollToSelection", {
          init() { return 0; },
          apply(tr, prev) { return tr.scrolledIntoView ? prev + 1 : prev; }
      })
  ];
  // Object wrapping the part of a state object that stays the same
  // across transactions. Stored in the state's `config` property.
  class Configuration {
      constructor(schema, plugins) {
          this.schema = schema;
          this.plugins = [];
          this.pluginsByKey = Object.create(null);
          this.fields = baseFields.slice();
          if (plugins)
              plugins.forEach(plugin => {
                  if (this.pluginsByKey[plugin.key])
                      throw new RangeError("Adding different instances of a keyed plugin (" + plugin.key + ")");
                  this.plugins.push(plugin);
                  this.pluginsByKey[plugin.key] = plugin;
                  if (plugin.spec.state)
                      this.fields.push(new FieldDesc(plugin.key, plugin.spec.state, plugin));
              });
      }
  }
  /**
  The state of a ProseMirror editor is represented by an object of
  this type. A state is a persistent data structure—it isn't
  updated, but rather a new state value is computed from an old one
  using the [`apply`](https://prosemirror.net/docs/ref/#state.EditorState.apply) method.

  A state holds a number of built-in fields, and plugins can
  [define](https://prosemirror.net/docs/ref/#state.PluginSpec.state) additional fields.
  */
  class EditorState {
      /**
      @internal
      */
      constructor(
      /**
      @internal
      */
      config) {
          this.config = config;
      }
      /**
      The schema of the state's document.
      */
      get schema() {
          return this.config.schema;
      }
      /**
      The plugins that are active in this state.
      */
      get plugins() {
          return this.config.plugins;
      }
      /**
      Apply the given transaction to produce a new state.
      */
      apply(tr) {
          return this.applyTransaction(tr).state;
      }
      /**
      @ignore
      */
      filterTransaction(tr, ignore = -1) {
          for (let i = 0; i < this.config.plugins.length; i++)
              if (i != ignore) {
                  let plugin = this.config.plugins[i];
                  if (plugin.spec.filterTransaction && !plugin.spec.filterTransaction.call(plugin, tr, this))
                      return false;
              }
          return true;
      }
      /**
      Verbose variant of [`apply`](https://prosemirror.net/docs/ref/#state.EditorState.apply) that
      returns the precise transactions that were applied (which might
      be influenced by the [transaction
      hooks](https://prosemirror.net/docs/ref/#state.PluginSpec.filterTransaction) of
      plugins) along with the new state.
      */
      applyTransaction(rootTr) {
          if (!this.filterTransaction(rootTr))
              return { state: this, transactions: [] };
          let trs = [rootTr], newState = this.applyInner(rootTr), seen = null;
          // This loop repeatedly gives plugins a chance to respond to
          // transactions as new transactions are added, making sure to only
          // pass the transactions the plugin did not see before.
          for (;;) {
              let haveNew = false;
              for (let i = 0; i < this.config.plugins.length; i++) {
                  let plugin = this.config.plugins[i];
                  if (plugin.spec.appendTransaction) {
                      let n = seen ? seen[i].n : 0, oldState = seen ? seen[i].state : this;
                      let tr = n < trs.length &&
                          plugin.spec.appendTransaction.call(plugin, n ? trs.slice(n) : trs, oldState, newState);
                      if (tr && newState.filterTransaction(tr, i)) {
                          tr.setMeta("appendedTransaction", rootTr);
                          if (!seen) {
                              seen = [];
                              for (let j = 0; j < this.config.plugins.length; j++)
                                  seen.push(j < i ? { state: newState, n: trs.length } : { state: this, n: 0 });
                          }
                          trs.push(tr);
                          newState = newState.applyInner(tr);
                          haveNew = true;
                      }
                      if (seen)
                          seen[i] = { state: newState, n: trs.length };
                  }
              }
              if (!haveNew)
                  return { state: newState, transactions: trs };
          }
      }
      /**
      @internal
      */
      applyInner(tr) {
          if (!tr.before.eq(this.doc))
              throw new RangeError("Applying a mismatched transaction");
          let newInstance = new EditorState(this.config), fields = this.config.fields;
          for (let i = 0; i < fields.length; i++) {
              let field = fields[i];
              newInstance[field.name] = field.apply(tr, this[field.name], this, newInstance);
          }
          return newInstance;
      }
      /**
      Start a [transaction](https://prosemirror.net/docs/ref/#state.Transaction) from this state.
      */
      get tr() { return new Transaction(this); }
      /**
      Create a new state.
      */
      static create(config) {
          let $config = new Configuration(config.doc ? config.doc.type.schema : config.schema, config.plugins);
          let instance = new EditorState($config);
          for (let i = 0; i < $config.fields.length; i++)
              instance[$config.fields[i].name] = $config.fields[i].init(config, instance);
          return instance;
      }
      /**
      Create a new state based on this one, but with an adjusted set
      of active plugins. State fields that exist in both sets of
      plugins are kept unchanged. Those that no longer exist are
      dropped, and those that are new are initialized using their
      [`init`](https://prosemirror.net/docs/ref/#state.StateField.init) method, passing in the new
      configuration object..
      */
      reconfigure(config) {
          let $config = new Configuration(this.schema, config.plugins);
          let fields = $config.fields, instance = new EditorState($config);
          for (let i = 0; i < fields.length; i++) {
              let name = fields[i].name;
              instance[name] = this.hasOwnProperty(name) ? this[name] : fields[i].init(config, instance);
          }
          return instance;
      }
      /**
      Serialize this state to JSON. If you want to serialize the state
      of plugins, pass an object mapping property names to use in the
      resulting JSON object to plugin objects. The argument may also be
      a string or number, in which case it is ignored, to support the
      way `JSON.stringify` calls `toString` methods.
      */
      toJSON(pluginFields) {
          let result = { doc: this.doc.toJSON(), selection: this.selection.toJSON() };
          if (this.storedMarks)
              result.storedMarks = this.storedMarks.map(m => m.toJSON());
          if (pluginFields && typeof pluginFields == 'object')
              for (let prop in pluginFields) {
                  if (prop == "doc" || prop == "selection")
                      throw new RangeError("The JSON fields `doc` and `selection` are reserved");
                  let plugin = pluginFields[prop], state = plugin.spec.state;
                  if (state && state.toJSON)
                      result[prop] = state.toJSON.call(plugin, this[plugin.key]);
              }
          return result;
      }
      /**
      Deserialize a JSON representation of a state. `config` should
      have at least a `schema` field, and should contain array of
      plugins to initialize the state with. `pluginFields` can be used
      to deserialize the state of plugins, by associating plugin
      instances with the property names they use in the JSON object.
      */
      static fromJSON(config, json, pluginFields) {
          if (!json)
              throw new RangeError("Invalid input for EditorState.fromJSON");
          if (!config.schema)
              throw new RangeError("Required config field 'schema' missing");
          let $config = new Configuration(config.schema, config.plugins);
          let instance = new EditorState($config);
          $config.fields.forEach(field => {
              if (field.name == "doc") {
                  instance.doc = Node.fromJSON(config.schema, json.doc);
              }
              else if (field.name == "selection") {
                  instance.selection = Selection.fromJSON(instance.doc, json.selection);
              }
              else if (field.name == "storedMarks") {
                  if (json.storedMarks)
                      instance.storedMarks = json.storedMarks.map(config.schema.markFromJSON);
              }
              else {
                  if (pluginFields)
                      for (let prop in pluginFields) {
                          let plugin = pluginFields[prop], state = plugin.spec.state;
                          if (plugin.key == field.name && state && state.fromJSON &&
                              Object.prototype.hasOwnProperty.call(json, prop)) {
                              instance[field.name] = state.fromJSON.call(plugin, config, json[prop], instance);
                              return;
                          }
                      }
                  instance[field.name] = field.init(config, instance);
              }
          });
          return instance;
      }
  }

  function bindProps(obj, self, target) {
      for (let prop in obj) {
          let val = obj[prop];
          if (val instanceof Function)
              val = val.bind(self);
          else if (prop == "handleDOMEvents")
              val = bindProps(val, self, {});
          target[prop] = val;
      }
      return target;
  }
  /**
  Plugins bundle functionality that can be added to an editor.
  They are part of the [editor state](https://prosemirror.net/docs/ref/#state.EditorState) and
  may influence that state and the view that contains it.
  */
  class Plugin {
      /**
      Create a plugin.
      */
      constructor(
      /**
      The plugin's [spec object](https://prosemirror.net/docs/ref/#state.PluginSpec).
      */
      spec) {
          this.spec = spec;
          /**
          The [props](https://prosemirror.net/docs/ref/#view.EditorProps) exported by this plugin.
          */
          this.props = {};
          if (spec.props)
              bindProps(spec.props, this, this.props);
          this.key = spec.key ? spec.key.key : createKey("plugin");
      }
      /**
      Extract the plugin's state field from an editor state.
      */
      getState(state) { return state[this.key]; }
  }
  const keys = Object.create(null);
  function createKey(name) {
      if (name in keys)
          return name + "$" + ++keys[name];
      keys[name] = 0;
      return name + "$";
  }
  /**
  A key is used to [tag](https://prosemirror.net/docs/ref/#state.PluginSpec.key) plugins in a way
  that makes it possible to find them, given an editor state.
  Assigning a key does mean only one plugin of that type can be
  active in a state.
  */
  class PluginKey {
      /**
      Create a plugin key.
      */
      constructor(name = "key") { this.key = createKey(name); }
      /**
      Get the active plugin with this key, if any, from an editor
      state.
      */
      get(state) { return state.config.pluginsByKey[this.key]; }
      /**
      Get the plugin's state from an editor state.
      */
      getState(state) { return state[this.key]; }
  }

  const nav = typeof navigator != "undefined" ? navigator : null;
  const doc = typeof document != "undefined" ? document : null;
  const agent = (nav && nav.userAgent) || "";
  const ie_edge = /Edge\/(\d+)/.exec(agent);
  const ie_upto10 = /MSIE \d/.exec(agent);
  const ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(agent);
  const ie = !!(ie_upto10 || ie_11up || ie_edge);
  const ie_version = ie_upto10 ? document.documentMode : ie_11up ? +ie_11up[1] : ie_edge ? +ie_edge[1] : 0;
  const gecko = !ie && /gecko\/(\d+)/i.test(agent);
  gecko && +(/Firefox\/(\d+)/.exec(agent) || [0, 0])[1];
  const _chrome = !ie && /Chrome\/(\d+)/.exec(agent);
  const chrome = !!_chrome;
  const chrome_version = _chrome ? +_chrome[1] : 0;
  const safari = !ie && !!nav && /Apple Computer/.test(nav.vendor);
  // Is true for both iOS and iPadOS for convenience
  const ios = safari && (/Mobile\/\w+/.test(agent) || !!nav && nav.maxTouchPoints > 2);
  const mac = ios || (nav ? /Mac/.test(nav.platform) : false);
  const android = /Android \d/.test(agent);
  const webkit = !!doc && "webkitFontSmoothing" in doc.documentElement.style;
  const webkit_version = webkit ? +(/\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1] : 0;

  const domIndex = function (node) {
      for (var index = 0;; index++) {
          node = node.previousSibling;
          if (!node)
              return index;
      }
  };
  const parentNode = function (node) {
      let parent = node.assignedSlot || node.parentNode;
      return parent && parent.nodeType == 11 ? parent.host : parent;
  };
  let reusedRange = null;
  // Note that this will always return the same range, because DOM range
  // objects are every expensive, and keep slowing down subsequent DOM
  // updates, for some reason.
  const textRange = function (node, from, to) {
      let range = reusedRange || (reusedRange = document.createRange());
      range.setEnd(node, to == null ? node.nodeValue.length : to);
      range.setStart(node, from || 0);
      return range;
  };
  // Scans forward and backward through DOM positions equivalent to the
  // given one to see if the two are in the same place (i.e. after a
  // text node vs at the end of that text node)
  const isEquivalentPosition = function (node, off, targetNode, targetOff) {
      return targetNode && (scanFor(node, off, targetNode, targetOff, -1) ||
          scanFor(node, off, targetNode, targetOff, 1));
  };
  const atomElements = /^(img|br|input|textarea|hr)$/i;
  function scanFor(node, off, targetNode, targetOff, dir) {
      for (;;) {
          if (node == targetNode && off == targetOff)
              return true;
          if (off == (dir < 0 ? 0 : nodeSize(node))) {
              let parent = node.parentNode;
              if (!parent || parent.nodeType != 1 || hasBlockDesc(node) || atomElements.test(node.nodeName) ||
                  node.contentEditable == "false")
                  return false;
              off = domIndex(node) + (dir < 0 ? 0 : 1);
              node = parent;
          }
          else if (node.nodeType == 1) {
              node = node.childNodes[off + (dir < 0 ? -1 : 0)];
              if (node.contentEditable == "false")
                  return false;
              off = dir < 0 ? nodeSize(node) : 0;
          }
          else {
              return false;
          }
      }
  }
  function nodeSize(node) {
      return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
  }
  function isOnEdge(node, offset, parent) {
      for (let atStart = offset == 0, atEnd = offset == nodeSize(node); atStart || atEnd;) {
          if (node == parent)
              return true;
          let index = domIndex(node);
          node = node.parentNode;
          if (!node)
              return false;
          atStart = atStart && index == 0;
          atEnd = atEnd && index == nodeSize(node);
      }
  }
  function hasBlockDesc(dom) {
      let desc;
      for (let cur = dom; cur; cur = cur.parentNode)
          if (desc = cur.pmViewDesc)
              break;
      return desc && desc.node && desc.node.isBlock && (desc.dom == dom || desc.contentDOM == dom);
  }
  // Work around Chrome issue https://bugs.chromium.org/p/chromium/issues/detail?id=447523
  // (isCollapsed inappropriately returns true in shadow dom)
  const selectionCollapsed = function (domSel) {
      let collapsed = domSel.isCollapsed;
      if (collapsed && chrome && domSel.rangeCount && !domSel.getRangeAt(0).collapsed)
          collapsed = false;
      return collapsed;
  };
  function keyEvent(keyCode, key) {
      let event = document.createEvent("Event");
      event.initEvent("keydown", true, true);
      event.keyCode = keyCode;
      event.key = event.code = key;
      return event;
  }

  function windowRect(doc) {
      return { left: 0, right: doc.documentElement.clientWidth,
          top: 0, bottom: doc.documentElement.clientHeight };
  }
  function getSide(value, side) {
      return typeof value == "number" ? value : value[side];
  }
  function clientRect(node) {
      let rect = node.getBoundingClientRect();
      // Adjust for elements with style "transform: scale()"
      let scaleX = (rect.width / node.offsetWidth) || 1;
      let scaleY = (rect.height / node.offsetHeight) || 1;
      // Make sure scrollbar width isn't included in the rectangle
      return { left: rect.left, right: rect.left + node.clientWidth * scaleX,
          top: rect.top, bottom: rect.top + node.clientHeight * scaleY };
  }
  function scrollRectIntoView(view, rect, startDOM) {
      let scrollThreshold = view.someProp("scrollThreshold") || 0, scrollMargin = view.someProp("scrollMargin") || 5;
      let doc = view.dom.ownerDocument;
      for (let parent = startDOM || view.dom;; parent = parentNode(parent)) {
          if (!parent)
              break;
          if (parent.nodeType != 1)
              continue;
          let elt = parent;
          let atTop = elt == doc.body;
          let bounding = atTop ? windowRect(doc) : clientRect(elt);
          let moveX = 0, moveY = 0;
          if (rect.top < bounding.top + getSide(scrollThreshold, "top"))
              moveY = -(bounding.top - rect.top + getSide(scrollMargin, "top"));
          else if (rect.bottom > bounding.bottom - getSide(scrollThreshold, "bottom"))
              moveY = rect.bottom - bounding.bottom + getSide(scrollMargin, "bottom");
          if (rect.left < bounding.left + getSide(scrollThreshold, "left"))
              moveX = -(bounding.left - rect.left + getSide(scrollMargin, "left"));
          else if (rect.right > bounding.right - getSide(scrollThreshold, "right"))
              moveX = rect.right - bounding.right + getSide(scrollMargin, "right");
          if (moveX || moveY) {
              if (atTop) {
                  doc.defaultView.scrollBy(moveX, moveY);
              }
              else {
                  let startX = elt.scrollLeft, startY = elt.scrollTop;
                  if (moveY)
                      elt.scrollTop += moveY;
                  if (moveX)
                      elt.scrollLeft += moveX;
                  let dX = elt.scrollLeft - startX, dY = elt.scrollTop - startY;
                  rect = { left: rect.left - dX, top: rect.top - dY, right: rect.right - dX, bottom: rect.bottom - dY };
              }
          }
          if (atTop)
              break;
      }
  }
  // Store the scroll position of the editor's parent nodes, along with
  // the top position of an element near the top of the editor, which
  // will be used to make sure the visible viewport remains stable even
  // when the size of the content above changes.
  function storeScrollPos(view) {
      let rect = view.dom.getBoundingClientRect(), startY = Math.max(0, rect.top);
      let refDOM, refTop;
      for (let x = (rect.left + rect.right) / 2, y = startY + 1; y < Math.min(innerHeight, rect.bottom); y += 5) {
          let dom = view.root.elementFromPoint(x, y);
          if (!dom || dom == view.dom || !view.dom.contains(dom))
              continue;
          let localRect = dom.getBoundingClientRect();
          if (localRect.top >= startY - 20) {
              refDOM = dom;
              refTop = localRect.top;
              break;
          }
      }
      return { refDOM: refDOM, refTop: refTop, stack: scrollStack(view.dom) };
  }
  function scrollStack(dom) {
      let stack = [], doc = dom.ownerDocument;
      for (let cur = dom; cur; cur = parentNode(cur)) {
          stack.push({ dom: cur, top: cur.scrollTop, left: cur.scrollLeft });
          if (dom == doc)
              break;
      }
      return stack;
  }
  // Reset the scroll position of the editor's parent nodes to that what
  // it was before, when storeScrollPos was called.
  function resetScrollPos({ refDOM, refTop, stack }) {
      let newRefTop = refDOM ? refDOM.getBoundingClientRect().top : 0;
      restoreScrollStack(stack, newRefTop == 0 ? 0 : newRefTop - refTop);
  }
  function restoreScrollStack(stack, dTop) {
      for (let i = 0; i < stack.length; i++) {
          let { dom, top, left } = stack[i];
          if (dom.scrollTop != top + dTop)
              dom.scrollTop = top + dTop;
          if (dom.scrollLeft != left)
              dom.scrollLeft = left;
      }
  }
  let preventScrollSupported = null;
  // Feature-detects support for .focus({preventScroll: true}), and uses
  // a fallback kludge when not supported.
  function focusPreventScroll(dom) {
      if (dom.setActive)
          return dom.setActive(); // in IE
      if (preventScrollSupported)
          return dom.focus(preventScrollSupported);
      let stored = scrollStack(dom);
      dom.focus(preventScrollSupported == null ? {
          get preventScroll() {
              preventScrollSupported = { preventScroll: true };
              return true;
          }
      } : undefined);
      if (!preventScrollSupported) {
          preventScrollSupported = false;
          restoreScrollStack(stored, 0);
      }
  }
  function findOffsetInNode(node, coords) {
      let closest, dxClosest = 2e8, coordsClosest, offset = 0;
      let rowBot = coords.top, rowTop = coords.top;
      for (let child = node.firstChild, childIndex = 0; child; child = child.nextSibling, childIndex++) {
          let rects;
          if (child.nodeType == 1)
              rects = child.getClientRects();
          else if (child.nodeType == 3)
              rects = textRange(child).getClientRects();
          else
              continue;
          for (let i = 0; i < rects.length; i++) {
              let rect = rects[i];
              if (rect.top <= rowBot && rect.bottom >= rowTop) {
                  rowBot = Math.max(rect.bottom, rowBot);
                  rowTop = Math.min(rect.top, rowTop);
                  let dx = rect.left > coords.left ? rect.left - coords.left
                      : rect.right < coords.left ? coords.left - rect.right : 0;
                  if (dx < dxClosest) {
                      closest = child;
                      dxClosest = dx;
                      coordsClosest = dx && closest.nodeType == 3 ? {
                          left: rect.right < coords.left ? rect.right : rect.left,
                          top: coords.top
                      } : coords;
                      if (child.nodeType == 1 && dx)
                          offset = childIndex + (coords.left >= (rect.left + rect.right) / 2 ? 1 : 0);
                      continue;
                  }
              }
              if (!closest && (coords.left >= rect.right && coords.top >= rect.top ||
                  coords.left >= rect.left && coords.top >= rect.bottom))
                  offset = childIndex + 1;
          }
      }
      if (closest && closest.nodeType == 3)
          return findOffsetInText(closest, coordsClosest);
      if (!closest || (dxClosest && closest.nodeType == 1))
          return { node, offset };
      return findOffsetInNode(closest, coordsClosest);
  }
  function findOffsetInText(node, coords) {
      let len = node.nodeValue.length;
      let range = document.createRange();
      for (let i = 0; i < len; i++) {
          range.setEnd(node, i + 1);
          range.setStart(node, i);
          let rect = singleRect(range, 1);
          if (rect.top == rect.bottom)
              continue;
          if (inRect(coords, rect))
              return { node, offset: i + (coords.left >= (rect.left + rect.right) / 2 ? 1 : 0) };
      }
      return { node, offset: 0 };
  }
  function inRect(coords, rect) {
      return coords.left >= rect.left - 1 && coords.left <= rect.right + 1 &&
          coords.top >= rect.top - 1 && coords.top <= rect.bottom + 1;
  }
  function targetKludge(dom, coords) {
      let parent = dom.parentNode;
      if (parent && /^li$/i.test(parent.nodeName) && coords.left < dom.getBoundingClientRect().left)
          return parent;
      return dom;
  }
  function posFromElement(view, elt, coords) {
      let { node, offset } = findOffsetInNode(elt, coords), bias = -1;
      if (node.nodeType == 1 && !node.firstChild) {
          let rect = node.getBoundingClientRect();
          bias = rect.left != rect.right && coords.left > (rect.left + rect.right) / 2 ? 1 : -1;
      }
      return view.docView.posFromDOM(node, offset, bias);
  }
  function posFromCaret(view, node, offset, coords) {
      // Browser (in caretPosition/RangeFromPoint) will agressively
      // normalize towards nearby inline nodes. Since we are interested in
      // positions between block nodes too, we first walk up the hierarchy
      // of nodes to see if there are block nodes that the coordinates
      // fall outside of. If so, we take the position before/after that
      // block. If not, we call `posFromDOM` on the raw node/offset.
      let outside = -1;
      for (let cur = node;;) {
          if (cur == view.dom)
              break;
          let desc = view.docView.nearestDesc(cur, true);
          if (!desc)
              return null;
          if (desc.node.isBlock && desc.parent) {
              let rect = desc.dom.getBoundingClientRect();
              if (rect.left > coords.left || rect.top > coords.top)
                  outside = desc.posBefore;
              else if (rect.right < coords.left || rect.bottom < coords.top)
                  outside = desc.posAfter;
              else
                  break;
          }
          cur = desc.dom.parentNode;
      }
      return outside > -1 ? outside : view.docView.posFromDOM(node, offset, 1);
  }
  function elementFromPoint(element, coords, box) {
      let len = element.childNodes.length;
      if (len && box.top < box.bottom) {
          for (let startI = Math.max(0, Math.min(len - 1, Math.floor(len * (coords.top - box.top) / (box.bottom - box.top)) - 2)), i = startI;;) {
              let child = element.childNodes[i];
              if (child.nodeType == 1) {
                  let rects = child.getClientRects();
                  for (let j = 0; j < rects.length; j++) {
                      let rect = rects[j];
                      if (inRect(coords, rect))
                          return elementFromPoint(child, coords, rect);
                  }
              }
              if ((i = (i + 1) % len) == startI)
                  break;
          }
      }
      return element;
  }
  // Given an x,y position on the editor, get the position in the document.
  function posAtCoords(view, coords) {
      let doc = view.dom.ownerDocument, node, offset = 0;
      if (doc.caretPositionFromPoint) {
          try { // Firefox throws for this call in hard-to-predict circumstances (#994)
              let pos = doc.caretPositionFromPoint(coords.left, coords.top);
              if (pos)
                  ({ offsetNode: node, offset } = pos);
          }
          catch (_) { }
      }
      if (!node && doc.caretRangeFromPoint) {
          let range = doc.caretRangeFromPoint(coords.left, coords.top);
          if (range)
              ({ startContainer: node, startOffset: offset } = range);
      }
      let elt = (view.root.elementFromPoint ? view.root : doc)
          .elementFromPoint(coords.left, coords.top);
      let pos;
      if (!elt || !view.dom.contains(elt.nodeType != 1 ? elt.parentNode : elt)) {
          let box = view.dom.getBoundingClientRect();
          if (!inRect(coords, box))
              return null;
          elt = elementFromPoint(view.dom, coords, box);
          if (!elt)
              return null;
      }
      // Safari's caretRangeFromPoint returns nonsense when on a draggable element
      if (safari) {
          for (let p = elt; node && p; p = parentNode(p))
              if (p.draggable)
                  node = undefined;
      }
      elt = targetKludge(elt, coords);
      if (node) {
          if (gecko && node.nodeType == 1) {
              // Firefox will sometimes return offsets into <input> nodes, which
              // have no actual children, from caretPositionFromPoint (#953)
              offset = Math.min(offset, node.childNodes.length);
              // It'll also move the returned position before image nodes,
              // even if those are behind it.
              if (offset < node.childNodes.length) {
                  let next = node.childNodes[offset], box;
                  if (next.nodeName == "IMG" && (box = next.getBoundingClientRect()).right <= coords.left &&
                      box.bottom > coords.top)
                      offset++;
              }
          }
          // Suspiciously specific kludge to work around caret*FromPoint
          // never returning a position at the end of the document
          if (node == view.dom && offset == node.childNodes.length - 1 && node.lastChild.nodeType == 1 &&
              coords.top > node.lastChild.getBoundingClientRect().bottom)
              pos = view.state.doc.content.size;
          // Ignore positions directly after a BR, since caret*FromPoint
          // 'round up' positions that would be more accurately placed
          // before the BR node.
          else if (offset == 0 || node.nodeType != 1 || node.childNodes[offset - 1].nodeName != "BR")
              pos = posFromCaret(view, node, offset, coords);
      }
      if (pos == null)
          pos = posFromElement(view, elt, coords);
      let desc = view.docView.nearestDesc(elt, true);
      return { pos, inside: desc ? desc.posAtStart - desc.border : -1 };
  }
  function singleRect(target, bias) {
      let rects = target.getClientRects();
      return !rects.length ? target.getBoundingClientRect() : rects[bias < 0 ? 0 : rects.length - 1];
  }
  const BIDI = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
  // Given a position in the document model, get a bounding box of the
  // character at that position, relative to the window.
  function coordsAtPos(view, pos, side) {
      let { node, offset, atom } = view.docView.domFromPos(pos, side < 0 ? -1 : 1);
      let supportEmptyRange = webkit || gecko;
      if (node.nodeType == 3) {
          // These browsers support querying empty text ranges. Prefer that in
          // bidi context or when at the end of a node.
          if (supportEmptyRange && (BIDI.test(node.nodeValue) || (side < 0 ? !offset : offset == node.nodeValue.length))) {
              let rect = singleRect(textRange(node, offset, offset), side);
              // Firefox returns bad results (the position before the space)
              // when querying a position directly after line-broken
              // whitespace. Detect this situation and and kludge around it
              if (gecko && offset && /\s/.test(node.nodeValue[offset - 1]) && offset < node.nodeValue.length) {
                  let rectBefore = singleRect(textRange(node, offset - 1, offset - 1), -1);
                  if (rectBefore.top == rect.top) {
                      let rectAfter = singleRect(textRange(node, offset, offset + 1), -1);
                      if (rectAfter.top != rect.top)
                          return flattenV(rectAfter, rectAfter.left < rectBefore.left);
                  }
              }
              return rect;
          }
          else {
              let from = offset, to = offset, takeSide = side < 0 ? 1 : -1;
              if (side < 0 && !offset) {
                  to++;
                  takeSide = -1;
              }
              else if (side >= 0 && offset == node.nodeValue.length) {
                  from--;
                  takeSide = 1;
              }
              else if (side < 0) {
                  from--;
              }
              else {
                  to++;
              }
              return flattenV(singleRect(textRange(node, from, to), 1), takeSide < 0);
          }
      }
      let $dom = view.state.doc.resolve(pos - (atom || 0));
      // Return a horizontal line in block context
      if (!$dom.parent.inlineContent) {
          if (atom == null && offset && (side < 0 || offset == nodeSize(node))) {
              let before = node.childNodes[offset - 1];
              if (before.nodeType == 1)
                  return flattenH(before.getBoundingClientRect(), false);
          }
          if (atom == null && offset < nodeSize(node)) {
              let after = node.childNodes[offset];
              if (after.nodeType == 1)
                  return flattenH(after.getBoundingClientRect(), true);
          }
          return flattenH(node.getBoundingClientRect(), side >= 0);
      }
      // Inline, not in text node (this is not Bidi-safe)
      if (atom == null && offset && (side < 0 || offset == nodeSize(node))) {
          let before = node.childNodes[offset - 1];
          let target = before.nodeType == 3 ? textRange(before, nodeSize(before) - (supportEmptyRange ? 0 : 1))
              // BR nodes tend to only return the rectangle before them.
              // Only use them if they are the last element in their parent
              : before.nodeType == 1 && (before.nodeName != "BR" || !before.nextSibling) ? before : null;
          if (target)
              return flattenV(singleRect(target, 1), false);
      }
      if (atom == null && offset < nodeSize(node)) {
          let after = node.childNodes[offset];
          while (after.pmViewDesc && after.pmViewDesc.ignoreForCoords)
              after = after.nextSibling;
          let target = !after ? null : after.nodeType == 3 ? textRange(after, 0, (supportEmptyRange ? 0 : 1))
              : after.nodeType == 1 ? after : null;
          if (target)
              return flattenV(singleRect(target, -1), true);
      }
      // All else failed, just try to get a rectangle for the target node
      return flattenV(singleRect(node.nodeType == 3 ? textRange(node) : node, -side), side >= 0);
  }
  function flattenV(rect, left) {
      if (rect.width == 0)
          return rect;
      let x = left ? rect.left : rect.right;
      return { top: rect.top, bottom: rect.bottom, left: x, right: x };
  }
  function flattenH(rect, top) {
      if (rect.height == 0)
          return rect;
      let y = top ? rect.top : rect.bottom;
      return { top: y, bottom: y, left: rect.left, right: rect.right };
  }
  function withFlushedState(view, state, f) {
      let viewState = view.state, active = view.root.activeElement;
      if (viewState != state)
          view.updateState(state);
      if (active != view.dom)
          view.focus();
      try {
          return f();
      }
      finally {
          if (viewState != state)
              view.updateState(viewState);
          if (active != view.dom && active)
              active.focus();
      }
  }
  // Whether vertical position motion in a given direction
  // from a position would leave a text block.
  function endOfTextblockVertical(view, state, dir) {
      let sel = state.selection;
      let $pos = dir == "up" ? sel.$from : sel.$to;
      return withFlushedState(view, state, () => {
          let { node: dom } = view.docView.domFromPos($pos.pos, dir == "up" ? -1 : 1);
          for (;;) {
              let nearest = view.docView.nearestDesc(dom, true);
              if (!nearest)
                  break;
              if (nearest.node.isBlock) {
                  dom = nearest.dom;
                  break;
              }
              dom = nearest.dom.parentNode;
          }
          let coords = coordsAtPos(view, $pos.pos, 1);
          for (let child = dom.firstChild; child; child = child.nextSibling) {
              let boxes;
              if (child.nodeType == 1)
                  boxes = child.getClientRects();
              else if (child.nodeType == 3)
                  boxes = textRange(child, 0, child.nodeValue.length).getClientRects();
              else
                  continue;
              for (let i = 0; i < boxes.length; i++) {
                  let box = boxes[i];
                  if (box.bottom > box.top + 1 &&
                      (dir == "up" ? coords.top - box.top > (box.bottom - coords.top) * 2
                          : box.bottom - coords.bottom > (coords.bottom - box.top) * 2))
                      return false;
              }
          }
          return true;
      });
  }
  const maybeRTL = /[\u0590-\u08ac]/;
  function endOfTextblockHorizontal(view, state, dir) {
      let { $head } = state.selection;
      if (!$head.parent.isTextblock)
          return false;
      let offset = $head.parentOffset, atStart = !offset, atEnd = offset == $head.parent.content.size;
      let sel = view.domSelection();
      // If the textblock is all LTR, or the browser doesn't support
      // Selection.modify (Edge), fall back to a primitive approach
      if (!maybeRTL.test($head.parent.textContent) || !sel.modify)
          return dir == "left" || dir == "backward" ? atStart : atEnd;
      return withFlushedState(view, state, () => {
          // This is a huge hack, but appears to be the best we can
          // currently do: use `Selection.modify` to move the selection by
          // one character, and see if that moves the cursor out of the
          // textblock (or doesn't move it at all, when at the start/end of
          // the document).
          let oldRange = sel.getRangeAt(0), oldNode = sel.focusNode, oldOff = sel.focusOffset;
          let oldBidiLevel = sel.caretBidiLevel // Only for Firefox
          ;
          sel.modify("move", dir, "character");
          let parentDOM = $head.depth ? view.docView.domAfterPos($head.before()) : view.dom;
          let result = !parentDOM.contains(sel.focusNode.nodeType == 1 ? sel.focusNode : sel.focusNode.parentNode) ||
              (oldNode == sel.focusNode && oldOff == sel.focusOffset);
          // Restore the previous selection
          sel.removeAllRanges();
          sel.addRange(oldRange);
          if (oldBidiLevel != null)
              sel.caretBidiLevel = oldBidiLevel;
          return result;
      });
  }
  let cachedState = null;
  let cachedDir = null;
  let cachedResult = false;
  function endOfTextblock(view, state, dir) {
      if (cachedState == state && cachedDir == dir)
          return cachedResult;
      cachedState = state;
      cachedDir = dir;
      return cachedResult = dir == "up" || dir == "down"
          ? endOfTextblockVertical(view, state, dir)
          : endOfTextblockHorizontal(view, state, dir);
  }

  // View descriptions are data structures that describe the DOM that is
  // used to represent the editor's content. They are used for:
  //
  // - Incremental redrawing when the document changes
  //
  // - Figuring out what part of the document a given DOM position
  //   corresponds to
  //
  // - Wiring in custom implementations of the editing interface for a
  //   given node
  //
  // They form a doubly-linked mutable tree, starting at `view.docView`.
  const NOT_DIRTY = 0, CHILD_DIRTY = 1, CONTENT_DIRTY = 2, NODE_DIRTY = 3;
  // Superclass for the various kinds of descriptions. Defines their
  // basic structure and shared methods.
  class ViewDesc {
      constructor(parent, children, dom, 
      // This is the node that holds the child views. It may be null for
      // descs that don't have children.
      contentDOM) {
          this.parent = parent;
          this.children = children;
          this.dom = dom;
          this.contentDOM = contentDOM;
          this.dirty = NOT_DIRTY;
          // An expando property on the DOM node provides a link back to its
          // description.
          dom.pmViewDesc = this;
      }
      // Used to check whether a given description corresponds to a
      // widget/mark/node.
      matchesWidget(widget) { return false; }
      matchesMark(mark) { return false; }
      matchesNode(node, outerDeco, innerDeco) { return false; }
      matchesHack(nodeName) { return false; }
      // When parsing in-editor content (in domchange.js), we allow
      // descriptions to determine the parse rules that should be used to
      // parse them.
      parseRule() { return null; }
      // Used by the editor's event handler to ignore events that come
      // from certain descs.
      stopEvent(event) { return false; }
      // The size of the content represented by this desc.
      get size() {
          let size = 0;
          for (let i = 0; i < this.children.length; i++)
              size += this.children[i].size;
          return size;
      }
      // For block nodes, this represents the space taken up by their
      // start/end tokens.
      get border() { return 0; }
      destroy() {
          this.parent = undefined;
          if (this.dom.pmViewDesc == this)
              this.dom.pmViewDesc = undefined;
          for (let i = 0; i < this.children.length; i++)
              this.children[i].destroy();
      }
      posBeforeChild(child) {
          for (let i = 0, pos = this.posAtStart;; i++) {
              let cur = this.children[i];
              if (cur == child)
                  return pos;
              pos += cur.size;
          }
      }
      get posBefore() {
          return this.parent.posBeforeChild(this);
      }
      get posAtStart() {
          return this.parent ? this.parent.posBeforeChild(this) + this.border : 0;
      }
      get posAfter() {
          return this.posBefore + this.size;
      }
      get posAtEnd() {
          return this.posAtStart + this.size - 2 * this.border;
      }
      localPosFromDOM(dom, offset, bias) {
          // If the DOM position is in the content, use the child desc after
          // it to figure out a position.
          if (this.contentDOM && this.contentDOM.contains(dom.nodeType == 1 ? dom : dom.parentNode)) {
              if (bias < 0) {
                  let domBefore, desc;
                  if (dom == this.contentDOM) {
                      domBefore = dom.childNodes[offset - 1];
                  }
                  else {
                      while (dom.parentNode != this.contentDOM)
                          dom = dom.parentNode;
                      domBefore = dom.previousSibling;
                  }
                  while (domBefore && !((desc = domBefore.pmViewDesc) && desc.parent == this))
                      domBefore = domBefore.previousSibling;
                  return domBefore ? this.posBeforeChild(desc) + desc.size : this.posAtStart;
              }
              else {
                  let domAfter, desc;
                  if (dom == this.contentDOM) {
                      domAfter = dom.childNodes[offset];
                  }
                  else {
                      while (dom.parentNode != this.contentDOM)
                          dom = dom.parentNode;
                      domAfter = dom.nextSibling;
                  }
                  while (domAfter && !((desc = domAfter.pmViewDesc) && desc.parent == this))
                      domAfter = domAfter.nextSibling;
                  return domAfter ? this.posBeforeChild(desc) : this.posAtEnd;
              }
          }
          // Otherwise, use various heuristics, falling back on the bias
          // parameter, to determine whether to return the position at the
          // start or at the end of this view desc.
          let atEnd;
          if (dom == this.dom && this.contentDOM) {
              atEnd = offset > domIndex(this.contentDOM);
          }
          else if (this.contentDOM && this.contentDOM != this.dom && this.dom.contains(this.contentDOM)) {
              atEnd = dom.compareDocumentPosition(this.contentDOM) & 2;
          }
          else if (this.dom.firstChild) {
              if (offset == 0)
                  for (let search = dom;; search = search.parentNode) {
                      if (search == this.dom) {
                          atEnd = false;
                          break;
                      }
                      if (search.previousSibling)
                          break;
                  }
              if (atEnd == null && offset == dom.childNodes.length)
                  for (let search = dom;; search = search.parentNode) {
                      if (search == this.dom) {
                          atEnd = true;
                          break;
                      }
                      if (search.nextSibling)
                          break;
                  }
          }
          return (atEnd == null ? bias > 0 : atEnd) ? this.posAtEnd : this.posAtStart;
      }
      // Scan up the dom finding the first desc that is a descendant of
      // this one.
      nearestDesc(dom, onlyNodes = false) {
          for (let first = true, cur = dom; cur; cur = cur.parentNode) {
              let desc = this.getDesc(cur), nodeDOM;
              if (desc && (!onlyNodes || desc.node)) {
                  // If dom is outside of this desc's nodeDOM, don't count it.
                  if (first && (nodeDOM = desc.nodeDOM) &&
                      !(nodeDOM.nodeType == 1 ? nodeDOM.contains(dom.nodeType == 1 ? dom : dom.parentNode) : nodeDOM == dom))
                      first = false;
                  else
                      return desc;
              }
          }
      }
      getDesc(dom) {
          let desc = dom.pmViewDesc;
          for (let cur = desc; cur; cur = cur.parent)
              if (cur == this)
                  return desc;
      }
      posFromDOM(dom, offset, bias) {
          for (let scan = dom; scan; scan = scan.parentNode) {
              let desc = this.getDesc(scan);
              if (desc)
                  return desc.localPosFromDOM(dom, offset, bias);
          }
          return -1;
      }
      // Find the desc for the node after the given pos, if any. (When a
      // parent node overrode rendering, there might not be one.)
      descAt(pos) {
          for (let i = 0, offset = 0; i < this.children.length; i++) {
              let child = this.children[i], end = offset + child.size;
              if (offset == pos && end != offset) {
                  while (!child.border && child.children.length)
                      child = child.children[0];
                  return child;
              }
              if (pos < end)
                  return child.descAt(pos - offset - child.border);
              offset = end;
          }
      }
      domFromPos(pos, side) {
          if (!this.contentDOM)
              return { node: this.dom, offset: 0, atom: pos + 1 };
          // First find the position in the child array
          let i = 0, offset = 0;
          for (let curPos = 0; i < this.children.length; i++) {
              let child = this.children[i], end = curPos + child.size;
              if (end > pos || child instanceof TrailingHackViewDesc) {
                  offset = pos - curPos;
                  break;
              }
              curPos = end;
          }
          // If this points into the middle of a child, call through
          if (offset)
              return this.children[i].domFromPos(offset - this.children[i].border, side);
          // Go back if there were any zero-length widgets with side >= 0 before this point
          for (let prev; i && !(prev = this.children[i - 1]).size && prev instanceof WidgetViewDesc && prev.side >= 0; i--) { }
          // Scan towards the first useable node
          if (side <= 0) {
              let prev, enter = true;
              for (;; i--, enter = false) {
                  prev = i ? this.children[i - 1] : null;
                  if (!prev || prev.dom.parentNode == this.contentDOM)
                      break;
              }
              if (prev && side && enter && !prev.border && !prev.domAtom)
                  return prev.domFromPos(prev.size, side);
              return { node: this.contentDOM, offset: prev ? domIndex(prev.dom) + 1 : 0 };
          }
          else {
              let next, enter = true;
              for (;; i++, enter = false) {
                  next = i < this.children.length ? this.children[i] : null;
                  if (!next || next.dom.parentNode == this.contentDOM)
                      break;
              }
              if (next && enter && !next.border && !next.domAtom)
                  return next.domFromPos(0, side);
              return { node: this.contentDOM, offset: next ? domIndex(next.dom) : this.contentDOM.childNodes.length };
          }
      }
      // Used to find a DOM range in a single parent for a given changed
      // range.
      parseRange(from, to, base = 0) {
          if (this.children.length == 0)
              return { node: this.contentDOM, from, to, fromOffset: 0, toOffset: this.contentDOM.childNodes.length };
          let fromOffset = -1, toOffset = -1;
          for (let offset = base, i = 0;; i++) {
              let child = this.children[i], end = offset + child.size;
              if (fromOffset == -1 && from <= end) {
                  let childBase = offset + child.border;
                  // FIXME maybe descend mark views to parse a narrower range?
                  if (from >= childBase && to <= end - child.border && child.node &&
                      child.contentDOM && this.contentDOM.contains(child.contentDOM))
                      return child.parseRange(from, to, childBase);
                  from = offset;
                  for (let j = i; j > 0; j--) {
                      let prev = this.children[j - 1];
                      if (prev.size && prev.dom.parentNode == this.contentDOM && !prev.emptyChildAt(1)) {
                          fromOffset = domIndex(prev.dom) + 1;
                          break;
                      }
                      from -= prev.size;
                  }
                  if (fromOffset == -1)
                      fromOffset = 0;
              }
              if (fromOffset > -1 && (end > to || i == this.children.length - 1)) {
                  to = end;
                  for (let j = i + 1; j < this.children.length; j++) {
                      let next = this.children[j];
                      if (next.size && next.dom.parentNode == this.contentDOM && !next.emptyChildAt(-1)) {
                          toOffset = domIndex(next.dom);
                          break;
                      }
                      to += next.size;
                  }
                  if (toOffset == -1)
                      toOffset = this.contentDOM.childNodes.length;
                  break;
              }
              offset = end;
          }
          return { node: this.contentDOM, from, to, fromOffset, toOffset };
      }
      emptyChildAt(side) {
          if (this.border || !this.contentDOM || !this.children.length)
              return false;
          let child = this.children[side < 0 ? 0 : this.children.length - 1];
          return child.size == 0 || child.emptyChildAt(side);
      }
      domAfterPos(pos) {
          let { node, offset } = this.domFromPos(pos, 0);
          if (node.nodeType != 1 || offset == node.childNodes.length)
              throw new RangeError("No node after pos " + pos);
          return node.childNodes[offset];
      }
      // View descs are responsible for setting any selection that falls
      // entirely inside of them, so that custom implementations can do
      // custom things with the selection. Note that this falls apart when
      // a selection starts in such a node and ends in another, in which
      // case we just use whatever domFromPos produces as a best effort.
      setSelection(anchor, head, root, force = false) {
          // If the selection falls entirely in a child, give it to that child
          let from = Math.min(anchor, head), to = Math.max(anchor, head);
          for (let i = 0, offset = 0; i < this.children.length; i++) {
              let child = this.children[i], end = offset + child.size;
              if (from > offset && to < end)
                  return child.setSelection(anchor - offset - child.border, head - offset - child.border, root, force);
              offset = end;
          }
          let anchorDOM = this.domFromPos(anchor, anchor ? -1 : 1);
          let headDOM = head == anchor ? anchorDOM : this.domFromPos(head, head ? -1 : 1);
          let domSel = root.getSelection();
          let brKludge = false;
          // On Firefox, using Selection.collapse to put the cursor after a
          // BR node for some reason doesn't always work (#1073). On Safari,
          // the cursor sometimes inexplicable visually lags behind its
          // reported position in such situations (#1092).
          if ((gecko || safari) && anchor == head) {
              let { node, offset } = anchorDOM;
              if (node.nodeType == 3) {
                  brKludge = !!(offset && node.nodeValue[offset - 1] == "\n");
                  // Issue #1128
                  if (brKludge && offset == node.nodeValue.length) {
                      for (let scan = node, after; scan; scan = scan.parentNode) {
                          if (after = scan.nextSibling) {
                              if (after.nodeName == "BR")
                                  anchorDOM = headDOM = { node: after.parentNode, offset: domIndex(after) + 1 };
                              break;
                          }
                          let desc = scan.pmViewDesc;
                          if (desc && desc.node && desc.node.isBlock)
                              break;
                      }
                  }
              }
              else {
                  let prev = node.childNodes[offset - 1];
                  brKludge = prev && (prev.nodeName == "BR" || prev.contentEditable == "false");
              }
          }
          // Firefox can act strangely when the selection is in front of an
          // uneditable node. See #1163 and https://bugzilla.mozilla.org/show_bug.cgi?id=1709536
          if (gecko && domSel.focusNode && domSel.focusNode != headDOM.node && domSel.focusNode.nodeType == 1) {
              let after = domSel.focusNode.childNodes[domSel.focusOffset];
              if (after && after.contentEditable == "false")
                  force = true;
          }
          if (!(force || brKludge && safari) &&
              isEquivalentPosition(anchorDOM.node, anchorDOM.offset, domSel.anchorNode, domSel.anchorOffset) &&
              isEquivalentPosition(headDOM.node, headDOM.offset, domSel.focusNode, domSel.focusOffset))
              return;
          // Selection.extend can be used to create an 'inverted' selection
          // (one where the focus is before the anchor), but not all
          // browsers support it yet.
          let domSelExtended = false;
          if ((domSel.extend || anchor == head) && !brKludge) {
              domSel.collapse(anchorDOM.node, anchorDOM.offset);
              try {
                  if (anchor != head) {
                      // This can crash on Safari if the editor is hidden, and
                      // there was no selection. (#1308)
                      try {
                          domSel.extend(headDOM.node, headDOM.offset);
                      }
                      catch (_) { }
                  }
                  domSelExtended = true;
              }
              catch (err) {
                  // In some cases with Chrome the selection is empty after calling
                  // collapse, even when it should be valid. This appears to be a bug, but
                  // it is difficult to isolate. If this happens fallback to the old path
                  // without using extend.
                  if (!(err instanceof DOMException))
                      throw err;
                  // declare global: DOMException
              }
          }
          if (!domSelExtended) {
              if (anchor > head) {
                  let tmp = anchorDOM;
                  anchorDOM = headDOM;
                  headDOM = tmp;
              }
              let range = document.createRange();
              range.setEnd(headDOM.node, headDOM.offset);
              range.setStart(anchorDOM.node, anchorDOM.offset);
              domSel.removeAllRanges();
              domSel.addRange(range);
          }
      }
      ignoreMutation(mutation) {
          return !this.contentDOM && mutation.type != "selection";
      }
      get contentLost() {
          return this.contentDOM && this.contentDOM != this.dom && !this.dom.contains(this.contentDOM);
      }
      // Remove a subtree of the element tree that has been touched
      // by a DOM change, so that the next update will redraw it.
      markDirty(from, to) {
          for (let offset = 0, i = 0; i < this.children.length; i++) {
              let child = this.children[i], end = offset + child.size;
              if (offset == end ? from <= end && to >= offset : from < end && to > offset) {
                  let startInside = offset + child.border, endInside = end - child.border;
                  if (from >= startInside && to <= endInside) {
                      this.dirty = from == offset || to == end ? CONTENT_DIRTY : CHILD_DIRTY;
                      if (from == startInside && to == endInside &&
                          (child.contentLost || child.dom.parentNode != this.contentDOM))
                          child.dirty = NODE_DIRTY;
                      else
                          child.markDirty(from - startInside, to - startInside);
                      return;
                  }
                  else {
                      child.dirty = child.dom == child.contentDOM && child.dom.parentNode == this.contentDOM && !child.children.length
                          ? CONTENT_DIRTY : NODE_DIRTY;
                  }
              }
              offset = end;
          }
          this.dirty = CONTENT_DIRTY;
      }
      markParentsDirty() {
          let level = 1;
          for (let node = this.parent; node; node = node.parent, level++) {
              let dirty = level == 1 ? CONTENT_DIRTY : CHILD_DIRTY;
              if (node.dirty < dirty)
                  node.dirty = dirty;
          }
      }
      get domAtom() { return false; }
      get ignoreForCoords() { return false; }
  }
  // A widget desc represents a widget decoration, which is a DOM node
  // drawn between the document nodes.
  class WidgetViewDesc extends ViewDesc {
      constructor(parent, widget, view, pos) {
          let self, dom = widget.type.toDOM;
          if (typeof dom == "function")
              dom = dom(view, () => {
                  if (!self)
                      return pos;
                  if (self.parent)
                      return self.parent.posBeforeChild(self);
              });
          if (!widget.type.spec.raw) {
              if (dom.nodeType != 1) {
                  let wrap = document.createElement("span");
                  wrap.appendChild(dom);
                  dom = wrap;
              }
              dom.contentEditable = "false";
              dom.classList.add("ProseMirror-widget");
          }
          super(parent, [], dom, null);
          this.widget = widget;
          this.widget = widget;
          self = this;
      }
      matchesWidget(widget) {
          return this.dirty == NOT_DIRTY && widget.type.eq(this.widget.type);
      }
      parseRule() { return { ignore: true }; }
      stopEvent(event) {
          let stop = this.widget.spec.stopEvent;
          return stop ? stop(event) : false;
      }
      ignoreMutation(mutation) {
          return mutation.type != "selection" || this.widget.spec.ignoreSelection;
      }
      destroy() {
          this.widget.type.destroy(this.dom);
          super.destroy();
      }
      get domAtom() { return true; }
      get side() { return this.widget.type.side; }
  }
  class CompositionViewDesc extends ViewDesc {
      constructor(parent, dom, textDOM, text) {
          super(parent, [], dom, null);
          this.textDOM = textDOM;
          this.text = text;
      }
      get size() { return this.text.length; }
      localPosFromDOM(dom, offset) {
          if (dom != this.textDOM)
              return this.posAtStart + (offset ? this.size : 0);
          return this.posAtStart + offset;
      }
      domFromPos(pos) {
          return { node: this.textDOM, offset: pos };
      }
      ignoreMutation(mut) {
          return mut.type === 'characterData' && mut.target.nodeValue == mut.oldValue;
      }
  }
  // A mark desc represents a mark. May have multiple children,
  // depending on how the mark is split. Note that marks are drawn using
  // a fixed nesting order, for simplicity and predictability, so in
  // some cases they will be split more often than would appear
  // necessary.
  class MarkViewDesc extends ViewDesc {
      constructor(parent, mark, dom, contentDOM) {
          super(parent, [], dom, contentDOM);
          this.mark = mark;
      }
      static create(parent, mark, inline, view) {
          let custom = view.nodeViews[mark.type.name];
          let spec = custom && custom(mark, view, inline);
          if (!spec || !spec.dom)
              spec = DOMSerializer.renderSpec(document, mark.type.spec.toDOM(mark, inline));
          return new MarkViewDesc(parent, mark, spec.dom, spec.contentDOM || spec.dom);
      }
      parseRule() {
          if ((this.dirty & NODE_DIRTY) || this.mark.type.spec.reparseInView)
              return null;
          return { mark: this.mark.type.name, attrs: this.mark.attrs, contentElement: this.contentDOM || undefined };
      }
      matchesMark(mark) { return this.dirty != NODE_DIRTY && this.mark.eq(mark); }
      markDirty(from, to) {
          super.markDirty(from, to);
          // Move dirty info to nearest node view
          if (this.dirty != NOT_DIRTY) {
              let parent = this.parent;
              while (!parent.node)
                  parent = parent.parent;
              if (parent.dirty < this.dirty)
                  parent.dirty = this.dirty;
              this.dirty = NOT_DIRTY;
          }
      }
      slice(from, to, view) {
          let copy = MarkViewDesc.create(this.parent, this.mark, true, view);
          let nodes = this.children, size = this.size;
          if (to < size)
              nodes = replaceNodes(nodes, to, size, view);
          if (from > 0)
              nodes = replaceNodes(nodes, 0, from, view);
          for (let i = 0; i < nodes.length; i++)
              nodes[i].parent = copy;
          copy.children = nodes;
          return copy;
      }
  }
  // Node view descs are the main, most common type of view desc, and
  // correspond to an actual node in the document. Unlike mark descs,
  // they populate their child array themselves.
  class NodeViewDesc extends ViewDesc {
      constructor(parent, node, outerDeco, innerDeco, dom, contentDOM, nodeDOM, view, pos) {
          super(parent, [], dom, contentDOM);
          this.node = node;
          this.outerDeco = outerDeco;
          this.innerDeco = innerDeco;
          this.nodeDOM = nodeDOM;
          if (contentDOM)
              this.updateChildren(view, pos);
      }
      // By default, a node is rendered using the `toDOM` method from the
      // node type spec. But client code can use the `nodeViews` spec to
      // supply a custom node view, which can influence various aspects of
      // the way the node works.
      //
      // (Using subclassing for this was intentionally decided against,
      // since it'd require exposing a whole slew of finicky
      // implementation details to the user code that they probably will
      // never need.)
      static create(parent, node, outerDeco, innerDeco, view, pos) {
          let custom = view.nodeViews[node.type.name], descObj;
          let spec = custom && custom(node, view, () => {
              // (This is a function that allows the custom view to find its
              // own position)
              if (!descObj)
                  return pos;
              if (descObj.parent)
                  return descObj.parent.posBeforeChild(descObj);
          }, outerDeco, innerDeco);
          let dom = spec && spec.dom, contentDOM = spec && spec.contentDOM;
          if (node.isText) {
              if (!dom)
                  dom = document.createTextNode(node.text);
              else if (dom.nodeType != 3)
                  throw new RangeError("Text must be rendered as a DOM text node");
          }
          else if (!dom) {
              ({ dom, contentDOM } = DOMSerializer.renderSpec(document, node.type.spec.toDOM(node)));
          }
          if (!contentDOM && !node.isText && dom.nodeName != "BR") { // Chrome gets confused by <br contenteditable=false>
              if (!dom.hasAttribute("contenteditable"))
                  dom.contentEditable = "false";
              if (node.type.spec.draggable)
                  dom.draggable = true;
          }
          let nodeDOM = dom;
          dom = applyOuterDeco(dom, outerDeco, node);
          if (spec)
              return descObj = new CustomNodeViewDesc(parent, node, outerDeco, innerDeco, dom, contentDOM || null, nodeDOM, spec, view, pos + 1);
          else if (node.isText)
              return new TextViewDesc(parent, node, outerDeco, innerDeco, dom, nodeDOM, view);
          else
              return new NodeViewDesc(parent, node, outerDeco, innerDeco, dom, contentDOM || null, nodeDOM, view, pos + 1);
      }
      parseRule() {
          // Experimental kludge to allow opt-in re-parsing of nodes
          if (this.node.type.spec.reparseInView)
              return null;
          // FIXME the assumption that this can always return the current
          // attrs means that if the user somehow manages to change the
          // attrs in the dom, that won't be picked up. Not entirely sure
          // whether this is a problem
          let rule = { node: this.node.type.name, attrs: this.node.attrs };
          if (this.node.type.whitespace == "pre")
              rule.preserveWhitespace = "full";
          if (!this.contentDOM) {
              rule.getContent = () => this.node.content;
          }
          else if (!this.contentLost) {
              rule.contentElement = this.contentDOM;
          }
          else {
              // Chrome likes to randomly recreate parent nodes when
              // backspacing things. When that happens, this tries to find the
              // new parent.
              for (let i = this.children.length - 1; i >= 0; i--) {
                  let child = this.children[i];
                  if (this.dom.contains(child.dom.parentNode)) {
                      rule.contentElement = child.dom.parentNode;
                      break;
                  }
              }
              if (!rule.contentElement)
                  rule.getContent = () => Fragment.empty;
          }
          return rule;
      }
      matchesNode(node, outerDeco, innerDeco) {
          return this.dirty == NOT_DIRTY && node.eq(this.node) &&
              sameOuterDeco(outerDeco, this.outerDeco) && innerDeco.eq(this.innerDeco);
      }
      get size() { return this.node.nodeSize; }
      get border() { return this.node.isLeaf ? 0 : 1; }
      // Syncs `this.children` to match `this.node.content` and the local
      // decorations, possibly introducing nesting for marks. Then, in a
      // separate step, syncs the DOM inside `this.contentDOM` to
      // `this.children`.
      updateChildren(view, pos) {
          let inline = this.node.inlineContent, off = pos;
          let composition = view.composing ? this.localCompositionInfo(view, pos) : null;
          let localComposition = composition && composition.pos > -1 ? composition : null;
          let compositionInChild = composition && composition.pos < 0;
          let updater = new ViewTreeUpdater(this, localComposition && localComposition.node, view);
          iterDeco(this.node, this.innerDeco, (widget, i, insideNode) => {
              if (widget.spec.marks)
                  updater.syncToMarks(widget.spec.marks, inline, view);
              else if (widget.type.side >= 0 && !insideNode)
                  updater.syncToMarks(i == this.node.childCount ? Mark.none : this.node.child(i).marks, inline, view);
              // If the next node is a desc matching this widget, reuse it,
              // otherwise insert the widget as a new view desc.
              updater.placeWidget(widget, view, off);
          }, (child, outerDeco, innerDeco, i) => {
              // Make sure the wrapping mark descs match the node's marks.
              updater.syncToMarks(child.marks, inline, view);
              // Try several strategies for drawing this node
              let compIndex;
              if (updater.findNodeMatch(child, outerDeco, innerDeco, i)) ;
              else if (compositionInChild && view.state.selection.from > off &&
                  view.state.selection.to < off + child.nodeSize &&
                  (compIndex = updater.findIndexWithChild(composition.node)) > -1 &&
                  updater.updateNodeAt(child, outerDeco, innerDeco, compIndex, view)) ;
              else if (updater.updateNextNode(child, outerDeco, innerDeco, view, i)) ;
              else {
                  // Add it as a new view
                  updater.addNode(child, outerDeco, innerDeco, view, off);
              }
              off += child.nodeSize;
          });
          // Drop all remaining descs after the current position.
          updater.syncToMarks([], inline, view);
          if (this.node.isTextblock)
              updater.addTextblockHacks();
          updater.destroyRest();
          // Sync the DOM if anything changed
          if (updater.changed || this.dirty == CONTENT_DIRTY) {
              // May have to protect focused DOM from being changed if a composition is active
              if (localComposition)
                  this.protectLocalComposition(view, localComposition);
              renderDescs(this.contentDOM, this.children, view);
              if (ios)
                  iosHacks(this.dom);
          }
      }
      localCompositionInfo(view, pos) {
          // Only do something if both the selection and a focused text node
          // are inside of this node
          let { from, to } = view.state.selection;
          if (!(view.state.selection instanceof TextSelection) || from < pos || to > pos + this.node.content.size)
              return null;
          let sel = view.domSelection();
          let textNode = nearbyTextNode(sel.focusNode, sel.focusOffset);
          if (!textNode || !this.dom.contains(textNode.parentNode))
              return null;
          if (this.node.inlineContent) {
              // Find the text in the focused node in the node, stop if it's not
              // there (may have been modified through other means, in which
              // case it should overwritten)
              let text = textNode.nodeValue;
              let textPos = findTextInFragment(this.node.content, text, from - pos, to - pos);
              return textPos < 0 ? null : { node: textNode, pos: textPos, text };
          }
          else {
              return { node: textNode, pos: -1, text: "" };
          }
      }
      protectLocalComposition(view, { node, pos, text }) {
          // The node is already part of a local view desc, leave it there
          if (this.getDesc(node))
              return;
          // Create a composition view for the orphaned nodes
          let topNode = node;
          for (;; topNode = topNode.parentNode) {
              if (topNode.parentNode == this.contentDOM)
                  break;
              while (topNode.previousSibling)
                  topNode.parentNode.removeChild(topNode.previousSibling);
              while (topNode.nextSibling)
                  topNode.parentNode.removeChild(topNode.nextSibling);
              if (topNode.pmViewDesc)
                  topNode.pmViewDesc = undefined;
          }
          let desc = new CompositionViewDesc(this, topNode, node, text);
          view.input.compositionNodes.push(desc);
          // Patch up this.children to contain the composition view
          this.children = replaceNodes(this.children, pos, pos + text.length, view, desc);
      }
      // If this desc must be updated to match the given node decoration,
      // do so and return true.
      update(node, outerDeco, innerDeco, view) {
          if (this.dirty == NODE_DIRTY ||
              !node.sameMarkup(this.node))
              return false;
          this.updateInner(node, outerDeco, innerDeco, view);
          return true;
      }
      updateInner(node, outerDeco, innerDeco, view) {
          this.updateOuterDeco(outerDeco);
          this.node = node;
          this.innerDeco = innerDeco;
          if (this.contentDOM)
              this.updateChildren(view, this.posAtStart);
          this.dirty = NOT_DIRTY;
      }
      updateOuterDeco(outerDeco) {
          if (sameOuterDeco(outerDeco, this.outerDeco))
              return;
          let needsWrap = this.nodeDOM.nodeType != 1;
          let oldDOM = this.dom;
          this.dom = patchOuterDeco(this.dom, this.nodeDOM, computeOuterDeco(this.outerDeco, this.node, needsWrap), computeOuterDeco(outerDeco, this.node, needsWrap));
          if (this.dom != oldDOM) {
              oldDOM.pmViewDesc = undefined;
              this.dom.pmViewDesc = this;
          }
          this.outerDeco = outerDeco;
      }
      // Mark this node as being the selected node.
      selectNode() {
          if (this.nodeDOM.nodeType == 1)
              this.nodeDOM.classList.add("ProseMirror-selectednode");
          if (this.contentDOM || !this.node.type.spec.draggable)
              this.dom.draggable = true;
      }
      // Remove selected node marking from this node.
      deselectNode() {
          if (this.nodeDOM.nodeType == 1)
              this.nodeDOM.classList.remove("ProseMirror-selectednode");
          if (this.contentDOM || !this.node.type.spec.draggable)
              this.dom.removeAttribute("draggable");
      }
      get domAtom() { return this.node.isAtom; }
  }
  // Create a view desc for the top-level document node, to be exported
  // and used by the view class.
  function docViewDesc(doc, outerDeco, innerDeco, dom, view) {
      applyOuterDeco(dom, outerDeco, doc);
      return new NodeViewDesc(undefined, doc, outerDeco, innerDeco, dom, dom, dom, view, 0);
  }
  class TextViewDesc extends NodeViewDesc {
      constructor(parent, node, outerDeco, innerDeco, dom, nodeDOM, view) {
          super(parent, node, outerDeco, innerDeco, dom, null, nodeDOM, view, 0);
      }
      parseRule() {
          let skip = this.nodeDOM.parentNode;
          while (skip && skip != this.dom && !skip.pmIsDeco)
              skip = skip.parentNode;
          return { skip: (skip || true) };
      }
      update(node, outerDeco, innerDeco, view) {
          if (this.dirty == NODE_DIRTY || (this.dirty != NOT_DIRTY && !this.inParent()) ||
              !node.sameMarkup(this.node))
              return false;
          this.updateOuterDeco(outerDeco);
          if ((this.dirty != NOT_DIRTY || node.text != this.node.text) && node.text != this.nodeDOM.nodeValue) {
              this.nodeDOM.nodeValue = node.text;
              if (view.trackWrites == this.nodeDOM)
                  view.trackWrites = null;
          }
          this.node = node;
          this.dirty = NOT_DIRTY;
          return true;
      }
      inParent() {
          let parentDOM = this.parent.contentDOM;
          for (let n = this.nodeDOM; n; n = n.parentNode)
              if (n == parentDOM)
                  return true;
          return false;
      }
      domFromPos(pos) {
          return { node: this.nodeDOM, offset: pos };
      }
      localPosFromDOM(dom, offset, bias) {
          if (dom == this.nodeDOM)
              return this.posAtStart + Math.min(offset, this.node.text.length);
          return super.localPosFromDOM(dom, offset, bias);
      }
      ignoreMutation(mutation) {
          return mutation.type != "characterData" && mutation.type != "selection";
      }
      slice(from, to, view) {
          let node = this.node.cut(from, to), dom = document.createTextNode(node.text);
          return new TextViewDesc(this.parent, node, this.outerDeco, this.innerDeco, dom, dom, view);
      }
      markDirty(from, to) {
          super.markDirty(from, to);
          if (this.dom != this.nodeDOM && (from == 0 || to == this.nodeDOM.nodeValue.length))
              this.dirty = NODE_DIRTY;
      }
      get domAtom() { return false; }
  }
  // A dummy desc used to tag trailing BR or IMG nodes created to work
  // around contentEditable terribleness.
  class TrailingHackViewDesc extends ViewDesc {
      parseRule() { return { ignore: true }; }
      matchesHack(nodeName) { return this.dirty == NOT_DIRTY && this.dom.nodeName == nodeName; }
      get domAtom() { return true; }
      get ignoreForCoords() { return this.dom.nodeName == "IMG"; }
  }
  // A separate subclass is used for customized node views, so that the
  // extra checks only have to be made for nodes that are actually
  // customized.
  class CustomNodeViewDesc extends NodeViewDesc {
      constructor(parent, node, outerDeco, innerDeco, dom, contentDOM, nodeDOM, spec, view, pos) {
          super(parent, node, outerDeco, innerDeco, dom, contentDOM, nodeDOM, view, pos);
          this.spec = spec;
      }
      // A custom `update` method gets to decide whether the update goes
      // through. If it does, and there's a `contentDOM` node, our logic
      // updates the children.
      update(node, outerDeco, innerDeco, view) {
          if (this.dirty == NODE_DIRTY)
              return false;
          if (this.spec.update) {
              let result = this.spec.update(node, outerDeco, innerDeco);
              if (result)
                  this.updateInner(node, outerDeco, innerDeco, view);
              return result;
          }
          else if (!this.contentDOM && !node.isLeaf) {
              return false;
          }
          else {
              return super.update(node, outerDeco, innerDeco, view);
          }
      }
      selectNode() {
          this.spec.selectNode ? this.spec.selectNode() : super.selectNode();
      }
      deselectNode() {
          this.spec.deselectNode ? this.spec.deselectNode() : super.deselectNode();
      }
      setSelection(anchor, head, root, force) {
          this.spec.setSelection ? this.spec.setSelection(anchor, head, root)
              : super.setSelection(anchor, head, root, force);
      }
      destroy() {
          if (this.spec.destroy)
              this.spec.destroy();
          super.destroy();
      }
      stopEvent(event) {
          return this.spec.stopEvent ? this.spec.stopEvent(event) : false;
      }
      ignoreMutation(mutation) {
          return this.spec.ignoreMutation ? this.spec.ignoreMutation(mutation) : super.ignoreMutation(mutation);
      }
  }
  // Sync the content of the given DOM node with the nodes associated
  // with the given array of view descs, recursing into mark descs
  // because this should sync the subtree for a whole node at a time.
  function renderDescs(parentDOM, descs, view) {
      let dom = parentDOM.firstChild, written = false;
      for (let i = 0; i < descs.length; i++) {
          let desc = descs[i], childDOM = desc.dom;
          if (childDOM.parentNode == parentDOM) {
              while (childDOM != dom) {
                  dom = rm(dom);
                  written = true;
              }
              dom = dom.nextSibling;
          }
          else {
              written = true;
              parentDOM.insertBefore(childDOM, dom);
          }
          if (desc instanceof MarkViewDesc) {
              let pos = dom ? dom.previousSibling : parentDOM.lastChild;
              renderDescs(desc.contentDOM, desc.children, view);
              dom = pos ? pos.nextSibling : parentDOM.firstChild;
          }
      }
      while (dom) {
          dom = rm(dom);
          written = true;
      }
      if (written && view.trackWrites == parentDOM)
          view.trackWrites = null;
  }
  const OuterDecoLevel = function (nodeName) {
      if (nodeName)
          this.nodeName = nodeName;
  };
  OuterDecoLevel.prototype = Object.create(null);
  const noDeco = [new OuterDecoLevel];
  function computeOuterDeco(outerDeco, node, needsWrap) {
      if (outerDeco.length == 0)
          return noDeco;
      let top = needsWrap ? noDeco[0] : new OuterDecoLevel, result = [top];
      for (let i = 0; i < outerDeco.length; i++) {
          let attrs = outerDeco[i].type.attrs;
          if (!attrs)
              continue;
          if (attrs.nodeName)
              result.push(top = new OuterDecoLevel(attrs.nodeName));
          for (let name in attrs) {
              let val = attrs[name];
              if (val == null)
                  continue;
              if (needsWrap && result.length == 1)
                  result.push(top = new OuterDecoLevel(node.isInline ? "span" : "div"));
              if (name == "class")
                  top.class = (top.class ? top.class + " " : "") + val;
              else if (name == "style")
                  top.style = (top.style ? top.style + ";" : "") + val;
              else if (name != "nodeName")
                  top[name] = val;
          }
      }
      return result;
  }
  function patchOuterDeco(outerDOM, nodeDOM, prevComputed, curComputed) {
      // Shortcut for trivial case
      if (prevComputed == noDeco && curComputed == noDeco)
          return nodeDOM;
      let curDOM = nodeDOM;
      for (let i = 0; i < curComputed.length; i++) {
          let deco = curComputed[i], prev = prevComputed[i];
          if (i) {
              let parent;
              if (prev && prev.nodeName == deco.nodeName && curDOM != outerDOM &&
                  (parent = curDOM.parentNode) && parent.nodeName.toLowerCase() == deco.nodeName) {
                  curDOM = parent;
              }
              else {
                  parent = document.createElement(deco.nodeName);
                  parent.pmIsDeco = true;
                  parent.appendChild(curDOM);
                  prev = noDeco[0];
                  curDOM = parent;
              }
          }
          patchAttributes(curDOM, prev || noDeco[0], deco);
      }
      return curDOM;
  }
  function patchAttributes(dom, prev, cur) {
      for (let name in prev)
          if (name != "class" && name != "style" && name != "nodeName" && !(name in cur))
              dom.removeAttribute(name);
      for (let name in cur)
          if (name != "class" && name != "style" && name != "nodeName" && cur[name] != prev[name])
              dom.setAttribute(name, cur[name]);
      if (prev.class != cur.class) {
          let prevList = prev.class ? prev.class.split(" ").filter(Boolean) : [];
          let curList = cur.class ? cur.class.split(" ").filter(Boolean) : [];
          for (let i = 0; i < prevList.length; i++)
              if (curList.indexOf(prevList[i]) == -1)
                  dom.classList.remove(prevList[i]);
          for (let i = 0; i < curList.length; i++)
              if (prevList.indexOf(curList[i]) == -1)
                  dom.classList.add(curList[i]);
          if (dom.classList.length == 0)
              dom.removeAttribute("class");
      }
      if (prev.style != cur.style) {
          if (prev.style) {
              let prop = /\s*([\w\-\xa1-\uffff]+)\s*:(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\(.*?\)|[^;])*/g, m;
              while (m = prop.exec(prev.style))
                  dom.style.removeProperty(m[1]);
          }
          if (cur.style)
              dom.style.cssText += cur.style;
      }
  }
  function applyOuterDeco(dom, deco, node) {
      return patchOuterDeco(dom, dom, noDeco, computeOuterDeco(deco, node, dom.nodeType != 1));
  }
  function sameOuterDeco(a, b) {
      if (a.length != b.length)
          return false;
      for (let i = 0; i < a.length; i++)
          if (!a[i].type.eq(b[i].type))
              return false;
      return true;
  }
  // Remove a DOM node and return its next sibling.
  function rm(dom) {
      let next = dom.nextSibling;
      dom.parentNode.removeChild(dom);
      return next;
  }
  // Helper class for incrementally updating a tree of mark descs and
  // the widget and node descs inside of them.
  class ViewTreeUpdater {
      constructor(top, lock, view) {
          this.lock = lock;
          this.view = view;
          // Index into `this.top`'s child array, represents the current
          // update position.
          this.index = 0;
          // When entering a mark, the current top and index are pushed
          // onto this.
          this.stack = [];
          // Tracks whether anything was changed
          this.changed = false;
          this.top = top;
          this.preMatch = preMatch(top.node.content, top);
      }
      // Destroy and remove the children between the given indices in
      // `this.top`.
      destroyBetween(start, end) {
          if (start == end)
              return;
          for (let i = start; i < end; i++)
              this.top.children[i].destroy();
          this.top.children.splice(start, end - start);
          this.changed = true;
      }
      // Destroy all remaining children in `this.top`.
      destroyRest() {
          this.destroyBetween(this.index, this.top.children.length);
      }
      // Sync the current stack of mark descs with the given array of
      // marks, reusing existing mark descs when possible.
      syncToMarks(marks, inline, view) {
          let keep = 0, depth = this.stack.length >> 1;
          let maxKeep = Math.min(depth, marks.length);
          while (keep < maxKeep &&
              (keep == depth - 1 ? this.top : this.stack[(keep + 1) << 1])
                  .matchesMark(marks[keep]) && marks[keep].type.spec.spanning !== false)
              keep++;
          while (keep < depth) {
              this.destroyRest();
              this.top.dirty = NOT_DIRTY;
              this.index = this.stack.pop();
              this.top = this.stack.pop();
              depth--;
          }
          while (depth < marks.length) {
              this.stack.push(this.top, this.index + 1);
              let found = -1;
              for (let i = this.index; i < Math.min(this.index + 3, this.top.children.length); i++) {
                  if (this.top.children[i].matchesMark(marks[depth])) {
                      found = i;
                      break;
                  }
              }
              if (found > -1) {
                  if (found > this.index) {
                      this.changed = true;
                      this.destroyBetween(this.index, found);
                  }
                  this.top = this.top.children[this.index];
              }
              else {
                  let markDesc = MarkViewDesc.create(this.top, marks[depth], inline, view);
                  this.top.children.splice(this.index, 0, markDesc);
                  this.top = markDesc;
                  this.changed = true;
              }
              this.index = 0;
              depth++;
          }
      }
      // Try to find a node desc matching the given data. Skip over it and
      // return true when successful.
      findNodeMatch(node, outerDeco, innerDeco, index) {
          let found = -1, targetDesc;
          if (index >= this.preMatch.index &&
              (targetDesc = this.preMatch.matches[index - this.preMatch.index]).parent == this.top &&
              targetDesc.matchesNode(node, outerDeco, innerDeco)) {
              found = this.top.children.indexOf(targetDesc, this.index);
          }
          else {
              for (let i = this.index, e = Math.min(this.top.children.length, i + 5); i < e; i++) {
                  let child = this.top.children[i];
                  if (child.matchesNode(node, outerDeco, innerDeco) && !this.preMatch.matched.has(child)) {
                      found = i;
                      break;
                  }
              }
          }
          if (found < 0)
              return false;
          this.destroyBetween(this.index, found);
          this.index++;
          return true;
      }
      updateNodeAt(node, outerDeco, innerDeco, index, view) {
          let child = this.top.children[index];
          if (child.dirty == NODE_DIRTY && child.dom == child.contentDOM)
              child.dirty = CONTENT_DIRTY;
          if (!child.update(node, outerDeco, innerDeco, view))
              return false;
          this.destroyBetween(this.index, index);
          this.index++;
          return true;
      }
      findIndexWithChild(domNode) {
          for (;;) {
              let parent = domNode.parentNode;
              if (!parent)
                  return -1;
              if (parent == this.top.contentDOM) {
                  let desc = domNode.pmViewDesc;
                  if (desc)
                      for (let i = this.index; i < this.top.children.length; i++) {
                          if (this.top.children[i] == desc)
                              return i;
                      }
                  return -1;
              }
              domNode = parent;
          }
      }
      // Try to update the next node, if any, to the given data. Checks
      // pre-matches to avoid overwriting nodes that could still be used.
      updateNextNode(node, outerDeco, innerDeco, view, index) {
          for (let i = this.index; i < this.top.children.length; i++) {
              let next = this.top.children[i];
              if (next instanceof NodeViewDesc) {
                  let preMatch = this.preMatch.matched.get(next);
                  if (preMatch != null && preMatch != index)
                      return false;
                  let nextDOM = next.dom;
                  // Can't update if nextDOM is or contains this.lock, except if
                  // it's a text node whose content already matches the new text
                  // and whose decorations match the new ones.
                  let locked = this.lock && (nextDOM == this.lock || nextDOM.nodeType == 1 && nextDOM.contains(this.lock.parentNode)) &&
                      !(node.isText && next.node && next.node.isText && next.nodeDOM.nodeValue == node.text &&
                          next.dirty != NODE_DIRTY && sameOuterDeco(outerDeco, next.outerDeco));
                  if (!locked && next.update(node, outerDeco, innerDeco, view)) {
                      this.destroyBetween(this.index, i);
                      if (next.dom != nextDOM)
                          this.changed = true;
                      this.index++;
                      return true;
                  }
                  break;
              }
          }
          return false;
      }
      // Insert the node as a newly created node desc.
      addNode(node, outerDeco, innerDeco, view, pos) {
          this.top.children.splice(this.index++, 0, NodeViewDesc.create(this.top, node, outerDeco, innerDeco, view, pos));
          this.changed = true;
      }
      placeWidget(widget, view, pos) {
          let next = this.index < this.top.children.length ? this.top.children[this.index] : null;
          if (next && next.matchesWidget(widget) &&
              (widget == next.widget || !next.widget.type.toDOM.parentNode)) {
              this.index++;
          }
          else {
              let desc = new WidgetViewDesc(this.top, widget, view, pos);
              this.top.children.splice(this.index++, 0, desc);
              this.changed = true;
          }
      }
      // Make sure a textblock looks and behaves correctly in
      // contentEditable.
      addTextblockHacks() {
          let lastChild = this.top.children[this.index - 1], parent = this.top;
          while (lastChild instanceof MarkViewDesc) {
              parent = lastChild;
              lastChild = parent.children[parent.children.length - 1];
          }
          if (!lastChild || // Empty textblock
              !(lastChild instanceof TextViewDesc) ||
              /\n$/.test(lastChild.node.text) ||
              (this.view.requiresGeckoHackNode && /\s$/.test(lastChild.node.text))) {
              // Avoid bugs in Safari's cursor drawing (#1165) and Chrome's mouse selection (#1152)
              if ((safari || chrome) && lastChild && lastChild.dom.contentEditable == "false")
                  this.addHackNode("IMG", parent);
              this.addHackNode("BR", this.top);
          }
      }
      addHackNode(nodeName, parent) {
          if (parent == this.top && this.index < parent.children.length && parent.children[this.index].matchesHack(nodeName)) {
              this.index++;
          }
          else {
              let dom = document.createElement(nodeName);
              if (nodeName == "IMG") {
                  dom.className = "ProseMirror-separator";
                  dom.alt = "";
              }
              if (nodeName == "BR")
                  dom.className = "ProseMirror-trailingBreak";
              let hack = new TrailingHackViewDesc(this.top, [], dom, null);
              if (parent != this.top)
                  parent.children.push(hack);
              else
                  parent.children.splice(this.index++, 0, hack);
              this.changed = true;
          }
      }
  }
  // Iterate from the end of the fragment and array of descs to find
  // directly matching ones, in order to avoid overeagerly reusing those
  // for other nodes. Returns the fragment index of the first node that
  // is part of the sequence of matched nodes at the end of the
  // fragment.
  function preMatch(frag, parentDesc) {
      let curDesc = parentDesc, descI = curDesc.children.length;
      let fI = frag.childCount, matched = new Map, matches = [];
      outer: while (fI > 0) {
          let desc;
          for (;;) {
              if (descI) {
                  let next = curDesc.children[descI - 1];
                  if (next instanceof MarkViewDesc) {
                      curDesc = next;
                      descI = next.children.length;
                  }
                  else {
                      desc = next;
                      descI--;
                      break;
                  }
              }
              else if (curDesc == parentDesc) {
                  break outer;
              }
              else {
                  // FIXME
                  descI = curDesc.parent.children.indexOf(curDesc);
                  curDesc = curDesc.parent;
              }
          }
          let node = desc.node;
          if (!node)
              continue;
          if (node != frag.child(fI - 1))
              break;
          --fI;
          matched.set(desc, fI);
          matches.push(desc);
      }
      return { index: fI, matched, matches: matches.reverse() };
  }
  function compareSide(a, b) {
      return a.type.side - b.type.side;
  }
  // This function abstracts iterating over the nodes and decorations in
  // a fragment. Calls `onNode` for each node, with its local and child
  // decorations. Splits text nodes when there is a decoration starting
  // or ending inside of them. Calls `onWidget` for each widget.
  function iterDeco(parent, deco, onWidget, onNode) {
      let locals = deco.locals(parent), offset = 0;
      // Simple, cheap variant for when there are no local decorations
      if (locals.length == 0) {
          for (let i = 0; i < parent.childCount; i++) {
              let child = parent.child(i);
              onNode(child, locals, deco.forChild(offset, child), i);
              offset += child.nodeSize;
          }
          return;
      }
      let decoIndex = 0, active = [], restNode = null;
      for (let parentIndex = 0;;) {
          if (decoIndex < locals.length && locals[decoIndex].to == offset) {
              let widget = locals[decoIndex++], widgets;
              while (decoIndex < locals.length && locals[decoIndex].to == offset)
                  (widgets || (widgets = [widget])).push(locals[decoIndex++]);
              if (widgets) {
                  widgets.sort(compareSide);
                  for (let i = 0; i < widgets.length; i++)
                      onWidget(widgets[i], parentIndex, !!restNode);
              }
              else {
                  onWidget(widget, parentIndex, !!restNode);
              }
          }
          let child, index;
          if (restNode) {
              index = -1;
              child = restNode;
              restNode = null;
          }
          else if (parentIndex < parent.childCount) {
              index = parentIndex;
              child = parent.child(parentIndex++);
          }
          else {
              break;
          }
          for (let i = 0; i < active.length; i++)
              if (active[i].to <= offset)
                  active.splice(i--, 1);
          while (decoIndex < locals.length && locals[decoIndex].from <= offset && locals[decoIndex].to > offset)
              active.push(locals[decoIndex++]);
          let end = offset + child.nodeSize;
          if (child.isText) {
              let cutAt = end;
              if (decoIndex < locals.length && locals[decoIndex].from < cutAt)
                  cutAt = locals[decoIndex].from;
              for (let i = 0; i < active.length; i++)
                  if (active[i].to < cutAt)
                      cutAt = active[i].to;
              if (cutAt < end) {
                  restNode = child.cut(cutAt - offset);
                  child = child.cut(0, cutAt - offset);
                  end = cutAt;
                  index = -1;
              }
          }
          let outerDeco = child.isInline && !child.isLeaf ? active.filter(d => !d.inline) : active.slice();
          onNode(child, outerDeco, deco.forChild(offset, child), index);
          offset = end;
      }
  }
  // List markers in Mobile Safari will mysteriously disappear
  // sometimes. This works around that.
  function iosHacks(dom) {
      if (dom.nodeName == "UL" || dom.nodeName == "OL") {
          let oldCSS = dom.style.cssText;
          dom.style.cssText = oldCSS + "; list-style: square !important";
          window.getComputedStyle(dom).listStyle;
          dom.style.cssText = oldCSS;
      }
  }
  function nearbyTextNode(node, offset) {
      for (;;) {
          if (node.nodeType == 3)
              return node;
          if (node.nodeType == 1 && offset > 0) {
              if (node.childNodes.length > offset && node.childNodes[offset].nodeType == 3)
                  return node.childNodes[offset];
              node = node.childNodes[offset - 1];
              offset = nodeSize(node);
          }
          else if (node.nodeType == 1 && offset < node.childNodes.length) {
              node = node.childNodes[offset];
              offset = 0;
          }
          else {
              return null;
          }
      }
  }
  // Find a piece of text in an inline fragment, overlapping from-to
  function findTextInFragment(frag, text, from, to) {
      for (let i = 0, pos = 0; i < frag.childCount && pos <= to;) {
          let child = frag.child(i++), childStart = pos;
          pos += child.nodeSize;
          if (!child.isText)
              continue;
          let str = child.text;
          while (i < frag.childCount) {
              let next = frag.child(i++);
              pos += next.nodeSize;
              if (!next.isText)
                  break;
              str += next.text;
          }
          if (pos >= from) {
              let found = childStart < to ? str.lastIndexOf(text, to - childStart - 1) : -1;
              if (found >= 0 && found + text.length + childStart >= from)
                  return childStart + found;
              if (from == to && str.length >= (to + text.length) - childStart &&
                  str.slice(to - childStart, to - childStart + text.length) == text)
                  return to;
          }
      }
      return -1;
  }
  // Replace range from-to in an array of view descs with replacement
  // (may be null to just delete). This goes very much against the grain
  // of the rest of this code, which tends to create nodes with the
  // right shape in one go, rather than messing with them after
  // creation, but is necessary in the composition hack.
  function replaceNodes(nodes, from, to, view, replacement) {
      let result = [];
      for (let i = 0, off = 0; i < nodes.length; i++) {
          let child = nodes[i], start = off, end = off += child.size;
          if (start >= to || end <= from) {
              result.push(child);
          }
          else {
              if (start < from)
                  result.push(child.slice(0, from - start, view));
              if (replacement) {
                  result.push(replacement);
                  replacement = undefined;
              }
              if (end > to)
                  result.push(child.slice(to - start, child.size, view));
          }
      }
      return result;
  }

  function selectionFromDOM(view, origin = null) {
      let domSel = view.domSelection(), doc = view.state.doc;
      if (!domSel.focusNode)
          return null;
      let nearestDesc = view.docView.nearestDesc(domSel.focusNode), inWidget = nearestDesc && nearestDesc.size == 0;
      let head = view.docView.posFromDOM(domSel.focusNode, domSel.focusOffset, 1);
      if (head < 0)
          return null;
      let $head = doc.resolve(head), $anchor, selection;
      if (selectionCollapsed(domSel)) {
          $anchor = $head;
          while (nearestDesc && !nearestDesc.node)
              nearestDesc = nearestDesc.parent;
          let nearestDescNode = nearestDesc.node;
          if (nearestDesc && nearestDescNode.isAtom && NodeSelection.isSelectable(nearestDescNode) && nearestDesc.parent
              && !(nearestDescNode.isInline && isOnEdge(domSel.focusNode, domSel.focusOffset, nearestDesc.dom))) {
              let pos = nearestDesc.posBefore;
              selection = new NodeSelection(head == pos ? $head : doc.resolve(pos));
          }
      }
      else {
          let anchor = view.docView.posFromDOM(domSel.anchorNode, domSel.anchorOffset, 1);
          if (anchor < 0)
              return null;
          $anchor = doc.resolve(anchor);
      }
      if (!selection) {
          let bias = origin == "pointer" || (view.state.selection.head < $head.pos && !inWidget) ? 1 : -1;
          selection = selectionBetween(view, $anchor, $head, bias);
      }
      return selection;
  }
  function editorOwnsSelection(view) {
      return view.editable ? view.hasFocus() :
          hasSelection(view) && document.activeElement && document.activeElement.contains(view.dom);
  }
  function selectionToDOM(view, force = false) {
      let sel = view.state.selection;
      syncNodeSelection(view, sel);
      if (!editorOwnsSelection(view))
          return;
      // The delayed drag selection causes issues with Cell Selections
      // in Safari. And the drag selection delay is to workarond issues
      // which only present in Chrome.
      if (!force && view.input.mouseDown && view.input.mouseDown.allowDefault && chrome) {
          let domSel = view.domSelection(), curSel = view.domObserver.currentSelection;
          if (domSel.anchorNode && curSel.anchorNode &&
              isEquivalentPosition(domSel.anchorNode, domSel.anchorOffset, curSel.anchorNode, curSel.anchorOffset)) {
              view.input.mouseDown.delayedSelectionSync = true;
              view.domObserver.setCurSelection();
              return;
          }
      }
      view.domObserver.disconnectSelection();
      if (view.cursorWrapper) {
          selectCursorWrapper(view);
      }
      else {
          let { anchor, head } = sel, resetEditableFrom, resetEditableTo;
          if (brokenSelectBetweenUneditable && !(sel instanceof TextSelection)) {
              if (!sel.$from.parent.inlineContent)
                  resetEditableFrom = temporarilyEditableNear(view, sel.from);
              if (!sel.empty && !sel.$from.parent.inlineContent)
                  resetEditableTo = temporarilyEditableNear(view, sel.to);
          }
          view.docView.setSelection(anchor, head, view.root, force);
          if (brokenSelectBetweenUneditable) {
              if (resetEditableFrom)
                  resetEditable(resetEditableFrom);
              if (resetEditableTo)
                  resetEditable(resetEditableTo);
          }
          if (sel.visible) {
              view.dom.classList.remove("ProseMirror-hideselection");
          }
          else {
              view.dom.classList.add("ProseMirror-hideselection");
              if ("onselectionchange" in document)
                  removeClassOnSelectionChange(view);
          }
      }
      view.domObserver.setCurSelection();
      view.domObserver.connectSelection();
  }
  // Kludge to work around Webkit not allowing a selection to start/end
  // between non-editable block nodes. We briefly make something
  // editable, set the selection, then set it uneditable again.
  const brokenSelectBetweenUneditable = safari || chrome && chrome_version < 63;
  function temporarilyEditableNear(view, pos) {
      let { node, offset } = view.docView.domFromPos(pos, 0);
      let after = offset < node.childNodes.length ? node.childNodes[offset] : null;
      let before = offset ? node.childNodes[offset - 1] : null;
      if (safari && after && after.contentEditable == "false")
          return setEditable(after);
      if ((!after || after.contentEditable == "false") &&
          (!before || before.contentEditable == "false")) {
          if (after)
              return setEditable(after);
          else if (before)
              return setEditable(before);
      }
  }
  function setEditable(element) {
      element.contentEditable = "true";
      if (safari && element.draggable) {
          element.draggable = false;
          element.wasDraggable = true;
      }
      return element;
  }
  function resetEditable(element) {
      element.contentEditable = "false";
      if (element.wasDraggable) {
          element.draggable = true;
          element.wasDraggable = null;
      }
  }
  function removeClassOnSelectionChange(view) {
      let doc = view.dom.ownerDocument;
      doc.removeEventListener("selectionchange", view.input.hideSelectionGuard);
      let domSel = view.domSelection();
      let node = domSel.anchorNode, offset = domSel.anchorOffset;
      doc.addEventListener("selectionchange", view.input.hideSelectionGuard = () => {
          if (domSel.anchorNode != node || domSel.anchorOffset != offset) {
              doc.removeEventListener("selectionchange", view.input.hideSelectionGuard);
              setTimeout(() => {
                  if (!editorOwnsSelection(view) || view.state.selection.visible)
                      view.dom.classList.remove("ProseMirror-hideselection");
              }, 20);
          }
      });
  }
  function selectCursorWrapper(view) {
      let domSel = view.domSelection(), range = document.createRange();
      let node = view.cursorWrapper.dom, img = node.nodeName == "IMG";
      if (img)
          range.setEnd(node.parentNode, domIndex(node) + 1);
      else
          range.setEnd(node, 0);
      range.collapse(false);
      domSel.removeAllRanges();
      domSel.addRange(range);
      // Kludge to kill 'control selection' in IE11 when selecting an
      // invisible cursor wrapper, since that would result in those weird
      // resize handles and a selection that considers the absolutely
      // positioned wrapper, rather than the root editable node, the
      // focused element.
      if (!img && !view.state.selection.visible && ie && ie_version <= 11) {
          node.disabled = true;
          node.disabled = false;
      }
  }
  function syncNodeSelection(view, sel) {
      if (sel instanceof NodeSelection) {
          let desc = view.docView.descAt(sel.from);
          if (desc != view.lastSelectedViewDesc) {
              clearNodeSelection(view);
              if (desc)
                  desc.selectNode();
              view.lastSelectedViewDesc = desc;
          }
      }
      else {
          clearNodeSelection(view);
      }
  }
  // Clear all DOM statefulness of the last node selection.
  function clearNodeSelection(view) {
      if (view.lastSelectedViewDesc) {
          if (view.lastSelectedViewDesc.parent)
              view.lastSelectedViewDesc.deselectNode();
          view.lastSelectedViewDesc = undefined;
      }
  }
  function selectionBetween(view, $anchor, $head, bias) {
      return view.someProp("createSelectionBetween", f => f(view, $anchor, $head))
          || TextSelection.between($anchor, $head, bias);
  }
  function hasFocusAndSelection(view) {
      if (view.editable && !view.hasFocus())
          return false;
      return hasSelection(view);
  }
  function hasSelection(view) {
      let sel = view.domSelection();
      if (!sel.anchorNode)
          return false;
      try {
          // Firefox will raise 'permission denied' errors when accessing
          // properties of `sel.anchorNode` when it's in a generated CSS
          // element.
          return view.dom.contains(sel.anchorNode.nodeType == 3 ? sel.anchorNode.parentNode : sel.anchorNode) &&
              (view.editable || view.dom.contains(sel.focusNode.nodeType == 3 ? sel.focusNode.parentNode : sel.focusNode));
      }
      catch (_) {
          return false;
      }
  }
  function anchorInRightPlace(view) {
      let anchorDOM = view.docView.domFromPos(view.state.selection.anchor, 0);
      let domSel = view.domSelection();
      return isEquivalentPosition(anchorDOM.node, anchorDOM.offset, domSel.anchorNode, domSel.anchorOffset);
  }

  function moveSelectionBlock(state, dir) {
      let { $anchor, $head } = state.selection;
      let $side = dir > 0 ? $anchor.max($head) : $anchor.min($head);
      let $start = !$side.parent.inlineContent ? $side : $side.depth ? state.doc.resolve(dir > 0 ? $side.after() : $side.before()) : null;
      return $start && Selection.findFrom($start, dir);
  }
  function apply(view, sel) {
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
      return true;
  }
  function selectHorizontally(view, dir, mods) {
      let sel = view.state.selection;
      if (sel instanceof TextSelection) {
          if (!sel.empty || mods.indexOf("s") > -1) {
              return false;
          }
          else if (view.endOfTextblock(dir > 0 ? "right" : "left")) {
              let next = moveSelectionBlock(view.state, dir);
              if (next && (next instanceof NodeSelection))
                  return apply(view, next);
              return false;
          }
          else if (!(mac && mods.indexOf("m") > -1)) {
              let $head = sel.$head, node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter, desc;
              if (!node || node.isText)
                  return false;
              let nodePos = dir < 0 ? $head.pos - node.nodeSize : $head.pos;
              if (!(node.isAtom || (desc = view.docView.descAt(nodePos)) && !desc.contentDOM))
                  return false;
              if (NodeSelection.isSelectable(node)) {
                  return apply(view, new NodeSelection(dir < 0 ? view.state.doc.resolve($head.pos - node.nodeSize) : $head));
              }
              else if (webkit) {
                  // Chrome and Safari will introduce extra pointless cursor
                  // positions around inline uneditable nodes, so we have to
                  // take over and move the cursor past them (#937)
                  return apply(view, new TextSelection(view.state.doc.resolve(dir < 0 ? nodePos : nodePos + node.nodeSize)));
              }
              else {
                  return false;
              }
          }
      }
      else if (sel instanceof NodeSelection && sel.node.isInline) {
          return apply(view, new TextSelection(dir > 0 ? sel.$to : sel.$from));
      }
      else {
          let next = moveSelectionBlock(view.state, dir);
          if (next)
              return apply(view, next);
          return false;
      }
  }
  function nodeLen(node) {
      return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
  }
  function isIgnorable(dom) {
      let desc = dom.pmViewDesc;
      return desc && desc.size == 0 && (dom.nextSibling || dom.nodeName != "BR");
  }
  // Make sure the cursor isn't directly after one or more ignored
  // nodes, which will confuse the browser's cursor motion logic.
  function skipIgnoredNodesLeft(view) {
      let sel = view.domSelection();
      let node = sel.focusNode, offset = sel.focusOffset;
      if (!node)
          return;
      let moveNode, moveOffset, force = false;
      // Gecko will do odd things when the selection is directly in front
      // of a non-editable node, so in that case, move it into the next
      // node if possible. Issue prosemirror/prosemirror#832.
      if (gecko && node.nodeType == 1 && offset < nodeLen(node) && isIgnorable(node.childNodes[offset]))
          force = true;
      for (;;) {
          if (offset > 0) {
              if (node.nodeType != 1) {
                  break;
              }
              else {
                  let before = node.childNodes[offset - 1];
                  if (isIgnorable(before)) {
                      moveNode = node;
                      moveOffset = --offset;
                  }
                  else if (before.nodeType == 3) {
                      node = before;
                      offset = node.nodeValue.length;
                  }
                  else
                      break;
              }
          }
          else if (isBlockNode(node)) {
              break;
          }
          else {
              let prev = node.previousSibling;
              while (prev && isIgnorable(prev)) {
                  moveNode = node.parentNode;
                  moveOffset = domIndex(prev);
                  prev = prev.previousSibling;
              }
              if (!prev) {
                  node = node.parentNode;
                  if (node == view.dom)
                      break;
                  offset = 0;
              }
              else {
                  node = prev;
                  offset = nodeLen(node);
              }
          }
      }
      if (force)
          setSelFocus(view, sel, node, offset);
      else if (moveNode)
          setSelFocus(view, sel, moveNode, moveOffset);
  }
  // Make sure the cursor isn't directly before one or more ignored
  // nodes.
  function skipIgnoredNodesRight(view) {
      let sel = view.domSelection();
      let node = sel.focusNode, offset = sel.focusOffset;
      if (!node)
          return;
      let len = nodeLen(node);
      let moveNode, moveOffset;
      for (;;) {
          if (offset < len) {
              if (node.nodeType != 1)
                  break;
              let after = node.childNodes[offset];
              if (isIgnorable(after)) {
                  moveNode = node;
                  moveOffset = ++offset;
              }
              else
                  break;
          }
          else if (isBlockNode(node)) {
              break;
          }
          else {
              let next = node.nextSibling;
              while (next && isIgnorable(next)) {
                  moveNode = next.parentNode;
                  moveOffset = domIndex(next) + 1;
                  next = next.nextSibling;
              }
              if (!next) {
                  node = node.parentNode;
                  if (node == view.dom)
                      break;
                  offset = len = 0;
              }
              else {
                  node = next;
                  offset = 0;
                  len = nodeLen(node);
              }
          }
      }
      if (moveNode)
          setSelFocus(view, sel, moveNode, moveOffset);
  }
  function isBlockNode(dom) {
      let desc = dom.pmViewDesc;
      return desc && desc.node && desc.node.isBlock;
  }
  function setSelFocus(view, sel, node, offset) {
      if (selectionCollapsed(sel)) {
          let range = document.createRange();
          range.setEnd(node, offset);
          range.setStart(node, offset);
          sel.removeAllRanges();
          sel.addRange(range);
      }
      else if (sel.extend) {
          sel.extend(node, offset);
      }
      view.domObserver.setCurSelection();
      let { state } = view;
      // If no state update ends up happening, reset the selection.
      setTimeout(() => {
          if (view.state == state)
              selectionToDOM(view);
      }, 50);
  }
  // Check whether vertical selection motion would involve node
  // selections. If so, apply it (if not, the result is left to the
  // browser)
  function selectVertically(view, dir, mods) {
      let sel = view.state.selection;
      if (sel instanceof TextSelection && !sel.empty || mods.indexOf("s") > -1)
          return false;
      if (mac && mods.indexOf("m") > -1)
          return false;
      let { $from, $to } = sel;
      if (!$from.parent.inlineContent || view.endOfTextblock(dir < 0 ? "up" : "down")) {
          let next = moveSelectionBlock(view.state, dir);
          if (next && (next instanceof NodeSelection))
              return apply(view, next);
      }
      if (!$from.parent.inlineContent) {
          let side = dir < 0 ? $from : $to;
          let beyond = sel instanceof AllSelection ? Selection.near(side, dir) : Selection.findFrom(side, dir);
          return beyond ? apply(view, beyond) : false;
      }
      return false;
  }
  function stopNativeHorizontalDelete(view, dir) {
      if (!(view.state.selection instanceof TextSelection))
          return true;
      let { $head, $anchor, empty } = view.state.selection;
      if (!$head.sameParent($anchor))
          return true;
      if (!empty)
          return false;
      if (view.endOfTextblock(dir > 0 ? "forward" : "backward"))
          return true;
      let nextNode = !$head.textOffset && (dir < 0 ? $head.nodeBefore : $head.nodeAfter);
      if (nextNode && !nextNode.isText) {
          let tr = view.state.tr;
          if (dir < 0)
              tr.delete($head.pos - nextNode.nodeSize, $head.pos);
          else
              tr.delete($head.pos, $head.pos + nextNode.nodeSize);
          view.dispatch(tr);
          return true;
      }
      return false;
  }
  function switchEditable(view, node, state) {
      view.domObserver.stop();
      node.contentEditable = state;
      view.domObserver.start();
  }
  // Issue #867 / #1090 / https://bugs.chromium.org/p/chromium/issues/detail?id=903821
  // In which Safari (and at some point in the past, Chrome) does really
  // wrong things when the down arrow is pressed when the cursor is
  // directly at the start of a textblock and has an uneditable node
  // after it
  function safariDownArrowBug(view) {
      if (!safari || view.state.selection.$head.parentOffset > 0)
          return false;
      let { focusNode, focusOffset } = view.domSelection();
      if (focusNode && focusNode.nodeType == 1 && focusOffset == 0 &&
          focusNode.firstChild && focusNode.firstChild.contentEditable == "false") {
          let child = focusNode.firstChild;
          switchEditable(view, child, "true");
          setTimeout(() => switchEditable(view, child, "false"), 20);
      }
      return false;
  }
  // A backdrop key mapping used to make sure we always suppress keys
  // that have a dangerous default effect, even if the commands they are
  // bound to return false, and to make sure that cursor-motion keys
  // find a cursor (as opposed to a node selection) when pressed. For
  // cursor-motion keys, the code in the handlers also takes care of
  // block selections.
  function getMods(event) {
      let result = "";
      if (event.ctrlKey)
          result += "c";
      if (event.metaKey)
          result += "m";
      if (event.altKey)
          result += "a";
      if (event.shiftKey)
          result += "s";
      return result;
  }
  function captureKeyDown(view, event) {
      let code = event.keyCode, mods = getMods(event);
      if (code == 8 || (mac && code == 72 && mods == "c")) { // Backspace, Ctrl-h on Mac
          return stopNativeHorizontalDelete(view, -1) || skipIgnoredNodesLeft(view);
      }
      else if (code == 46 || (mac && code == 68 && mods == "c")) { // Delete, Ctrl-d on Mac
          return stopNativeHorizontalDelete(view, 1) || skipIgnoredNodesRight(view);
      }
      else if (code == 13 || code == 27) { // Enter, Esc
          return true;
      }
      else if (code == 37 || (mac && code == 66 && mods == "c")) { // Left arrow, Ctrl-b on Mac
          return selectHorizontally(view, -1, mods) || skipIgnoredNodesLeft(view);
      }
      else if (code == 39 || (mac && code == 70 && mods == "c")) { // Right arrow, Ctrl-f on Mac
          return selectHorizontally(view, 1, mods) || skipIgnoredNodesRight(view);
      }
      else if (code == 38 || (mac && code == 80 && mods == "c")) { // Up arrow, Ctrl-p on Mac
          return selectVertically(view, -1, mods) || skipIgnoredNodesLeft(view);
      }
      else if (code == 40 || (mac && code == 78 && mods == "c")) { // Down arrow, Ctrl-n on Mac
          return safariDownArrowBug(view) || selectVertically(view, 1, mods) || skipIgnoredNodesRight(view);
      }
      else if (mods == (mac ? "m" : "c") &&
          (code == 66 || code == 73 || code == 89 || code == 90)) { // Mod-[biyz]
          return true;
      }
      return false;
  }

  function serializeForClipboard(view, slice) {
      view.someProp("transformCopied", f => { slice = f(slice); });
      let context = [], { content, openStart, openEnd } = slice;
      while (openStart > 1 && openEnd > 1 && content.childCount == 1 && content.firstChild.childCount == 1) {
          openStart--;
          openEnd--;
          let node = content.firstChild;
          context.push(node.type.name, node.attrs != node.type.defaultAttrs ? node.attrs : null);
          content = node.content;
      }
      let serializer = view.someProp("clipboardSerializer") || DOMSerializer.fromSchema(view.state.schema);
      let doc = detachedDoc(), wrap = doc.createElement("div");
      wrap.appendChild(serializer.serializeFragment(content, { document: doc }));
      let firstChild = wrap.firstChild, needsWrap, wrappers = 0;
      while (firstChild && firstChild.nodeType == 1 && (needsWrap = wrapMap[firstChild.nodeName.toLowerCase()])) {
          for (let i = needsWrap.length - 1; i >= 0; i--) {
              let wrapper = doc.createElement(needsWrap[i]);
              while (wrap.firstChild)
                  wrapper.appendChild(wrap.firstChild);
              wrap.appendChild(wrapper);
              wrappers++;
          }
          firstChild = wrap.firstChild;
      }
      if (firstChild && firstChild.nodeType == 1)
          firstChild.setAttribute("data-pm-slice", `${openStart} ${openEnd}${wrappers ? ` -${wrappers}` : ""} ${JSON.stringify(context)}`);
      let text = view.someProp("clipboardTextSerializer", f => f(slice)) ||
          slice.content.textBetween(0, slice.content.size, "\n\n");
      return { dom: wrap, text };
  }
  // Read a slice of content from the clipboard (or drop data).
  function parseFromClipboard(view, text, html, plainText, $context) {
      let inCode = $context.parent.type.spec.code;
      let dom, slice;
      if (!html && !text)
          return null;
      let asText = text && (plainText || inCode || !html);
      if (asText) {
          view.someProp("transformPastedText", f => { text = f(text, inCode || plainText); });
          if (inCode)
              return text ? new Slice(Fragment.from(view.state.schema.text(text.replace(/\r\n?/g, "\n"))), 0, 0) : Slice.empty;
          let parsed = view.someProp("clipboardTextParser", f => f(text, $context, plainText));
          if (parsed) {
              slice = parsed;
          }
          else {
              let marks = $context.marks();
              let { schema } = view.state, serializer = DOMSerializer.fromSchema(schema);
              dom = document.createElement("div");
              text.split(/(?:\r\n?|\n)+/).forEach(block => {
                  let p = dom.appendChild(document.createElement("p"));
                  if (block)
                      p.appendChild(serializer.serializeNode(schema.text(block, marks)));
              });
          }
      }
      else {
          view.someProp("transformPastedHTML", f => { html = f(html); });
          dom = readHTML(html);
          if (webkit)
              restoreReplacedSpaces(dom);
      }
      let contextNode = dom && dom.querySelector("[data-pm-slice]");
      let sliceData = contextNode && /^(\d+) (\d+)(?: -(\d+))? (.*)/.exec(contextNode.getAttribute("data-pm-slice") || "");
      if (sliceData && sliceData[3])
          for (let i = +sliceData[3]; i > 0 && dom.firstChild; i--)
              dom = dom.firstChild;
      if (!slice) {
          let parser = view.someProp("clipboardParser") || view.someProp("domParser") || DOMParser$1.fromSchema(view.state.schema);
          slice = parser.parseSlice(dom, {
              preserveWhitespace: !!(asText || sliceData),
              context: $context,
              ruleFromNode(dom) {
                  if (dom.nodeName == "BR" && !dom.nextSibling &&
                      dom.parentNode && !inlineParents.test(dom.parentNode.nodeName))
                      return { ignore: true };
                  return null;
              }
          });
      }
      if (sliceData) {
          slice = addContext(closeSlice(slice, +sliceData[1], +sliceData[2]), sliceData[4]);
      }
      else { // HTML wasn't created by ProseMirror. Make sure top-level siblings are coherent
          slice = Slice.maxOpen(normalizeSiblings(slice.content, $context), true);
          if (slice.openStart || slice.openEnd) {
              let openStart = 0, openEnd = 0;
              for (let node = slice.content.firstChild; openStart < slice.openStart && !node.type.spec.isolating; openStart++, node = node.firstChild) { }
              for (let node = slice.content.lastChild; openEnd < slice.openEnd && !node.type.spec.isolating; openEnd++, node = node.lastChild) { }
              slice = closeSlice(slice, openStart, openEnd);
          }
      }
      view.someProp("transformPasted", f => { slice = f(slice); });
      return slice;
  }
  const inlineParents = /^(a|abbr|acronym|b|cite|code|del|em|i|ins|kbd|label|output|q|ruby|s|samp|span|strong|sub|sup|time|u|tt|var)$/i;
  // Takes a slice parsed with parseSlice, which means there hasn't been
  // any content-expression checking done on the top nodes, tries to
  // find a parent node in the current context that might fit the nodes,
  // and if successful, rebuilds the slice so that it fits into that parent.
  //
  // This addresses the problem that Transform.replace expects a
  // coherent slice, and will fail to place a set of siblings that don't
  // fit anywhere in the schema.
  function normalizeSiblings(fragment, $context) {
      if (fragment.childCount < 2)
          return fragment;
      for (let d = $context.depth; d >= 0; d--) {
          let parent = $context.node(d);
          let match = parent.contentMatchAt($context.index(d));
          let lastWrap, result = [];
          fragment.forEach(node => {
              if (!result)
                  return;
              let wrap = match.findWrapping(node.type), inLast;
              if (!wrap)
                  return result = null;
              if (inLast = result.length && lastWrap.length && addToSibling(wrap, lastWrap, node, result[result.length - 1], 0)) {
                  result[result.length - 1] = inLast;
              }
              else {
                  if (result.length)
                      result[result.length - 1] = closeRight(result[result.length - 1], lastWrap.length);
                  let wrapped = withWrappers(node, wrap);
                  result.push(wrapped);
                  match = match.matchType(wrapped.type);
                  lastWrap = wrap;
              }
          });
          if (result)
              return Fragment.from(result);
      }
      return fragment;
  }
  function withWrappers(node, wrap, from = 0) {
      for (let i = wrap.length - 1; i >= from; i--)
          node = wrap[i].create(null, Fragment.from(node));
      return node;
  }
  // Used to group adjacent nodes wrapped in similar parents by
  // normalizeSiblings into the same parent node
  function addToSibling(wrap, lastWrap, node, sibling, depth) {
      if (depth < wrap.length && depth < lastWrap.length && wrap[depth] == lastWrap[depth]) {
          let inner = addToSibling(wrap, lastWrap, node, sibling.lastChild, depth + 1);
          if (inner)
              return sibling.copy(sibling.content.replaceChild(sibling.childCount - 1, inner));
          let match = sibling.contentMatchAt(sibling.childCount);
          if (match.matchType(depth == wrap.length - 1 ? node.type : wrap[depth + 1]))
              return sibling.copy(sibling.content.append(Fragment.from(withWrappers(node, wrap, depth + 1))));
      }
  }
  function closeRight(node, depth) {
      if (depth == 0)
          return node;
      let fragment = node.content.replaceChild(node.childCount - 1, closeRight(node.lastChild, depth - 1));
      let fill = node.contentMatchAt(node.childCount).fillBefore(Fragment.empty, true);
      return node.copy(fragment.append(fill));
  }
  function closeRange(fragment, side, from, to, depth, openEnd) {
      let node = side < 0 ? fragment.firstChild : fragment.lastChild, inner = node.content;
      if (depth < to - 1)
          inner = closeRange(inner, side, from, to, depth + 1, openEnd);
      if (depth >= from)
          inner = side < 0 ? node.contentMatchAt(0).fillBefore(inner, fragment.childCount > 1 || openEnd <= depth).append(inner)
              : inner.append(node.contentMatchAt(node.childCount).fillBefore(Fragment.empty, true));
      return fragment.replaceChild(side < 0 ? 0 : fragment.childCount - 1, node.copy(inner));
  }
  function closeSlice(slice, openStart, openEnd) {
      if (openStart < slice.openStart)
          slice = new Slice(closeRange(slice.content, -1, openStart, slice.openStart, 0, slice.openEnd), openStart, slice.openEnd);
      if (openEnd < slice.openEnd)
          slice = new Slice(closeRange(slice.content, 1, openEnd, slice.openEnd, 0, 0), slice.openStart, openEnd);
      return slice;
  }
  // Trick from jQuery -- some elements must be wrapped in other
  // elements for innerHTML to work. I.e. if you do `div.innerHTML =
  // "<td>..</td>"` the table cells are ignored.
  const wrapMap = {
      thead: ["table"],
      tbody: ["table"],
      tfoot: ["table"],
      caption: ["table"],
      colgroup: ["table"],
      col: ["table", "colgroup"],
      tr: ["table", "tbody"],
      td: ["table", "tbody", "tr"],
      th: ["table", "tbody", "tr"]
  };
  let _detachedDoc = null;
  function detachedDoc() {
      return _detachedDoc || (_detachedDoc = document.implementation.createHTMLDocument("title"));
  }
  function readHTML(html) {
      let metas = /^(\s*<meta [^>]*>)*/.exec(html);
      if (metas)
          html = html.slice(metas[0].length);
      let elt = detachedDoc().createElement("div");
      let firstTag = /<([a-z][^>\s]+)/i.exec(html), wrap;
      if (wrap = firstTag && wrapMap[firstTag[1].toLowerCase()])
          html = wrap.map(n => "<" + n + ">").join("") + html + wrap.map(n => "</" + n + ">").reverse().join("");
      elt.innerHTML = html;
      if (wrap)
          for (let i = 0; i < wrap.length; i++)
              elt = elt.querySelector(wrap[i]) || elt;
      return elt;
  }
  // Webkit browsers do some hard-to-predict replacement of regular
  // spaces with non-breaking spaces when putting content on the
  // clipboard. This tries to convert such non-breaking spaces (which
  // will be wrapped in a plain span on Chrome, a span with class
  // Apple-converted-space on Safari) back to regular spaces.
  function restoreReplacedSpaces(dom) {
      let nodes = dom.querySelectorAll(chrome ? "span:not([class]):not([style])" : "span.Apple-converted-space");
      for (let i = 0; i < nodes.length; i++) {
          let node = nodes[i];
          if (node.childNodes.length == 1 && node.textContent == "\u00a0" && node.parentNode)
              node.parentNode.replaceChild(dom.ownerDocument.createTextNode(" "), node);
      }
  }
  function addContext(slice, context) {
      if (!slice.size)
          return slice;
      let schema = slice.content.firstChild.type.schema, array;
      try {
          array = JSON.parse(context);
      }
      catch (e) {
          return slice;
      }
      let { content, openStart, openEnd } = slice;
      for (let i = array.length - 2; i >= 0; i -= 2) {
          let type = schema.nodes[array[i]];
          if (!type || type.hasRequiredAttrs())
              break;
          content = Fragment.from(type.create(array[i + 1], content));
          openStart++;
          openEnd++;
      }
      return new Slice(content, openStart, openEnd);
  }

  // A collection of DOM events that occur within the editor, and callback functions
  // to invoke when the event fires.
  const handlers = {};
  const editHandlers = {};
  const passiveHandlers = { touchstart: true, touchmove: true };
  class InputState {
      constructor() {
          this.shiftKey = false;
          this.mouseDown = null;
          this.lastKeyCode = null;
          this.lastKeyCodeTime = 0;
          this.lastClick = { time: 0, x: 0, y: 0, type: "" };
          this.lastSelectionOrigin = null;
          this.lastSelectionTime = 0;
          this.lastIOSEnter = 0;
          this.lastIOSEnterFallbackTimeout = -1;
          this.lastFocus = 0;
          this.lastTouch = 0;
          this.lastAndroidDelete = 0;
          this.composing = false;
          this.composingTimeout = -1;
          this.compositionNodes = [];
          this.compositionEndedAt = -2e8;
          this.domChangeCount = 0;
          this.eventHandlers = Object.create(null);
          this.hideSelectionGuard = null;
      }
  }
  function initInput(view) {
      for (let event in handlers) {
          let handler = handlers[event];
          view.dom.addEventListener(event, view.input.eventHandlers[event] = (event) => {
              if (eventBelongsToView(view, event) && !runCustomHandler(view, event) &&
                  (view.editable || !(event.type in editHandlers)))
                  handler(view, event);
          }, passiveHandlers[event] ? { passive: true } : undefined);
      }
      // On Safari, for reasons beyond my understanding, adding an input
      // event handler makes an issue where the composition vanishes when
      // you press enter go away.
      if (safari)
          view.dom.addEventListener("input", () => null);
      ensureListeners(view);
  }
  function setSelectionOrigin(view, origin) {
      view.input.lastSelectionOrigin = origin;
      view.input.lastSelectionTime = Date.now();
  }
  function destroyInput(view) {
      view.domObserver.stop();
      for (let type in view.input.eventHandlers)
          view.dom.removeEventListener(type, view.input.eventHandlers[type]);
      clearTimeout(view.input.composingTimeout);
      clearTimeout(view.input.lastIOSEnterFallbackTimeout);
  }
  function ensureListeners(view) {
      view.someProp("handleDOMEvents", currentHandlers => {
          for (let type in currentHandlers)
              if (!view.input.eventHandlers[type])
                  view.dom.addEventListener(type, view.input.eventHandlers[type] = event => runCustomHandler(view, event));
      });
  }
  function runCustomHandler(view, event) {
      return view.someProp("handleDOMEvents", handlers => {
          let handler = handlers[event.type];
          return handler ? handler(view, event) || event.defaultPrevented : false;
      });
  }
  function eventBelongsToView(view, event) {
      if (!event.bubbles)
          return true;
      if (event.defaultPrevented)
          return false;
      for (let node = event.target; node != view.dom; node = node.parentNode)
          if (!node || node.nodeType == 11 ||
              (node.pmViewDesc && node.pmViewDesc.stopEvent(event)))
              return false;
      return true;
  }
  function dispatchEvent(view, event) {
      if (!runCustomHandler(view, event) && handlers[event.type] &&
          (view.editable || !(event.type in editHandlers)))
          handlers[event.type](view, event);
  }
  editHandlers.keydown = (view, _event) => {
      let event = _event;
      view.input.shiftKey = event.keyCode == 16 || event.shiftKey;
      if (inOrNearComposition(view, event))
          return;
      view.input.lastKeyCode = event.keyCode;
      view.input.lastKeyCodeTime = Date.now();
      // Suppress enter key events on Chrome Android, because those tend
      // to be part of a confused sequence of composition events fired,
      // and handling them eagerly tends to corrupt the input.
      if (android && chrome && event.keyCode == 13)
          return;
      if (event.keyCode != 229)
          view.domObserver.forceFlush();
      // On iOS, if we preventDefault enter key presses, the virtual
      // keyboard gets confused. So the hack here is to set a flag that
      // makes the DOM change code recognize that what just happens should
      // be replaced by whatever the Enter key handlers do.
      if (ios && event.keyCode == 13 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          let now = Date.now();
          view.input.lastIOSEnter = now;
          view.input.lastIOSEnterFallbackTimeout = setTimeout(() => {
              if (view.input.lastIOSEnter == now) {
                  view.someProp("handleKeyDown", f => f(view, keyEvent(13, "Enter")));
                  view.input.lastIOSEnter = 0;
              }
          }, 200);
      }
      else if (view.someProp("handleKeyDown", f => f(view, event)) || captureKeyDown(view, event)) {
          event.preventDefault();
      }
      else {
          setSelectionOrigin(view, "key");
      }
  };
  editHandlers.keyup = (view, event) => {
      if (event.keyCode == 16)
          view.input.shiftKey = false;
  };
  editHandlers.keypress = (view, _event) => {
      let event = _event;
      if (inOrNearComposition(view, event) || !event.charCode ||
          event.ctrlKey && !event.altKey || mac && event.metaKey)
          return;
      if (view.someProp("handleKeyPress", f => f(view, event))) {
          event.preventDefault();
          return;
      }
      let sel = view.state.selection;
      if (!(sel instanceof TextSelection) || !sel.$from.sameParent(sel.$to)) {
          let text = String.fromCharCode(event.charCode);
          if (!view.someProp("handleTextInput", f => f(view, sel.$from.pos, sel.$to.pos, text)))
              view.dispatch(view.state.tr.insertText(text).scrollIntoView());
          event.preventDefault();
      }
  };
  function eventCoords(event) { return { left: event.clientX, top: event.clientY }; }
  function isNear(event, click) {
      let dx = click.x - event.clientX, dy = click.y - event.clientY;
      return dx * dx + dy * dy < 100;
  }
  function runHandlerOnContext(view, propName, pos, inside, event) {
      if (inside == -1)
          return false;
      let $pos = view.state.doc.resolve(inside);
      for (let i = $pos.depth + 1; i > 0; i--) {
          if (view.someProp(propName, f => i > $pos.depth ? f(view, pos, $pos.nodeAfter, $pos.before(i), event, true)
              : f(view, pos, $pos.node(i), $pos.before(i), event, false)))
              return true;
      }
      return false;
  }
  function updateSelection(view, selection, origin) {
      if (!view.focused)
          view.focus();
      let tr = view.state.tr.setSelection(selection);
      if (origin == "pointer")
          tr.setMeta("pointer", true);
      view.dispatch(tr);
  }
  function selectClickedLeaf(view, inside) {
      if (inside == -1)
          return false;
      let $pos = view.state.doc.resolve(inside), node = $pos.nodeAfter;
      if (node && node.isAtom && NodeSelection.isSelectable(node)) {
          updateSelection(view, new NodeSelection($pos), "pointer");
          return true;
      }
      return false;
  }
  function selectClickedNode(view, inside) {
      if (inside == -1)
          return false;
      let sel = view.state.selection, selectedNode, selectAt;
      if (sel instanceof NodeSelection)
          selectedNode = sel.node;
      let $pos = view.state.doc.resolve(inside);
      for (let i = $pos.depth + 1; i > 0; i--) {
          let node = i > $pos.depth ? $pos.nodeAfter : $pos.node(i);
          if (NodeSelection.isSelectable(node)) {
              if (selectedNode && sel.$from.depth > 0 &&
                  i >= sel.$from.depth && $pos.before(sel.$from.depth + 1) == sel.$from.pos)
                  selectAt = $pos.before(sel.$from.depth);
              else
                  selectAt = $pos.before(i);
              break;
          }
      }
      if (selectAt != null) {
          updateSelection(view, NodeSelection.create(view.state.doc, selectAt), "pointer");
          return true;
      }
      else {
          return false;
      }
  }
  function handleSingleClick(view, pos, inside, event, selectNode) {
      return runHandlerOnContext(view, "handleClickOn", pos, inside, event) ||
          view.someProp("handleClick", f => f(view, pos, event)) ||
          (selectNode ? selectClickedNode(view, inside) : selectClickedLeaf(view, inside));
  }
  function handleDoubleClick(view, pos, inside, event) {
      return runHandlerOnContext(view, "handleDoubleClickOn", pos, inside, event) ||
          view.someProp("handleDoubleClick", f => f(view, pos, event));
  }
  function handleTripleClick(view, pos, inside, event) {
      return runHandlerOnContext(view, "handleTripleClickOn", pos, inside, event) ||
          view.someProp("handleTripleClick", f => f(view, pos, event)) ||
          defaultTripleClick(view, inside, event);
  }
  function defaultTripleClick(view, inside, event) {
      if (event.button != 0)
          return false;
      let doc = view.state.doc;
      if (inside == -1) {
          if (doc.inlineContent) {
              updateSelection(view, TextSelection.create(doc, 0, doc.content.size), "pointer");
              return true;
          }
          return false;
      }
      let $pos = doc.resolve(inside);
      for (let i = $pos.depth + 1; i > 0; i--) {
          let node = i > $pos.depth ? $pos.nodeAfter : $pos.node(i);
          let nodePos = $pos.before(i);
          if (node.inlineContent)
              updateSelection(view, TextSelection.create(doc, nodePos + 1, nodePos + 1 + node.content.size), "pointer");
          else if (NodeSelection.isSelectable(node))
              updateSelection(view, NodeSelection.create(doc, nodePos), "pointer");
          else
              continue;
          return true;
      }
  }
  function forceDOMFlush(view) {
      return endComposition(view);
  }
  const selectNodeModifier = mac ? "metaKey" : "ctrlKey";
  handlers.mousedown = (view, _event) => {
      let event = _event;
      view.input.shiftKey = event.shiftKey;
      let flushed = forceDOMFlush(view);
      let now = Date.now(), type = "singleClick";
      if (now - view.input.lastClick.time < 500 && isNear(event, view.input.lastClick) && !event[selectNodeModifier]) {
          if (view.input.lastClick.type == "singleClick")
              type = "doubleClick";
          else if (view.input.lastClick.type == "doubleClick")
              type = "tripleClick";
      }
      view.input.lastClick = { time: now, x: event.clientX, y: event.clientY, type };
      let pos = view.posAtCoords(eventCoords(event));
      if (!pos)
          return;
      if (type == "singleClick") {
          if (view.input.mouseDown)
              view.input.mouseDown.done();
          view.input.mouseDown = new MouseDown(view, pos, event, !!flushed);
      }
      else if ((type == "doubleClick" ? handleDoubleClick : handleTripleClick)(view, pos.pos, pos.inside, event)) {
          event.preventDefault();
      }
      else {
          setSelectionOrigin(view, "pointer");
      }
  };
  class MouseDown {
      constructor(view, pos, event, flushed) {
          this.view = view;
          this.pos = pos;
          this.event = event;
          this.flushed = flushed;
          this.delayedSelectionSync = false;
          this.mightDrag = null;
          this.startDoc = view.state.doc;
          this.selectNode = !!event[selectNodeModifier];
          this.allowDefault = event.shiftKey;
          let targetNode, targetPos;
          if (pos.inside > -1) {
              targetNode = view.state.doc.nodeAt(pos.inside);
              targetPos = pos.inside;
          }
          else {
              let $pos = view.state.doc.resolve(pos.pos);
              targetNode = $pos.parent;
              targetPos = $pos.depth ? $pos.before() : 0;
          }
          const target = flushed ? null : event.target;
          const targetDesc = target ? view.docView.nearestDesc(target, true) : null;
          this.target = targetDesc ? targetDesc.dom : null;
          let { selection } = view.state;
          if (event.button == 0 &&
              targetNode.type.spec.draggable && targetNode.type.spec.selectable !== false ||
              selection instanceof NodeSelection && selection.from <= targetPos && selection.to > targetPos)
              this.mightDrag = {
                  node: targetNode,
                  pos: targetPos,
                  addAttr: !!(this.target && !this.target.draggable),
                  setUneditable: !!(this.target && gecko && !this.target.hasAttribute("contentEditable"))
              };
          if (this.target && this.mightDrag && (this.mightDrag.addAttr || this.mightDrag.setUneditable)) {
              this.view.domObserver.stop();
              if (this.mightDrag.addAttr)
                  this.target.draggable = true;
              if (this.mightDrag.setUneditable)
                  setTimeout(() => {
                      if (this.view.input.mouseDown == this)
                          this.target.setAttribute("contentEditable", "false");
                  }, 20);
              this.view.domObserver.start();
          }
          view.root.addEventListener("mouseup", this.up = this.up.bind(this));
          view.root.addEventListener("mousemove", this.move = this.move.bind(this));
          setSelectionOrigin(view, "pointer");
      }
      done() {
          this.view.root.removeEventListener("mouseup", this.up);
          this.view.root.removeEventListener("mousemove", this.move);
          if (this.mightDrag && this.target) {
              this.view.domObserver.stop();
              if (this.mightDrag.addAttr)
                  this.target.removeAttribute("draggable");
              if (this.mightDrag.setUneditable)
                  this.target.removeAttribute("contentEditable");
              this.view.domObserver.start();
          }
          if (this.delayedSelectionSync)
              setTimeout(() => selectionToDOM(this.view));
          this.view.input.mouseDown = null;
      }
      up(event) {
          this.done();
          if (!this.view.dom.contains(event.target))
              return;
          let pos = this.pos;
          if (this.view.state.doc != this.startDoc)
              pos = this.view.posAtCoords(eventCoords(event));
          this.updateAllowDefault(event);
          if (this.allowDefault || !pos) {
              setSelectionOrigin(this.view, "pointer");
          }
          else if (handleSingleClick(this.view, pos.pos, pos.inside, event, this.selectNode)) {
              event.preventDefault();
          }
          else if (event.button == 0 &&
              (this.flushed ||
                  // Safari ignores clicks on draggable elements
                  (safari && this.mightDrag && !this.mightDrag.node.isAtom) ||
                  // Chrome will sometimes treat a node selection as a
                  // cursor, but still report that the node is selected
                  // when asked through getSelection. You'll then get a
                  // situation where clicking at the point where that
                  // (hidden) cursor is doesn't change the selection, and
                  // thus doesn't get a reaction from ProseMirror. This
                  // works around that.
                  (chrome && !this.view.state.selection.visible &&
                      Math.min(Math.abs(pos.pos - this.view.state.selection.from), Math.abs(pos.pos - this.view.state.selection.to)) <= 2))) {
              updateSelection(this.view, Selection.near(this.view.state.doc.resolve(pos.pos)), "pointer");
              event.preventDefault();
          }
          else {
              setSelectionOrigin(this.view, "pointer");
          }
      }
      move(event) {
          this.updateAllowDefault(event);
          setSelectionOrigin(this.view, "pointer");
          if (event.buttons == 0)
              this.done();
      }
      updateAllowDefault(event) {
          if (!this.allowDefault && (Math.abs(this.event.x - event.clientX) > 4 ||
              Math.abs(this.event.y - event.clientY) > 4))
              this.allowDefault = true;
      }
  }
  handlers.touchstart = view => {
      view.input.lastTouch = Date.now();
      forceDOMFlush(view);
      setSelectionOrigin(view, "pointer");
  };
  handlers.touchmove = view => {
      view.input.lastTouch = Date.now();
      setSelectionOrigin(view, "pointer");
  };
  handlers.contextmenu = view => forceDOMFlush(view);
  function inOrNearComposition(view, event) {
      if (view.composing)
          return true;
      // See https://www.stum.de/2016/06/24/handling-ime-events-in-javascript/.
      // On Japanese input method editors (IMEs), the Enter key is used to confirm character
      // selection. On Safari, when Enter is pressed, compositionend and keydown events are
      // emitted. The keydown event triggers newline insertion, which we don't want.
      // This method returns true if the keydown event should be ignored.
      // We only ignore it once, as pressing Enter a second time *should* insert a newline.
      // Furthermore, the keydown event timestamp must be close to the compositionEndedAt timestamp.
      // This guards against the case where compositionend is triggered without the keyboard
      // (e.g. character confirmation may be done with the mouse), and keydown is triggered
      // afterwards- we wouldn't want to ignore the keydown event in this case.
      if (safari && Math.abs(event.timeStamp - view.input.compositionEndedAt) < 500) {
          view.input.compositionEndedAt = -2e8;
          return true;
      }
      return false;
  }
  // Drop active composition after 5 seconds of inactivity on Android
  const timeoutComposition = android ? 5000 : -1;
  editHandlers.compositionstart = editHandlers.compositionupdate = view => {
      if (!view.composing) {
          view.domObserver.flush();
          let { state } = view, $pos = state.selection.$from;
          if (state.selection.empty &&
              (state.storedMarks ||
                  (!$pos.textOffset && $pos.parentOffset && $pos.nodeBefore.marks.some(m => m.type.spec.inclusive === false)))) {
              // Need to wrap the cursor in mark nodes different from the ones in the DOM context
              view.markCursor = view.state.storedMarks || $pos.marks();
              endComposition(view, true);
              view.markCursor = null;
          }
          else {
              endComposition(view);
              // In firefox, if the cursor is after but outside a marked node,
              // the inserted text won't inherit the marks. So this moves it
              // inside if necessary.
              if (gecko && state.selection.empty && $pos.parentOffset && !$pos.textOffset && $pos.nodeBefore.marks.length) {
                  let sel = view.domSelection();
                  for (let node = sel.focusNode, offset = sel.focusOffset; node && node.nodeType == 1 && offset != 0;) {
                      let before = offset < 0 ? node.lastChild : node.childNodes[offset - 1];
                      if (!before)
                          break;
                      if (before.nodeType == 3) {
                          sel.collapse(before, before.nodeValue.length);
                          break;
                      }
                      else {
                          node = before;
                          offset = -1;
                      }
                  }
              }
          }
          view.input.composing = true;
      }
      scheduleComposeEnd(view, timeoutComposition);
  };
  editHandlers.compositionend = (view, event) => {
      if (view.composing) {
          view.input.composing = false;
          view.input.compositionEndedAt = event.timeStamp;
          scheduleComposeEnd(view, 20);
      }
  };
  function scheduleComposeEnd(view, delay) {
      clearTimeout(view.input.composingTimeout);
      if (delay > -1)
          view.input.composingTimeout = setTimeout(() => endComposition(view), delay);
  }
  function clearComposition(view) {
      if (view.composing) {
          view.input.composing = false;
          view.input.compositionEndedAt = timestampFromCustomEvent();
      }
      while (view.input.compositionNodes.length > 0)
          view.input.compositionNodes.pop().markParentsDirty();
  }
  function timestampFromCustomEvent() {
      let event = document.createEvent("Event");
      event.initEvent("event", true, true);
      return event.timeStamp;
  }
  /**
  @internal
  */
  function endComposition(view, forceUpdate = false) {
      if (android && view.domObserver.flushingSoon >= 0)
          return;
      view.domObserver.forceFlush();
      clearComposition(view);
      if (forceUpdate || view.docView && view.docView.dirty) {
          let sel = selectionFromDOM(view);
          if (sel && !sel.eq(view.state.selection))
              view.dispatch(view.state.tr.setSelection(sel));
          else
              view.updateState(view.state);
          return true;
      }
      return false;
  }
  function captureCopy(view, dom) {
      // The extra wrapper is somehow necessary on IE/Edge to prevent the
      // content from being mangled when it is put onto the clipboard
      if (!view.dom.parentNode)
          return;
      let wrap = view.dom.parentNode.appendChild(document.createElement("div"));
      wrap.appendChild(dom);
      wrap.style.cssText = "position: fixed; left: -10000px; top: 10px";
      let sel = getSelection(), range = document.createRange();
      range.selectNodeContents(dom);
      // Done because IE will fire a selectionchange moving the selection
      // to its start when removeAllRanges is called and the editor still
      // has focus (which will mess up the editor's selection state).
      view.dom.blur();
      sel.removeAllRanges();
      sel.addRange(range);
      setTimeout(() => {
          if (wrap.parentNode)
              wrap.parentNode.removeChild(wrap);
          view.focus();
      }, 50);
  }
  // This is very crude, but unfortunately both these browsers _pretend_
  // that they have a clipboard API—all the objects and methods are
  // there, they just don't work, and they are hard to test.
  const brokenClipboardAPI = (ie && ie_version < 15) ||
      (ios && webkit_version < 604);
  handlers.copy = editHandlers.cut = (view, _event) => {
      let event = _event;
      let sel = view.state.selection, cut = event.type == "cut";
      if (sel.empty)
          return;
      // IE and Edge's clipboard interface is completely broken
      let data = brokenClipboardAPI ? null : event.clipboardData;
      let slice = sel.content(), { dom, text } = serializeForClipboard(view, slice);
      if (data) {
          event.preventDefault();
          data.clearData();
          data.setData("text/html", dom.innerHTML);
          data.setData("text/plain", text);
      }
      else {
          captureCopy(view, dom);
      }
      if (cut)
          view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"));
  };
  function sliceSingleNode(slice) {
      return slice.openStart == 0 && slice.openEnd == 0 && slice.content.childCount == 1 ? slice.content.firstChild : null;
  }
  function capturePaste(view, event) {
      if (!view.dom.parentNode)
          return;
      let plainText = view.input.shiftKey || view.state.selection.$from.parent.type.spec.code;
      let target = view.dom.parentNode.appendChild(document.createElement(plainText ? "textarea" : "div"));
      if (!plainText)
          target.contentEditable = "true";
      target.style.cssText = "position: fixed; left: -10000px; top: 10px";
      target.focus();
      setTimeout(() => {
          view.focus();
          if (target.parentNode)
              target.parentNode.removeChild(target);
          if (plainText)
              doPaste(view, target.value, null, event);
          else
              doPaste(view, target.textContent, target.innerHTML, event);
      }, 50);
  }
  function doPaste(view, text, html, event) {
      let slice = parseFromClipboard(view, text, html, view.input.shiftKey, view.state.selection.$from);
      if (view.someProp("handlePaste", f => f(view, event, slice || Slice.empty)))
          return true;
      if (!slice)
          return false;
      let singleNode = sliceSingleNode(slice);
      let tr = singleNode
          ? view.state.tr.replaceSelectionWith(singleNode, view.input.shiftKey)
          : view.state.tr.replaceSelection(slice);
      view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
      return true;
  }
  editHandlers.paste = (view, _event) => {
      let event = _event;
      // Handling paste from JavaScript during composition is very poorly
      // handled by browsers, so as a dodgy but preferable kludge, we just
      // let the browser do its native thing there, except on Android,
      // where the editor is almost always composing.
      if (view.composing && !android)
          return;
      let data = brokenClipboardAPI ? null : event.clipboardData;
      if (data && doPaste(view, data.getData("text/plain"), data.getData("text/html"), event))
          event.preventDefault();
      else
          capturePaste(view, event);
  };
  class Dragging {
      constructor(slice, move) {
          this.slice = slice;
          this.move = move;
      }
  }
  const dragCopyModifier = mac ? "altKey" : "ctrlKey";
  handlers.dragstart = (view, _event) => {
      let event = _event;
      let mouseDown = view.input.mouseDown;
      if (mouseDown)
          mouseDown.done();
      if (!event.dataTransfer)
          return;
      let sel = view.state.selection;
      let pos = sel.empty ? null : view.posAtCoords(eventCoords(event));
      if (pos && pos.pos >= sel.from && pos.pos <= (sel instanceof NodeSelection ? sel.to - 1 : sel.to)) ;
      else if (mouseDown && mouseDown.mightDrag) {
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, mouseDown.mightDrag.pos)));
      }
      else if (event.target && event.target.nodeType == 1) {
          let desc = view.docView.nearestDesc(event.target, true);
          if (desc && desc.node.type.spec.draggable && desc != view.docView)
              view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, desc.posBefore)));
      }
      let slice = view.state.selection.content(), { dom, text } = serializeForClipboard(view, slice);
      event.dataTransfer.clearData();
      event.dataTransfer.setData(brokenClipboardAPI ? "Text" : "text/html", dom.innerHTML);
      // See https://github.com/ProseMirror/prosemirror/issues/1156
      event.dataTransfer.effectAllowed = "copyMove";
      if (!brokenClipboardAPI)
          event.dataTransfer.setData("text/plain", text);
      view.dragging = new Dragging(slice, !event[dragCopyModifier]);
  };
  handlers.dragend = view => {
      let dragging = view.dragging;
      window.setTimeout(() => {
          if (view.dragging == dragging)
              view.dragging = null;
      }, 50);
  };
  editHandlers.dragover = editHandlers.dragenter = (_, e) => e.preventDefault();
  editHandlers.drop = (view, _event) => {
      let event = _event;
      let dragging = view.dragging;
      view.dragging = null;
      if (!event.dataTransfer)
          return;
      let eventPos = view.posAtCoords(eventCoords(event));
      if (!eventPos)
          return;
      let $mouse = view.state.doc.resolve(eventPos.pos);
      let slice = dragging && dragging.slice;
      if (slice) {
          view.someProp("transformPasted", f => { slice = f(slice); });
      }
      else {
          slice = parseFromClipboard(view, event.dataTransfer.getData(brokenClipboardAPI ? "Text" : "text/plain"), brokenClipboardAPI ? null : event.dataTransfer.getData("text/html"), false, $mouse);
      }
      let move = !!(dragging && !event[dragCopyModifier]);
      if (view.someProp("handleDrop", f => f(view, event, slice || Slice.empty, move))) {
          event.preventDefault();
          return;
      }
      if (!slice)
          return;
      event.preventDefault();
      let insertPos = slice ? dropPoint(view.state.doc, $mouse.pos, slice) : $mouse.pos;
      if (insertPos == null)
          insertPos = $mouse.pos;
      let tr = view.state.tr;
      if (move)
          tr.deleteSelection();
      let pos = tr.mapping.map(insertPos);
      let isNode = slice.openStart == 0 && slice.openEnd == 0 && slice.content.childCount == 1;
      let beforeInsert = tr.doc;
      if (isNode)
          tr.replaceRangeWith(pos, pos, slice.content.firstChild);
      else
          tr.replaceRange(pos, pos, slice);
      if (tr.doc.eq(beforeInsert))
          return;
      let $pos = tr.doc.resolve(pos);
      if (isNode && NodeSelection.isSelectable(slice.content.firstChild) &&
          $pos.nodeAfter && $pos.nodeAfter.sameMarkup(slice.content.firstChild)) {
          tr.setSelection(new NodeSelection($pos));
      }
      else {
          let end = tr.mapping.map(insertPos);
          tr.mapping.maps[tr.mapping.maps.length - 1].forEach((_from, _to, _newFrom, newTo) => end = newTo);
          tr.setSelection(selectionBetween(view, $pos, tr.doc.resolve(end)));
      }
      view.focus();
      view.dispatch(tr.setMeta("uiEvent", "drop"));
  };
  handlers.focus = view => {
      view.input.lastFocus = Date.now();
      if (!view.focused) {
          view.domObserver.stop();
          view.dom.classList.add("ProseMirror-focused");
          view.domObserver.start();
          view.focused = true;
          setTimeout(() => {
              if (view.docView && view.hasFocus() && !view.domObserver.currentSelection.eq(view.domSelection()))
                  selectionToDOM(view);
          }, 20);
      }
  };
  handlers.blur = (view, _event) => {
      let event = _event;
      if (view.focused) {
          view.domObserver.stop();
          view.dom.classList.remove("ProseMirror-focused");
          view.domObserver.start();
          if (event.relatedTarget && view.dom.contains(event.relatedTarget))
              view.domObserver.currentSelection.clear();
          view.focused = false;
      }
  };
  handlers.beforeinput = (view, _event) => {
      let event = _event;
      // We should probably do more with beforeinput events, but support
      // is so spotty that I'm still waiting to see where they are going.
      // Very specific hack to deal with backspace sometimes failing on
      // Chrome Android when after an uneditable node.
      if (chrome && android && event.inputType == "deleteContentBackward") {
          view.domObserver.flushSoon();
          let { domChangeCount } = view.input;
          setTimeout(() => {
              if (view.input.domChangeCount != domChangeCount)
                  return; // Event already had some effect
              // This bug tends to close the virtual keyboard, so we refocus
              view.dom.blur();
              view.focus();
              if (view.someProp("handleKeyDown", f => f(view, keyEvent(8, "Backspace"))))
                  return;
              let { $cursor } = view.state.selection;
              // Crude approximation of backspace behavior when no command handled it
              if ($cursor && $cursor.pos > 0)
                  view.dispatch(view.state.tr.delete($cursor.pos - 1, $cursor.pos).scrollIntoView());
          }, 50);
      }
  };
  // Make sure all handlers get registered
  for (let prop in editHandlers)
      handlers[prop] = editHandlers[prop];

  function compareObjs(a, b) {
      if (a == b)
          return true;
      for (let p in a)
          if (a[p] !== b[p])
              return false;
      for (let p in b)
          if (!(p in a))
              return false;
      return true;
  }
  class WidgetType {
      constructor(toDOM, spec) {
          this.toDOM = toDOM;
          this.spec = spec || noSpec;
          this.side = this.spec.side || 0;
      }
      map(mapping, span, offset, oldOffset) {
          let { pos, deleted } = mapping.mapResult(span.from + oldOffset, this.side < 0 ? -1 : 1);
          return deleted ? null : new Decoration(pos - offset, pos - offset, this);
      }
      valid() { return true; }
      eq(other) {
          return this == other ||
              (other instanceof WidgetType &&
                  (this.spec.key && this.spec.key == other.spec.key ||
                      this.toDOM == other.toDOM && compareObjs(this.spec, other.spec)));
      }
      destroy(node) {
          if (this.spec.destroy)
              this.spec.destroy(node);
      }
  }
  class InlineType {
      constructor(attrs, spec) {
          this.attrs = attrs;
          this.spec = spec || noSpec;
      }
      map(mapping, span, offset, oldOffset) {
          let from = mapping.map(span.from + oldOffset, this.spec.inclusiveStart ? -1 : 1) - offset;
          let to = mapping.map(span.to + oldOffset, this.spec.inclusiveEnd ? 1 : -1) - offset;
          return from >= to ? null : new Decoration(from, to, this);
      }
      valid(_, span) { return span.from < span.to; }
      eq(other) {
          return this == other ||
              (other instanceof InlineType && compareObjs(this.attrs, other.attrs) &&
                  compareObjs(this.spec, other.spec));
      }
      static is(span) { return span.type instanceof InlineType; }
      destroy() { }
  }
  class NodeType {
      constructor(attrs, spec) {
          this.attrs = attrs;
          this.spec = spec || noSpec;
      }
      map(mapping, span, offset, oldOffset) {
          let from = mapping.mapResult(span.from + oldOffset, 1);
          if (from.deleted)
              return null;
          let to = mapping.mapResult(span.to + oldOffset, -1);
          if (to.deleted || to.pos <= from.pos)
              return null;
          return new Decoration(from.pos - offset, to.pos - offset, this);
      }
      valid(node, span) {
          let { index, offset } = node.content.findIndex(span.from), child;
          return offset == span.from && !(child = node.child(index)).isText && offset + child.nodeSize == span.to;
      }
      eq(other) {
          return this == other ||
              (other instanceof NodeType && compareObjs(this.attrs, other.attrs) &&
                  compareObjs(this.spec, other.spec));
      }
      destroy() { }
  }
  /**
  Decoration objects can be provided to the view through the
  [`decorations` prop](https://prosemirror.net/docs/ref/#view.EditorProps.decorations). They come in
  several variants—see the static members of this class for details.
  */
  class Decoration {
      /**
      @internal
      */
      constructor(
      /**
      The start position of the decoration.
      */
      from, 
      /**
      The end position. Will be the same as `from` for [widget
      decorations](https://prosemirror.net/docs/ref/#view.Decoration^widget).
      */
      to, 
      /**
      @internal
      */
      type) {
          this.from = from;
          this.to = to;
          this.type = type;
      }
      /**
      @internal
      */
      copy(from, to) {
          return new Decoration(from, to, this.type);
      }
      /**
      @internal
      */
      eq(other, offset = 0) {
          return this.type.eq(other.type) && this.from + offset == other.from && this.to + offset == other.to;
      }
      /**
      @internal
      */
      map(mapping, offset, oldOffset) {
          return this.type.map(mapping, this, offset, oldOffset);
      }
      /**
      Creates a widget decoration, which is a DOM node that's shown in
      the document at the given position. It is recommended that you
      delay rendering the widget by passing a function that will be
      called when the widget is actually drawn in a view, but you can
      also directly pass a DOM node. `getPos` can be used to find the
      widget's current document position.
      */
      static widget(pos, toDOM, spec) {
          return new Decoration(pos, pos, new WidgetType(toDOM, spec));
      }
      /**
      Creates an inline decoration, which adds the given attributes to
      each inline node between `from` and `to`.
      */
      static inline(from, to, attrs, spec) {
          return new Decoration(from, to, new InlineType(attrs, spec));
      }
      /**
      Creates a node decoration. `from` and `to` should point precisely
      before and after a node in the document. That node, and only that
      node, will receive the given attributes.
      */
      static node(from, to, attrs, spec) {
          return new Decoration(from, to, new NodeType(attrs, spec));
      }
      /**
      The spec provided when creating this decoration. Can be useful
      if you've stored extra information in that object.
      */
      get spec() { return this.type.spec; }
      /**
      @internal
      */
      get inline() { return this.type instanceof InlineType; }
  }
  const none = [], noSpec = {};
  /**
  A collection of [decorations](https://prosemirror.net/docs/ref/#view.Decoration), organized in such
  a way that the drawing algorithm can efficiently use and compare
  them. This is a persistent data structure—it is not modified,
  updates create a new value.
  */
  class DecorationSet {
      /**
      @internal
      */
      constructor(local, children) {
          this.local = local.length ? local : none;
          this.children = children.length ? children : none;
      }
      /**
      Create a set of decorations, using the structure of the given
      document.
      */
      static create(doc, decorations) {
          return decorations.length ? buildTree(decorations, doc, 0, noSpec) : empty;
      }
      /**
      Find all decorations in this set which touch the given range
      (including decorations that start or end directly at the
      boundaries) and match the given predicate on their spec. When
      `start` and `end` are omitted, all decorations in the set are
      considered. When `predicate` isn't given, all decorations are
      assumed to match.
      */
      find(start, end, predicate) {
          let result = [];
          this.findInner(start == null ? 0 : start, end == null ? 1e9 : end, result, 0, predicate);
          return result;
      }
      findInner(start, end, result, offset, predicate) {
          for (let i = 0; i < this.local.length; i++) {
              let span = this.local[i];
              if (span.from <= end && span.to >= start && (!predicate || predicate(span.spec)))
                  result.push(span.copy(span.from + offset, span.to + offset));
          }
          for (let i = 0; i < this.children.length; i += 3) {
              if (this.children[i] < end && this.children[i + 1] > start) {
                  let childOff = this.children[i] + 1;
                  this.children[i + 2].findInner(start - childOff, end - childOff, result, offset + childOff, predicate);
              }
          }
      }
      /**
      Map the set of decorations in response to a change in the
      document.
      */
      map(mapping, doc, options) {
          if (this == empty || mapping.maps.length == 0)
              return this;
          return this.mapInner(mapping, doc, 0, 0, options || noSpec);
      }
      /**
      @internal
      */
      mapInner(mapping, node, offset, oldOffset, options) {
          let newLocal;
          for (let i = 0; i < this.local.length; i++) {
              let mapped = this.local[i].map(mapping, offset, oldOffset);
              if (mapped && mapped.type.valid(node, mapped))
                  (newLocal || (newLocal = [])).push(mapped);
              else if (options.onRemove)
                  options.onRemove(this.local[i].spec);
          }
          if (this.children.length)
              return mapChildren(this.children, newLocal || [], mapping, node, offset, oldOffset, options);
          else
              return newLocal ? new DecorationSet(newLocal.sort(byPos), none) : empty;
      }
      /**
      Add the given array of decorations to the ones in the set,
      producing a new set. Needs access to the current document to
      create the appropriate tree structure.
      */
      add(doc, decorations) {
          if (!decorations.length)
              return this;
          if (this == empty)
              return DecorationSet.create(doc, decorations);
          return this.addInner(doc, decorations, 0);
      }
      addInner(doc, decorations, offset) {
          let children, childIndex = 0;
          doc.forEach((childNode, childOffset) => {
              let baseOffset = childOffset + offset, found;
              if (!(found = takeSpansForNode(decorations, childNode, baseOffset)))
                  return;
              if (!children)
                  children = this.children.slice();
              while (childIndex < children.length && children[childIndex] < childOffset)
                  childIndex += 3;
              if (children[childIndex] == childOffset)
                  children[childIndex + 2] = children[childIndex + 2].addInner(childNode, found, baseOffset + 1);
              else
                  children.splice(childIndex, 0, childOffset, childOffset + childNode.nodeSize, buildTree(found, childNode, baseOffset + 1, noSpec));
              childIndex += 3;
          });
          let local = moveSpans(childIndex ? withoutNulls(decorations) : decorations, -offset);
          for (let i = 0; i < local.length; i++)
              if (!local[i].type.valid(doc, local[i]))
                  local.splice(i--, 1);
          return new DecorationSet(local.length ? this.local.concat(local).sort(byPos) : this.local, children || this.children);
      }
      /**
      Create a new set that contains the decorations in this set, minus
      the ones in the given array.
      */
      remove(decorations) {
          if (decorations.length == 0 || this == empty)
              return this;
          return this.removeInner(decorations, 0);
      }
      removeInner(decorations, offset) {
          let children = this.children, local = this.local;
          for (let i = 0; i < children.length; i += 3) {
              let found;
              let from = children[i] + offset, to = children[i + 1] + offset;
              for (let j = 0, span; j < decorations.length; j++)
                  if (span = decorations[j]) {
                      if (span.from > from && span.to < to) {
                          decorations[j] = null;
                          (found || (found = [])).push(span);
                      }
                  }
              if (!found)
                  continue;
              if (children == this.children)
                  children = this.children.slice();
              let removed = children[i + 2].removeInner(found, from + 1);
              if (removed != empty) {
                  children[i + 2] = removed;
              }
              else {
                  children.splice(i, 3);
                  i -= 3;
              }
          }
          if (local.length)
              for (let i = 0, span; i < decorations.length; i++)
                  if (span = decorations[i]) {
                      for (let j = 0; j < local.length; j++)
                          if (local[j].eq(span, offset)) {
                              if (local == this.local)
                                  local = this.local.slice();
                              local.splice(j--, 1);
                          }
                  }
          if (children == this.children && local == this.local)
              return this;
          return local.length || children.length ? new DecorationSet(local, children) : empty;
      }
      /**
      @internal
      */
      forChild(offset, node) {
          if (this == empty)
              return this;
          if (node.isLeaf)
              return DecorationSet.empty;
          let child, local;
          for (let i = 0; i < this.children.length; i += 3)
              if (this.children[i] >= offset) {
                  if (this.children[i] == offset)
                      child = this.children[i + 2];
                  break;
              }
          let start = offset + 1, end = start + node.content.size;
          for (let i = 0; i < this.local.length; i++) {
              let dec = this.local[i];
              if (dec.from < end && dec.to > start && (dec.type instanceof InlineType)) {
                  let from = Math.max(start, dec.from) - start, to = Math.min(end, dec.to) - start;
                  if (from < to)
                      (local || (local = [])).push(dec.copy(from, to));
              }
          }
          if (local) {
              let localSet = new DecorationSet(local.sort(byPos), none);
              return child ? new DecorationGroup([localSet, child]) : localSet;
          }
          return child || empty;
      }
      /**
      @internal
      */
      eq(other) {
          if (this == other)
              return true;
          if (!(other instanceof DecorationSet) ||
              this.local.length != other.local.length ||
              this.children.length != other.children.length)
              return false;
          for (let i = 0; i < this.local.length; i++)
              if (!this.local[i].eq(other.local[i]))
                  return false;
          for (let i = 0; i < this.children.length; i += 3)
              if (this.children[i] != other.children[i] ||
                  this.children[i + 1] != other.children[i + 1] ||
                  !this.children[i + 2].eq(other.children[i + 2]))
                  return false;
          return true;
      }
      /**
      @internal
      */
      locals(node) {
          return removeOverlap(this.localsInner(node));
      }
      /**
      @internal
      */
      localsInner(node) {
          if (this == empty)
              return none;
          if (node.inlineContent || !this.local.some(InlineType.is))
              return this.local;
          let result = [];
          for (let i = 0; i < this.local.length; i++) {
              if (!(this.local[i].type instanceof InlineType))
                  result.push(this.local[i]);
          }
          return result;
      }
  }
  /**
  The empty set of decorations.
  */
  DecorationSet.empty = new DecorationSet([], []);
  /**
  @internal
  */
  DecorationSet.removeOverlap = removeOverlap;
  const empty = DecorationSet.empty;
  // An abstraction that allows the code dealing with decorations to
  // treat multiple DecorationSet objects as if it were a single object
  // with (a subset of) the same interface.
  class DecorationGroup {
      constructor(members) {
          this.members = members;
      }
      map(mapping, doc) {
          const mappedDecos = this.members.map(member => member.map(mapping, doc, noSpec));
          return DecorationGroup.from(mappedDecos);
      }
      forChild(offset, child) {
          if (child.isLeaf)
              return DecorationSet.empty;
          let found = [];
          for (let i = 0; i < this.members.length; i++) {
              let result = this.members[i].forChild(offset, child);
              if (result == empty)
                  continue;
              if (result instanceof DecorationGroup)
                  found = found.concat(result.members);
              else
                  found.push(result);
          }
          return DecorationGroup.from(found);
      }
      eq(other) {
          if (!(other instanceof DecorationGroup) ||
              other.members.length != this.members.length)
              return false;
          for (let i = 0; i < this.members.length; i++)
              if (!this.members[i].eq(other.members[i]))
                  return false;
          return true;
      }
      locals(node) {
          let result, sorted = true;
          for (let i = 0; i < this.members.length; i++) {
              let locals = this.members[i].localsInner(node);
              if (!locals.length)
                  continue;
              if (!result) {
                  result = locals;
              }
              else {
                  if (sorted) {
                      result = result.slice();
                      sorted = false;
                  }
                  for (let j = 0; j < locals.length; j++)
                      result.push(locals[j]);
              }
          }
          return result ? removeOverlap(sorted ? result : result.sort(byPos)) : none;
      }
      // Create a group for the given array of decoration sets, or return
      // a single set when possible.
      static from(members) {
          switch (members.length) {
              case 0: return empty;
              case 1: return members[0];
              default: return new DecorationGroup(members);
          }
      }
  }
  function mapChildren(oldChildren, newLocal, mapping, node, offset, oldOffset, options) {
      let children = oldChildren.slice();
      // Mark the children that are directly touched by changes, and
      // move those that are after the changes.
      for (let i = 0, baseOffset = oldOffset; i < mapping.maps.length; i++) {
          let moved = 0;
          mapping.maps[i].forEach((oldStart, oldEnd, newStart, newEnd) => {
              let dSize = (newEnd - newStart) - (oldEnd - oldStart);
              for (let i = 0; i < children.length; i += 3) {
                  let end = children[i + 1];
                  if (end < 0 || oldStart > end + baseOffset - moved)
                      continue;
                  let start = children[i] + baseOffset - moved;
                  if (oldEnd >= start) {
                      children[i + 1] = oldStart <= start ? -2 : -1;
                  }
                  else if (newStart >= offset && dSize) {
                      children[i] += dSize;
                      children[i + 1] += dSize;
                  }
              }
              moved += dSize;
          });
          baseOffset = mapping.maps[i].map(baseOffset, -1);
      }
      // Find the child nodes that still correspond to a single node,
      // recursively call mapInner on them and update their positions.
      let mustRebuild = false;
      for (let i = 0; i < children.length; i += 3)
          if (children[i + 1] < 0) { // Touched nodes
              if (children[i + 1] == -2) {
                  mustRebuild = true;
                  children[i + 1] = -1;
                  continue;
              }
              let from = mapping.map(oldChildren[i] + oldOffset), fromLocal = from - offset;
              if (fromLocal < 0 || fromLocal >= node.content.size) {
                  mustRebuild = true;
                  continue;
              }
              // Must read oldChildren because children was tagged with -1
              let to = mapping.map(oldChildren[i + 1] + oldOffset, -1), toLocal = to - offset;
              let { index, offset: childOffset } = node.content.findIndex(fromLocal);
              let childNode = node.maybeChild(index);
              if (childNode && childOffset == fromLocal && childOffset + childNode.nodeSize == toLocal) {
                  let mapped = children[i + 2]
                      .mapInner(mapping, childNode, from + 1, oldChildren[i] + oldOffset + 1, options);
                  if (mapped != empty) {
                      children[i] = fromLocal;
                      children[i + 1] = toLocal;
                      children[i + 2] = mapped;
                  }
                  else {
                      children[i + 1] = -2;
                      mustRebuild = true;
                  }
              }
              else {
                  mustRebuild = true;
              }
          }
      // Remaining children must be collected and rebuilt into the appropriate structure
      if (mustRebuild) {
          let decorations = mapAndGatherRemainingDecorations(children, oldChildren, newLocal, mapping, offset, oldOffset, options);
          let built = buildTree(decorations, node, 0, options);
          newLocal = built.local;
          for (let i = 0; i < children.length; i += 3)
              if (children[i + 1] < 0) {
                  children.splice(i, 3);
                  i -= 3;
              }
          for (let i = 0, j = 0; i < built.children.length; i += 3) {
              let from = built.children[i];
              while (j < children.length && children[j] < from)
                  j += 3;
              children.splice(j, 0, built.children[i], built.children[i + 1], built.children[i + 2]);
          }
      }
      return new DecorationSet(newLocal.sort(byPos), children);
  }
  function moveSpans(spans, offset) {
      if (!offset || !spans.length)
          return spans;
      let result = [];
      for (let i = 0; i < spans.length; i++) {
          let span = spans[i];
          result.push(new Decoration(span.from + offset, span.to + offset, span.type));
      }
      return result;
  }
  function mapAndGatherRemainingDecorations(children, oldChildren, decorations, mapping, offset, oldOffset, options) {
      // Gather all decorations from the remaining marked children
      function gather(set, oldOffset) {
          for (let i = 0; i < set.local.length; i++) {
              let mapped = set.local[i].map(mapping, offset, oldOffset);
              if (mapped)
                  decorations.push(mapped);
              else if (options.onRemove)
                  options.onRemove(set.local[i].spec);
          }
          for (let i = 0; i < set.children.length; i += 3)
              gather(set.children[i + 2], set.children[i] + oldOffset + 1);
      }
      for (let i = 0; i < children.length; i += 3)
          if (children[i + 1] == -1)
              gather(children[i + 2], oldChildren[i] + oldOffset + 1);
      return decorations;
  }
  function takeSpansForNode(spans, node, offset) {
      if (node.isLeaf)
          return null;
      let end = offset + node.nodeSize, found = null;
      for (let i = 0, span; i < spans.length; i++) {
          if ((span = spans[i]) && span.from > offset && span.to < end) {
              (found || (found = [])).push(span);
              spans[i] = null;
          }
      }
      return found;
  }
  function withoutNulls(array) {
      let result = [];
      for (let i = 0; i < array.length; i++)
          if (array[i] != null)
              result.push(array[i]);
      return result;
  }
  // Build up a tree that corresponds to a set of decorations. `offset`
  // is a base offset that should be subtracted from the `from` and `to`
  // positions in the spans (so that we don't have to allocate new spans
  // for recursive calls).
  function buildTree(spans, node, offset, options) {
      let children = [], hasNulls = false;
      node.forEach((childNode, localStart) => {
          let found = takeSpansForNode(spans, childNode, localStart + offset);
          if (found) {
              hasNulls = true;
              let subtree = buildTree(found, childNode, offset + localStart + 1, options);
              if (subtree != empty)
                  children.push(localStart, localStart + childNode.nodeSize, subtree);
          }
      });
      let locals = moveSpans(hasNulls ? withoutNulls(spans) : spans, -offset).sort(byPos);
      for (let i = 0; i < locals.length; i++)
          if (!locals[i].type.valid(node, locals[i])) {
              if (options.onRemove)
                  options.onRemove(locals[i].spec);
              locals.splice(i--, 1);
          }
      return locals.length || children.length ? new DecorationSet(locals, children) : empty;
  }
  // Used to sort decorations so that ones with a low start position
  // come first, and within a set with the same start position, those
  // with an smaller end position come first.
  function byPos(a, b) {
      return a.from - b.from || a.to - b.to;
  }
  // Scan a sorted array of decorations for partially overlapping spans,
  // and split those so that only fully overlapping spans are left (to
  // make subsequent rendering easier). Will return the input array if
  // no partially overlapping spans are found (the common case).
  function removeOverlap(spans) {
      let working = spans;
      for (let i = 0; i < working.length - 1; i++) {
          let span = working[i];
          if (span.from != span.to)
              for (let j = i + 1; j < working.length; j++) {
                  let next = working[j];
                  if (next.from == span.from) {
                      if (next.to != span.to) {
                          if (working == spans)
                              working = spans.slice();
                          // Followed by a partially overlapping larger span. Split that
                          // span.
                          working[j] = next.copy(next.from, span.to);
                          insertAhead(working, j + 1, next.copy(span.to, next.to));
                      }
                      continue;
                  }
                  else {
                      if (next.from < span.to) {
                          if (working == spans)
                              working = spans.slice();
                          // The end of this one overlaps with a subsequent span. Split
                          // this one.
                          working[i] = span.copy(span.from, next.from);
                          insertAhead(working, j, span.copy(next.from, span.to));
                      }
                      break;
                  }
              }
      }
      return working;
  }
  function insertAhead(array, i, deco) {
      while (i < array.length && byPos(deco, array[i]) > 0)
          i++;
      array.splice(i, 0, deco);
  }
  // Get the decorations associated with the current props of a view.
  function viewDecorations(view) {
      let found = [];
      view.someProp("decorations", f => {
          let result = f(view.state);
          if (result && result != empty)
              found.push(result);
      });
      if (view.cursorWrapper)
          found.push(DecorationSet.create(view.state.doc, [view.cursorWrapper.deco]));
      return DecorationGroup.from(found);
  }

  const observeOptions = {
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeOldValue: true,
      subtree: true
  };
  // IE11 has very broken mutation observers, so we also listen to DOMCharacterDataModified
  const useCharData = ie && ie_version <= 11;
  class SelectionState {
      constructor() {
          this.anchorNode = null;
          this.anchorOffset = 0;
          this.focusNode = null;
          this.focusOffset = 0;
      }
      set(sel) {
          this.anchorNode = sel.anchorNode;
          this.anchorOffset = sel.anchorOffset;
          this.focusNode = sel.focusNode;
          this.focusOffset = sel.focusOffset;
      }
      clear() {
          this.anchorNode = this.focusNode = null;
      }
      eq(sel) {
          return sel.anchorNode == this.anchorNode && sel.anchorOffset == this.anchorOffset &&
              sel.focusNode == this.focusNode && sel.focusOffset == this.focusOffset;
      }
  }
  class DOMObserver {
      constructor(view, handleDOMChange) {
          this.view = view;
          this.handleDOMChange = handleDOMChange;
          this.queue = [];
          this.flushingSoon = -1;
          this.observer = null;
          this.currentSelection = new SelectionState;
          this.onCharData = null;
          this.suppressingSelectionUpdates = false;
          this.observer = window.MutationObserver &&
              new window.MutationObserver(mutations => {
                  for (let i = 0; i < mutations.length; i++)
                      this.queue.push(mutations[i]);
                  // IE11 will sometimes (on backspacing out a single character
                  // text node after a BR node) call the observer callback
                  // before actually updating the DOM, which will cause
                  // ProseMirror to miss the change (see #930)
                  if (ie && ie_version <= 11 && mutations.some(m => m.type == "childList" && m.removedNodes.length ||
                      m.type == "characterData" && m.oldValue.length > m.target.nodeValue.length))
                      this.flushSoon();
                  else
                      this.flush();
              });
          if (useCharData) {
              this.onCharData = e => {
                  this.queue.push({ target: e.target, type: "characterData", oldValue: e.prevValue });
                  this.flushSoon();
              };
          }
          this.onSelectionChange = this.onSelectionChange.bind(this);
      }
      flushSoon() {
          if (this.flushingSoon < 0)
              this.flushingSoon = window.setTimeout(() => { this.flushingSoon = -1; this.flush(); }, 20);
      }
      forceFlush() {
          if (this.flushingSoon > -1) {
              window.clearTimeout(this.flushingSoon);
              this.flushingSoon = -1;
              this.flush();
          }
      }
      start() {
          if (this.observer) {
              this.observer.takeRecords();
              this.observer.observe(this.view.dom, observeOptions);
          }
          if (this.onCharData)
              this.view.dom.addEventListener("DOMCharacterDataModified", this.onCharData);
          this.connectSelection();
      }
      stop() {
          if (this.observer) {
              let take = this.observer.takeRecords();
              if (take.length) {
                  for (let i = 0; i < take.length; i++)
                      this.queue.push(take[i]);
                  window.setTimeout(() => this.flush(), 20);
              }
              this.observer.disconnect();
          }
          if (this.onCharData)
              this.view.dom.removeEventListener("DOMCharacterDataModified", this.onCharData);
          this.disconnectSelection();
      }
      connectSelection() {
          this.view.dom.ownerDocument.addEventListener("selectionchange", this.onSelectionChange);
      }
      disconnectSelection() {
          this.view.dom.ownerDocument.removeEventListener("selectionchange", this.onSelectionChange);
      }
      suppressSelectionUpdates() {
          this.suppressingSelectionUpdates = true;
          setTimeout(() => this.suppressingSelectionUpdates = false, 50);
      }
      onSelectionChange() {
          if (!hasFocusAndSelection(this.view))
              return;
          if (this.suppressingSelectionUpdates)
              return selectionToDOM(this.view);
          // Deletions on IE11 fire their events in the wrong order, giving
          // us a selection change event before the DOM changes are
          // reported.
          if (ie && ie_version <= 11 && !this.view.state.selection.empty) {
              let sel = this.view.domSelection();
              // Selection.isCollapsed isn't reliable on IE
              if (sel.focusNode && isEquivalentPosition(sel.focusNode, sel.focusOffset, sel.anchorNode, sel.anchorOffset))
                  return this.flushSoon();
          }
          this.flush();
      }
      setCurSelection() {
          this.currentSelection.set(this.view.domSelection());
      }
      ignoreSelectionChange(sel) {
          if (sel.rangeCount == 0)
              return true;
          let container = sel.getRangeAt(0).commonAncestorContainer;
          let desc = this.view.docView.nearestDesc(container);
          if (desc && desc.ignoreMutation({
              type: "selection",
              target: container.nodeType == 3 ? container.parentNode : container
          })) {
              this.setCurSelection();
              return true;
          }
      }
      flush() {
          let { view } = this;
          if (!view.docView || this.flushingSoon > -1)
              return;
          let mutations = this.observer ? this.observer.takeRecords() : [];
          if (this.queue.length) {
              mutations = this.queue.concat(mutations);
              this.queue.length = 0;
          }
          let sel = view.domSelection();
          let newSel = !this.suppressingSelectionUpdates && !this.currentSelection.eq(sel) && hasFocusAndSelection(view) && !this.ignoreSelectionChange(sel);
          let from = -1, to = -1, typeOver = false, added = [];
          if (view.editable) {
              for (let i = 0; i < mutations.length; i++) {
                  let result = this.registerMutation(mutations[i], added);
                  if (result) {
                      from = from < 0 ? result.from : Math.min(result.from, from);
                      to = to < 0 ? result.to : Math.max(result.to, to);
                      if (result.typeOver)
                          typeOver = true;
                  }
              }
          }
          if (gecko && added.length > 1) {
              let brs = added.filter(n => n.nodeName == "BR");
              if (brs.length == 2) {
                  let a = brs[0], b = brs[1];
                  if (a.parentNode && a.parentNode.parentNode == b.parentNode)
                      b.remove();
                  else
                      a.remove();
              }
          }
          let readSel = null;
          // If it looks like the browser has reset the selection to the
          // start of the document after focus, restore the selection from
          // the state
          if (from < 0 && newSel && view.input.lastFocus > Date.now() - 200 &&
              view.input.lastTouch < Date.now() - 300 &&
              selectionCollapsed(sel) && (readSel = selectionFromDOM(view)) &&
              readSel.eq(Selection.near(view.state.doc.resolve(0), 1))) {
              view.input.lastFocus = 0;
              selectionToDOM(view);
              this.currentSelection.set(sel);
              view.scrollToSelection();
          }
          else if (from > -1 || newSel) {
              if (from > -1) {
                  view.docView.markDirty(from, to);
                  checkCSS(view);
              }
              this.handleDOMChange(from, to, typeOver, added);
              if (view.docView && view.docView.dirty)
                  view.updateState(view.state);
              else if (!this.currentSelection.eq(sel))
                  selectionToDOM(view);
              this.currentSelection.set(sel);
          }
      }
      registerMutation(mut, added) {
          // Ignore mutations inside nodes that were already noted as inserted
          if (added.indexOf(mut.target) > -1)
              return null;
          let desc = this.view.docView.nearestDesc(mut.target);
          if (mut.type == "attributes" &&
              (desc == this.view.docView || mut.attributeName == "contenteditable" ||
                  // Firefox sometimes fires spurious events for null/empty styles
                  (mut.attributeName == "style" && !mut.oldValue && !mut.target.getAttribute("style"))))
              return null;
          if (!desc || desc.ignoreMutation(mut))
              return null;
          if (mut.type == "childList") {
              for (let i = 0; i < mut.addedNodes.length; i++)
                  added.push(mut.addedNodes[i]);
              if (desc.contentDOM && desc.contentDOM != desc.dom && !desc.contentDOM.contains(mut.target))
                  return { from: desc.posBefore, to: desc.posAfter };
              let prev = mut.previousSibling, next = mut.nextSibling;
              if (ie && ie_version <= 11 && mut.addedNodes.length) {
                  // IE11 gives us incorrect next/prev siblings for some
                  // insertions, so if there are added nodes, recompute those
                  for (let i = 0; i < mut.addedNodes.length; i++) {
                      let { previousSibling, nextSibling } = mut.addedNodes[i];
                      if (!previousSibling || Array.prototype.indexOf.call(mut.addedNodes, previousSibling) < 0)
                          prev = previousSibling;
                      if (!nextSibling || Array.prototype.indexOf.call(mut.addedNodes, nextSibling) < 0)
                          next = nextSibling;
                  }
              }
              let fromOffset = prev && prev.parentNode == mut.target
                  ? domIndex(prev) + 1 : 0;
              let from = desc.localPosFromDOM(mut.target, fromOffset, -1);
              let toOffset = next && next.parentNode == mut.target
                  ? domIndex(next) : mut.target.childNodes.length;
              let to = desc.localPosFromDOM(mut.target, toOffset, 1);
              return { from, to };
          }
          else if (mut.type == "attributes") {
              return { from: desc.posAtStart - desc.border, to: desc.posAtEnd + desc.border };
          }
          else { // "characterData"
              return {
                  from: desc.posAtStart,
                  to: desc.posAtEnd,
                  // An event was generated for a text change that didn't change
                  // any text. Mark the dom change to fall back to assuming the
                  // selection was typed over with an identical value if it can't
                  // find another change.
                  typeOver: mut.target.nodeValue == mut.oldValue
              };
          }
      }
  }
  let cssChecked = new WeakMap();
  let cssCheckWarned = false;
  function checkCSS(view) {
      if (cssChecked.has(view))
          return;
      cssChecked.set(view, null);
      if (['normal', 'nowrap', 'pre-line'].indexOf(getComputedStyle(view.dom).whiteSpace) !== -1) {
          view.requiresGeckoHackNode = gecko;
          if (cssCheckWarned)
              return;
          console["warn"]("ProseMirror expects the CSS white-space property to be set, preferably to 'pre-wrap'. It is recommended to load style/prosemirror.css from the prosemirror-view package.");
          cssCheckWarned = true;
      }
  }

  // Note that all referencing and parsing is done with the
  // start-of-operation selection and document, since that's the one
  // that the DOM represents. If any changes came in in the meantime,
  // the modification is mapped over those before it is applied, in
  // readDOMChange.
  function parseBetween(view, from_, to_) {
      let { node: parent, fromOffset, toOffset, from, to } = view.docView.parseRange(from_, to_);
      let domSel = view.domSelection();
      let find;
      let anchor = domSel.anchorNode;
      if (anchor && view.dom.contains(anchor.nodeType == 1 ? anchor : anchor.parentNode)) {
          find = [{ node: anchor, offset: domSel.anchorOffset }];
          if (!selectionCollapsed(domSel))
              find.push({ node: domSel.focusNode, offset: domSel.focusOffset });
      }
      // Work around issue in Chrome where backspacing sometimes replaces
      // the deleted content with a random BR node (issues #799, #831)
      if (chrome && view.input.lastKeyCode === 8) {
          for (let off = toOffset; off > fromOffset; off--) {
              let node = parent.childNodes[off - 1], desc = node.pmViewDesc;
              if (node.nodeName == "BR" && !desc) {
                  toOffset = off;
                  break;
              }
              if (!desc || desc.size)
                  break;
          }
      }
      let startDoc = view.state.doc;
      let parser = view.someProp("domParser") || DOMParser$1.fromSchema(view.state.schema);
      let $from = startDoc.resolve(from);
      let sel = null, doc = parser.parse(parent, {
          topNode: $from.parent,
          topMatch: $from.parent.contentMatchAt($from.index()),
          topOpen: true,
          from: fromOffset,
          to: toOffset,
          preserveWhitespace: $from.parent.type.whitespace == "pre" ? "full" : true,
          findPositions: find,
          ruleFromNode,
          context: $from
      });
      if (find && find[0].pos != null) {
          let anchor = find[0].pos, head = find[1] && find[1].pos;
          if (head == null)
              head = anchor;
          sel = { anchor: anchor + from, head: head + from };
      }
      return { doc, sel, from, to };
  }
  function ruleFromNode(dom) {
      let desc = dom.pmViewDesc;
      if (desc) {
          return desc.parseRule();
      }
      else if (dom.nodeName == "BR" && dom.parentNode) {
          // Safari replaces the list item or table cell with a BR
          // directly in the list node (?!) if you delete the last
          // character in a list item or table cell (#708, #862)
          if (safari && /^(ul|ol)$/i.test(dom.parentNode.nodeName)) {
              let skip = document.createElement("div");
              skip.appendChild(document.createElement("li"));
              return { skip };
          }
          else if (dom.parentNode.lastChild == dom || safari && /^(tr|table)$/i.test(dom.parentNode.nodeName)) {
              return { ignore: true };
          }
      }
      else if (dom.nodeName == "IMG" && dom.getAttribute("mark-placeholder")) {
          return { ignore: true };
      }
      return null;
  }
  function readDOMChange(view, from, to, typeOver, addedNodes) {
      if (from < 0) {
          let origin = view.input.lastSelectionTime > Date.now() - 50 ? view.input.lastSelectionOrigin : null;
          let newSel = selectionFromDOM(view, origin);
          if (newSel && !view.state.selection.eq(newSel)) {
              let tr = view.state.tr.setSelection(newSel);
              if (origin == "pointer")
                  tr.setMeta("pointer", true);
              else if (origin == "key")
                  tr.scrollIntoView();
              view.dispatch(tr);
          }
          return;
      }
      let $before = view.state.doc.resolve(from);
      let shared = $before.sharedDepth(to);
      from = $before.before(shared + 1);
      to = view.state.doc.resolve(to).after(shared + 1);
      let sel = view.state.selection;
      let parse = parseBetween(view, from, to);
      let doc = view.state.doc, compare = doc.slice(parse.from, parse.to);
      let preferredPos, preferredSide;
      // Prefer anchoring to end when Backspace is pressed
      if (view.input.lastKeyCode === 8 && Date.now() - 100 < view.input.lastKeyCodeTime) {
          preferredPos = view.state.selection.to;
          preferredSide = "end";
      }
      else {
          preferredPos = view.state.selection.from;
          preferredSide = "start";
      }
      view.input.lastKeyCode = null;
      let change = findDiff(compare.content, parse.doc.content, parse.from, preferredPos, preferredSide);
      if ((ios && view.input.lastIOSEnter > Date.now() - 225 || android) &&
          addedNodes.some(n => n.nodeName == "DIV" || n.nodeName == "P") &&
          (!change || change.endA >= change.endB) &&
          view.someProp("handleKeyDown", f => f(view, keyEvent(13, "Enter")))) {
          view.input.lastIOSEnter = 0;
          return;
      }
      if (!change) {
          if (typeOver && sel instanceof TextSelection && !sel.empty && sel.$head.sameParent(sel.$anchor) &&
              !view.composing && !(parse.sel && parse.sel.anchor != parse.sel.head)) {
              change = { start: sel.from, endA: sel.to, endB: sel.to };
          }
          else {
              if (parse.sel) {
                  let sel = resolveSelection(view, view.state.doc, parse.sel);
                  if (sel && !sel.eq(view.state.selection))
                      view.dispatch(view.state.tr.setSelection(sel));
              }
              return;
          }
      }
      // Chrome sometimes leaves the cursor before the inserted text when
      // composing after a cursor wrapper. This moves it forward.
      if (chrome && view.cursorWrapper && parse.sel && parse.sel.anchor == view.cursorWrapper.deco.from &&
          parse.sel.head == parse.sel.anchor) {
          let size = change.endB - change.start;
          parse.sel = { anchor: parse.sel.anchor + size, head: parse.sel.anchor + size };
      }
      view.input.domChangeCount++;
      // Handle the case where overwriting a selection by typing matches
      // the start or end of the selected content, creating a change
      // that's smaller than what was actually overwritten.
      if (view.state.selection.from < view.state.selection.to &&
          change.start == change.endB &&
          view.state.selection instanceof TextSelection) {
          if (change.start > view.state.selection.from && change.start <= view.state.selection.from + 2 &&
              view.state.selection.from >= parse.from) {
              change.start = view.state.selection.from;
          }
          else if (change.endA < view.state.selection.to && change.endA >= view.state.selection.to - 2 &&
              view.state.selection.to <= parse.to) {
              change.endB += (view.state.selection.to - change.endA);
              change.endA = view.state.selection.to;
          }
      }
      // IE11 will insert a non-breaking space _ahead_ of the space after
      // the cursor space when adding a space before another space. When
      // that happened, adjust the change to cover the space instead.
      if (ie && ie_version <= 11 && change.endB == change.start + 1 &&
          change.endA == change.start && change.start > parse.from &&
          parse.doc.textBetween(change.start - parse.from - 1, change.start - parse.from + 1) == " \u00a0") {
          change.start--;
          change.endA--;
          change.endB--;
      }
      let $from = parse.doc.resolveNoCache(change.start - parse.from);
      let $to = parse.doc.resolveNoCache(change.endB - parse.from);
      let $fromA = doc.resolve(change.start);
      let inlineChange = $from.sameParent($to) && $from.parent.inlineContent && $fromA.end() >= change.endA;
      let nextSel;
      // If this looks like the effect of pressing Enter (or was recorded
      // as being an iOS enter press), just dispatch an Enter key instead.
      if (((ios && view.input.lastIOSEnter > Date.now() - 225 &&
          (!inlineChange || addedNodes.some(n => n.nodeName == "DIV" || n.nodeName == "P"))) ||
          (!inlineChange && $from.pos < parse.doc.content.size &&
              (nextSel = Selection.findFrom(parse.doc.resolve($from.pos + 1), 1, true)) &&
              nextSel.head == $to.pos)) &&
          view.someProp("handleKeyDown", f => f(view, keyEvent(13, "Enter")))) {
          view.input.lastIOSEnter = 0;
          return;
      }
      // Same for backspace
      if (view.state.selection.anchor > change.start &&
          looksLikeJoin(doc, change.start, change.endA, $from, $to) &&
          view.someProp("handleKeyDown", f => f(view, keyEvent(8, "Backspace")))) {
          if (android && chrome)
              view.domObserver.suppressSelectionUpdates(); // #820
          return;
      }
      // Chrome Android will occasionally, during composition, delete the
      // entire composition and then immediately insert it again. This is
      // used to detect that situation.
      if (chrome && android && change.endB == change.start)
          view.input.lastAndroidDelete = Date.now();
      // This tries to detect Android virtual keyboard
      // enter-and-pick-suggestion action. That sometimes (see issue
      // #1059) first fires a DOM mutation, before moving the selection to
      // the newly created block. And then, because ProseMirror cleans up
      // the DOM selection, it gives up moving the selection entirely,
      // leaving the cursor in the wrong place. When that happens, we drop
      // the new paragraph from the initial change, and fire a simulated
      // enter key afterwards.
      if (android && !inlineChange && $from.start() != $to.start() && $to.parentOffset == 0 && $from.depth == $to.depth &&
          parse.sel && parse.sel.anchor == parse.sel.head && parse.sel.head == change.endA) {
          change.endB -= 2;
          $to = parse.doc.resolveNoCache(change.endB - parse.from);
          setTimeout(() => {
              view.someProp("handleKeyDown", function (f) { return f(view, keyEvent(13, "Enter")); });
          }, 20);
      }
      let chFrom = change.start, chTo = change.endA;
      let tr, storedMarks, markChange;
      if (inlineChange) {
          if ($from.pos == $to.pos) { // Deletion
              // IE11 sometimes weirdly moves the DOM selection around after
              // backspacing out the first element in a textblock
              if (ie && ie_version <= 11 && $from.parentOffset == 0) {
                  view.domObserver.suppressSelectionUpdates();
                  setTimeout(() => selectionToDOM(view), 20);
              }
              tr = view.state.tr.delete(chFrom, chTo);
              storedMarks = doc.resolve(change.start).marksAcross(doc.resolve(change.endA));
          }
          else if ( // Adding or removing a mark
          change.endA == change.endB &&
              (markChange = isMarkChange($from.parent.content.cut($from.parentOffset, $to.parentOffset), $fromA.parent.content.cut($fromA.parentOffset, change.endA - $fromA.start())))) {
              tr = view.state.tr;
              if (markChange.type == "add")
                  tr.addMark(chFrom, chTo, markChange.mark);
              else
                  tr.removeMark(chFrom, chTo, markChange.mark);
          }
          else if ($from.parent.child($from.index()).isText && $from.index() == $to.index() - ($to.textOffset ? 0 : 1)) {
              // Both positions in the same text node -- simply insert text
              let text = $from.parent.textBetween($from.parentOffset, $to.parentOffset);
              if (view.someProp("handleTextInput", f => f(view, chFrom, chTo, text)))
                  return;
              tr = view.state.tr.insertText(text, chFrom, chTo);
          }
      }
      if (!tr)
          tr = view.state.tr.replace(chFrom, chTo, parse.doc.slice(change.start - parse.from, change.endB - parse.from));
      if (parse.sel) {
          let sel = resolveSelection(view, tr.doc, parse.sel);
          // Chrome Android will sometimes, during composition, report the
          // selection in the wrong place. If it looks like that is
          // happening, don't update the selection.
          // Edge just doesn't move the cursor forward when you start typing
          // in an empty block or between br nodes.
          if (sel && !(chrome && android && view.composing && sel.empty &&
              (change.start != change.endB || view.input.lastAndroidDelete < Date.now() - 100) &&
              (sel.head == chFrom || sel.head == tr.mapping.map(chTo) - 1) ||
              ie && sel.empty && sel.head == chFrom))
              tr.setSelection(sel);
      }
      if (storedMarks)
          tr.ensureMarks(storedMarks);
      view.dispatch(tr.scrollIntoView());
  }
  function resolveSelection(view, doc, parsedSel) {
      if (Math.max(parsedSel.anchor, parsedSel.head) > doc.content.size)
          return null;
      return selectionBetween(view, doc.resolve(parsedSel.anchor), doc.resolve(parsedSel.head));
  }
  // Given two same-length, non-empty fragments of inline content,
  // determine whether the first could be created from the second by
  // removing or adding a single mark type.
  function isMarkChange(cur, prev) {
      let curMarks = cur.firstChild.marks, prevMarks = prev.firstChild.marks;
      let added = curMarks, removed = prevMarks, type, mark, update;
      for (let i = 0; i < prevMarks.length; i++)
          added = prevMarks[i].removeFromSet(added);
      for (let i = 0; i < curMarks.length; i++)
          removed = curMarks[i].removeFromSet(removed);
      if (added.length == 1 && removed.length == 0) {
          mark = added[0];
          type = "add";
          update = (node) => node.mark(mark.addToSet(node.marks));
      }
      else if (added.length == 0 && removed.length == 1) {
          mark = removed[0];
          type = "remove";
          update = (node) => node.mark(mark.removeFromSet(node.marks));
      }
      else {
          return null;
      }
      let updated = [];
      for (let i = 0; i < prev.childCount; i++)
          updated.push(update(prev.child(i)));
      if (Fragment.from(updated).eq(cur))
          return { mark, type };
  }
  function looksLikeJoin(old, start, end, $newStart, $newEnd) {
      if (!$newStart.parent.isTextblock ||
          // The content must have shrunk
          end - start <= $newEnd.pos - $newStart.pos ||
          // newEnd must point directly at or after the end of the block that newStart points into
          skipClosingAndOpening($newStart, true, false) < $newEnd.pos)
          return false;
      let $start = old.resolve(start);
      // Start must be at the end of a block
      if ($start.parentOffset < $start.parent.content.size || !$start.parent.isTextblock)
          return false;
      let $next = old.resolve(skipClosingAndOpening($start, true, true));
      // The next textblock must start before end and end near it
      if (!$next.parent.isTextblock || $next.pos > end ||
          skipClosingAndOpening($next, true, false) < end)
          return false;
      // The fragments after the join point must match
      return $newStart.parent.content.cut($newStart.parentOffset).eq($next.parent.content);
  }
  function skipClosingAndOpening($pos, fromEnd, mayOpen) {
      let depth = $pos.depth, end = fromEnd ? $pos.end() : $pos.pos;
      while (depth > 0 && (fromEnd || $pos.indexAfter(depth) == $pos.node(depth).childCount)) {
          depth--;
          end++;
          fromEnd = false;
      }
      if (mayOpen) {
          let next = $pos.node(depth).maybeChild($pos.indexAfter(depth));
          while (next && !next.isLeaf) {
              next = next.firstChild;
              end++;
          }
      }
      return end;
  }
  function findDiff(a, b, pos, preferredPos, preferredSide) {
      let start = a.findDiffStart(b, pos);
      if (start == null)
          return null;
      let { a: endA, b: endB } = a.findDiffEnd(b, pos + a.size, pos + b.size);
      if (preferredSide == "end") {
          let adjust = Math.max(0, start - Math.min(endA, endB));
          preferredPos -= endA + adjust - start;
      }
      if (endA < start && a.size < b.size) {
          let move = preferredPos <= start && preferredPos >= endA ? start - preferredPos : 0;
          start -= move;
          endB = start + (endB - endA);
          endA = start;
      }
      else if (endB < start) {
          let move = preferredPos <= start && preferredPos >= endB ? start - preferredPos : 0;
          start -= move;
          endA = start + (endA - endB);
          endB = start;
      }
      return { start, endA, endB };
  }
  /**
  An editor view manages the DOM structure that represents an
  editable document. Its state and behavior are determined by its
  [props](https://prosemirror.net/docs/ref/#view.DirectEditorProps).
  */
  class EditorView {
      /**
      Create a view. `place` may be a DOM node that the editor should
      be appended to, a function that will place it into the document,
      or an object whose `mount` property holds the node to use as the
      document container. If it is `null`, the editor will not be
      added to the document.
      */
      constructor(place, props) {
          this._root = null;
          /**
          @internal
          */
          this.focused = false;
          /**
          Kludge used to work around a Chrome bug @internal
          */
          this.trackWrites = null;
          this.mounted = false;
          /**
          @internal
          */
          this.markCursor = null;
          /**
          @internal
          */
          this.cursorWrapper = null;
          /**
          @internal
          */
          this.lastSelectedViewDesc = undefined;
          /**
          @internal
          */
          this.input = new InputState;
          this.prevDirectPlugins = [];
          this.pluginViews = [];
          /**
          Holds `true` when a hack node is needed in Firefox to prevent the
          [space is eaten issue](https://github.com/ProseMirror/prosemirror/issues/651)
          @internal
          */
          this.requiresGeckoHackNode = false;
          /**
          When editor content is being dragged, this object contains
          information about the dragged slice and whether it is being
          copied or moved. At any other time, it is null.
          */
          this.dragging = null;
          this._props = props;
          this.state = props.state;
          this.directPlugins = props.plugins || [];
          this.directPlugins.forEach(checkStateComponent);
          this.dispatch = this.dispatch.bind(this);
          this.dom = (place && place.mount) || document.createElement("div");
          if (place) {
              if (place.appendChild)
                  place.appendChild(this.dom);
              else if (typeof place == "function")
                  place(this.dom);
              else if (place.mount)
                  this.mounted = true;
          }
          this.editable = getEditable(this);
          updateCursorWrapper(this);
          this.nodeViews = buildNodeViews(this);
          this.docView = docViewDesc(this.state.doc, computeDocDeco(this), viewDecorations(this), this.dom, this);
          this.domObserver = new DOMObserver(this, (from, to, typeOver, added) => readDOMChange(this, from, to, typeOver, added));
          this.domObserver.start();
          initInput(this);
          this.updatePluginViews();
      }
      /**
      Holds `true` when a
      [composition](https://w3c.github.io/uievents/#events-compositionevents)
      is active.
      */
      get composing() { return this.input.composing; }
      /**
      The view's current [props](https://prosemirror.net/docs/ref/#view.EditorProps).
      */
      get props() {
          if (this._props.state != this.state) {
              let prev = this._props;
              this._props = {};
              for (let name in prev)
                  this._props[name] = prev[name];
              this._props.state = this.state;
          }
          return this._props;
      }
      /**
      Update the view's props. Will immediately cause an update to
      the DOM.
      */
      update(props) {
          if (props.handleDOMEvents != this._props.handleDOMEvents)
              ensureListeners(this);
          let prevProps = this._props;
          this._props = props;
          if (props.plugins) {
              props.plugins.forEach(checkStateComponent);
              this.directPlugins = props.plugins;
          }
          this.updateStateInner(props.state, prevProps);
      }
      /**
      Update the view by updating existing props object with the object
      given as argument. Equivalent to `view.update(Object.assign({},
      view.props, props))`.
      */
      setProps(props) {
          let updated = {};
          for (let name in this._props)
              updated[name] = this._props[name];
          updated.state = this.state;
          for (let name in props)
              updated[name] = props[name];
          this.update(updated);
      }
      /**
      Update the editor's `state` prop, without touching any of the
      other props.
      */
      updateState(state) {
          this.updateStateInner(state, this._props);
      }
      updateStateInner(state, prevProps) {
          let prev = this.state, redraw = false, updateSel = false;
          // When stored marks are added, stop composition, so that they can
          // be displayed.
          if (state.storedMarks && this.composing) {
              clearComposition(this);
              updateSel = true;
          }
          this.state = state;
          let pluginsChanged = prev.plugins != state.plugins || this._props.plugins != prevProps.plugins;
          if (pluginsChanged || this._props.plugins != prevProps.plugins || this._props.nodeViews != prevProps.nodeViews) {
              let nodeViews = buildNodeViews(this);
              if (changedNodeViews(nodeViews, this.nodeViews)) {
                  this.nodeViews = nodeViews;
                  redraw = true;
              }
          }
          if (pluginsChanged || prevProps.handleDOMEvents != this._props.handleDOMEvents) {
              ensureListeners(this);
          }
          this.editable = getEditable(this);
          updateCursorWrapper(this);
          let innerDeco = viewDecorations(this), outerDeco = computeDocDeco(this);
          let scroll = prev.plugins != state.plugins && !prev.doc.eq(state.doc) ? "reset"
              : state.scrollToSelection > prev.scrollToSelection ? "to selection" : "preserve";
          let updateDoc = redraw || !this.docView.matchesNode(state.doc, outerDeco, innerDeco);
          if (updateDoc || !state.selection.eq(prev.selection))
              updateSel = true;
          let oldScrollPos = scroll == "preserve" && updateSel && this.dom.style.overflowAnchor == null && storeScrollPos(this);
          if (updateSel) {
              this.domObserver.stop();
              // Work around an issue in Chrome, IE, and Edge where changing
              // the DOM around an active selection puts it into a broken
              // state where the thing the user sees differs from the
              // selection reported by the Selection object (#710, #973,
              // #1011, #1013, #1035).
              let forceSelUpdate = updateDoc && (ie || chrome) && !this.composing &&
                  !prev.selection.empty && !state.selection.empty && selectionContextChanged(prev.selection, state.selection);
              if (updateDoc) {
                  // If the node that the selection points into is written to,
                  // Chrome sometimes starts misreporting the selection, so this
                  // tracks that and forces a selection reset when our update
                  // did write to the node.
                  let chromeKludge = chrome ? (this.trackWrites = this.domSelection().focusNode) : null;
                  if (redraw || !this.docView.update(state.doc, outerDeco, innerDeco, this)) {
                      this.docView.updateOuterDeco([]);
                      this.docView.destroy();
                      this.docView = docViewDesc(state.doc, outerDeco, innerDeco, this.dom, this);
                  }
                  if (chromeKludge && !this.trackWrites)
                      forceSelUpdate = true;
              }
              // Work around for an issue where an update arriving right between
              // a DOM selection change and the "selectionchange" event for it
              // can cause a spurious DOM selection update, disrupting mouse
              // drag selection.
              if (forceSelUpdate ||
                  !(this.input.mouseDown && this.domObserver.currentSelection.eq(this.domSelection()) && anchorInRightPlace(this))) {
                  selectionToDOM(this, forceSelUpdate);
              }
              else {
                  syncNodeSelection(this, state.selection);
                  this.domObserver.setCurSelection();
              }
              this.domObserver.start();
          }
          this.updatePluginViews(prev);
          if (scroll == "reset") {
              this.dom.scrollTop = 0;
          }
          else if (scroll == "to selection") {
              this.scrollToSelection();
          }
          else if (oldScrollPos) {
              resetScrollPos(oldScrollPos);
          }
      }
      /**
      @internal
      */
      scrollToSelection() {
          let startDOM = this.domSelection().focusNode;
          if (this.someProp("handleScrollToSelection", f => f(this))) ;
          else if (this.state.selection instanceof NodeSelection) {
              let target = this.docView.domAfterPos(this.state.selection.from);
              if (target.nodeType == 1)
                  scrollRectIntoView(this, target.getBoundingClientRect(), startDOM);
          }
          else {
              scrollRectIntoView(this, this.coordsAtPos(this.state.selection.head, 1), startDOM);
          }
      }
      destroyPluginViews() {
          let view;
          while (view = this.pluginViews.pop())
              if (view.destroy)
                  view.destroy();
      }
      updatePluginViews(prevState) {
          if (!prevState || prevState.plugins != this.state.plugins || this.directPlugins != this.prevDirectPlugins) {
              this.prevDirectPlugins = this.directPlugins;
              this.destroyPluginViews();
              for (let i = 0; i < this.directPlugins.length; i++) {
                  let plugin = this.directPlugins[i];
                  if (plugin.spec.view)
                      this.pluginViews.push(plugin.spec.view(this));
              }
              for (let i = 0; i < this.state.plugins.length; i++) {
                  let plugin = this.state.plugins[i];
                  if (plugin.spec.view)
                      this.pluginViews.push(plugin.spec.view(this));
              }
          }
          else {
              for (let i = 0; i < this.pluginViews.length; i++) {
                  let pluginView = this.pluginViews[i];
                  if (pluginView.update)
                      pluginView.update(this, prevState);
              }
          }
      }
      someProp(propName, f) {
          let prop = this._props && this._props[propName], value;
          if (prop != null && (value = f ? f(prop) : prop))
              return value;
          for (let i = 0; i < this.directPlugins.length; i++) {
              let prop = this.directPlugins[i].props[propName];
              if (prop != null && (value = f ? f(prop) : prop))
                  return value;
          }
          let plugins = this.state.plugins;
          if (plugins)
              for (let i = 0; i < plugins.length; i++) {
                  let prop = plugins[i].props[propName];
                  if (prop != null && (value = f ? f(prop) : prop))
                      return value;
              }
      }
      /**
      Query whether the view has focus.
      */
      hasFocus() {
          // Work around IE not handling focus correctly if resize handles are shown.
          // If the cursor is inside an element with resize handles, activeElement
          // will be that element instead of this.dom.
          if (ie) {
              // If activeElement is within this.dom, and there are no other elements
              // setting `contenteditable` to false in between, treat it as focused.
              let node = this.root.activeElement;
              if (node == this.dom)
                  return true;
              if (!node || !this.dom.contains(node))
                  return false;
              while (node && this.dom != node && this.dom.contains(node)) {
                  if (node.contentEditable == 'false')
                      return false;
                  node = node.parentElement;
              }
              return true;
          }
          return this.root.activeElement == this.dom;
      }
      /**
      Focus the editor.
      */
      focus() {
          this.domObserver.stop();
          if (this.editable)
              focusPreventScroll(this.dom);
          selectionToDOM(this);
          this.domObserver.start();
      }
      /**
      Get the document root in which the editor exists. This will
      usually be the top-level `document`, but might be a [shadow
      DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Shadow_DOM)
      root if the editor is inside one.
      */
      get root() {
          let cached = this._root;
          if (cached == null)
              for (let search = this.dom.parentNode; search; search = search.parentNode) {
                  if (search.nodeType == 9 || (search.nodeType == 11 && search.host)) {
                      if (!search.getSelection)
                          Object.getPrototypeOf(search).getSelection = () => search.ownerDocument.getSelection();
                      return this._root = search;
                  }
              }
          return cached || document;
      }
      /**
      Given a pair of viewport coordinates, return the document
      position that corresponds to them. May return null if the given
      coordinates aren't inside of the editor. When an object is
      returned, its `pos` property is the position nearest to the
      coordinates, and its `inside` property holds the position of the
      inner node that the position falls inside of, or -1 if it is at
      the top level, not in any node.
      */
      posAtCoords(coords) {
          return posAtCoords(this, coords);
      }
      /**
      Returns the viewport rectangle at a given document position.
      `left` and `right` will be the same number, as this returns a
      flat cursor-ish rectangle. If the position is between two things
      that aren't directly adjacent, `side` determines which element
      is used. When < 0, the element before the position is used,
      otherwise the element after.
      */
      coordsAtPos(pos, side = 1) {
          return coordsAtPos(this, pos, side);
      }
      /**
      Find the DOM position that corresponds to the given document
      position. When `side` is negative, find the position as close as
      possible to the content before the position. When positive,
      prefer positions close to the content after the position. When
      zero, prefer as shallow a position as possible.
      
      Note that you should **not** mutate the editor's internal DOM,
      only inspect it (and even that is usually not necessary).
      */
      domAtPos(pos, side = 0) {
          return this.docView.domFromPos(pos, side);
      }
      /**
      Find the DOM node that represents the document node after the
      given position. May return `null` when the position doesn't point
      in front of a node or if the node is inside an opaque node view.
      
      This is intended to be able to call things like
      `getBoundingClientRect` on that DOM node. Do **not** mutate the
      editor DOM directly, or add styling this way, since that will be
      immediately overriden by the editor as it redraws the node.
      */
      nodeDOM(pos) {
          let desc = this.docView.descAt(pos);
          return desc ? desc.nodeDOM : null;
      }
      /**
      Find the document position that corresponds to a given DOM
      position. (Whenever possible, it is preferable to inspect the
      document structure directly, rather than poking around in the
      DOM, but sometimes—for example when interpreting an event
      target—you don't have a choice.)
      
      The `bias` parameter can be used to influence which side of a DOM
      node to use when the position is inside a leaf node.
      */
      posAtDOM(node, offset, bias = -1) {
          let pos = this.docView.posFromDOM(node, offset, bias);
          if (pos == null)
              throw new RangeError("DOM position not inside the editor");
          return pos;
      }
      /**
      Find out whether the selection is at the end of a textblock when
      moving in a given direction. When, for example, given `"left"`,
      it will return true if moving left from the current cursor
      position would leave that position's parent textblock. Will apply
      to the view's current state by default, but it is possible to
      pass a different state.
      */
      endOfTextblock(dir, state) {
          return endOfTextblock(this, state || this.state, dir);
      }
      /**
      Removes the editor from the DOM and destroys all [node
      views](https://prosemirror.net/docs/ref/#view.NodeView).
      */
      destroy() {
          if (!this.docView)
              return;
          destroyInput(this);
          this.destroyPluginViews();
          if (this.mounted) {
              this.docView.update(this.state.doc, [], viewDecorations(this), this);
              this.dom.textContent = "";
          }
          else if (this.dom.parentNode) {
              this.dom.parentNode.removeChild(this.dom);
          }
          this.docView.destroy();
          this.docView = null;
      }
      /**
      This is true when the view has been
      [destroyed](https://prosemirror.net/docs/ref/#view.EditorView.destroy) (and thus should not be
      used anymore).
      */
      get isDestroyed() {
          return this.docView == null;
      }
      /**
      Used for testing.
      */
      dispatchEvent(event) {
          return dispatchEvent(this, event);
      }
      /**
      Dispatch a transaction. Will call
      [`dispatchTransaction`](https://prosemirror.net/docs/ref/#view.DirectEditorProps.dispatchTransaction)
      when given, and otherwise defaults to applying the transaction to
      the current state and calling
      [`updateState`](https://prosemirror.net/docs/ref/#view.EditorView.updateState) with the result.
      This method is bound to the view instance, so that it can be
      easily passed around.
      */
      dispatch(tr) {
          let dispatchTransaction = this._props.dispatchTransaction;
          if (dispatchTransaction)
              dispatchTransaction.call(this, tr);
          else
              this.updateState(this.state.apply(tr));
      }
      /**
      @internal
      */
      domSelection() {
          return this.root.getSelection();
      }
  }
  function computeDocDeco(view) {
      let attrs = Object.create(null);
      attrs.class = "ProseMirror";
      attrs.contenteditable = String(view.editable);
      attrs.translate = "no";
      view.someProp("attributes", value => {
          if (typeof value == "function")
              value = value(view.state);
          if (value)
              for (let attr in value) {
                  if (attr == "class")
                      attrs.class += " " + value[attr];
                  if (attr == "style") {
                      attrs.style = (attrs.style ? attrs.style + ";" : "") + value[attr];
                  }
                  else if (!attrs[attr] && attr != "contenteditable" && attr != "nodeName")
                      attrs[attr] = String(value[attr]);
              }
      });
      return [Decoration.node(0, view.state.doc.content.size, attrs)];
  }
  function updateCursorWrapper(view) {
      if (view.markCursor) {
          let dom = document.createElement("img");
          dom.className = "ProseMirror-separator";
          dom.setAttribute("mark-placeholder", "true");
          dom.setAttribute("alt", "");
          view.cursorWrapper = { dom, deco: Decoration.widget(view.state.selection.head, dom, { raw: true, marks: view.markCursor }) };
      }
      else {
          view.cursorWrapper = null;
      }
  }
  function getEditable(view) {
      return !view.someProp("editable", value => value(view.state) === false);
  }
  function selectionContextChanged(sel1, sel2) {
      let depth = Math.min(sel1.$anchor.sharedDepth(sel1.head), sel2.$anchor.sharedDepth(sel2.head));
      return sel1.$anchor.start(depth) != sel2.$anchor.start(depth);
  }
  function buildNodeViews(view) {
      let result = Object.create(null);
      function add(obj) {
          for (let prop in obj)
              if (!Object.prototype.hasOwnProperty.call(result, prop))
                  result[prop] = obj[prop];
      }
      view.someProp("nodeViews", add);
      view.someProp("markViews", add);
      return result;
  }
  function changedNodeViews(a, b) {
      let nA = 0, nB = 0;
      for (let prop in a) {
          if (a[prop] != b[prop])
              return true;
          nA++;
      }
      for (let _ in b)
          nB++;
      return nA != nB;
  }
  function checkStateComponent(plugin) {
      if (plugin.spec.state || plugin.spec.filterTransaction || plugin.spec.appendTransaction)
          throw new RangeError("Plugins passed directly to the view must not have a state component");
  }

  /**
   * Mutual exclude for JavaScript.
   *
   * @module mutex
   */

  /**
   * @callback mutex
   * @param {function():void} cb Only executed when this mutex is not in the current stack
   * @param {function():void} [elseCb] Executed when this mutex is in the current stack
   */

  /**
   * Creates a mutual exclude function with the following property:
   *
   * ```js
   * const mutex = createMutex()
   * mutex(() => {
   *   // This function is immediately executed
   *   mutex(() => {
   *     // This function is not executed, as the mutex is already active.
   *   })
   * })
   * ```
   *
   * @return {mutex} A mutual exclude function
   * @public
   */
  const createMutex = () => {
    let token = true;
    return (f, g) => {
      if (token) {
        token = false;
        try {
          f();
        } finally {
          token = true;
        }
      } else if (g !== undefined) {
        g();
      }
    }
  };

  /**
   * The unique prosemirror plugin key for syncPlugin
   *
   * @public
   */
  const ySyncPluginKey = new PluginKey('y-sync');

  /**
   * The unique prosemirror plugin key for undoPlugin
   *
   * @public
   */
  const yUndoPluginKey = new PluginKey('y-undo');

  /**
   * The unique prosemirror plugin key for cursorPlugin
   *
   * @public
   */
  new PluginKey('yjs-cursor');

  /**
   * @module bindings/prosemirror
   */

  const MarkPrefix = '_mark_';

  /**
   * @param {Y.Item} item
   * @param {Y.Snapshot} [snapshot]
   */
  const isVisible = (item, snapshot) =>
    snapshot === undefined
      ? !item.deleted
      : (snapshot.sv.has(item.id.client) && /** @type {number} */
        (snapshot.sv.get(item.id.client)) > item.id.clock &&
        !isDeleted(snapshot.ds, item.id));

  /**
   * Either a node if type is YXmlElement or an Array of text nodes if YXmlText
   * @typedef {Map<Y.AbstractType<any>, PModel.Node | Array<PModel.Node>>} ProsemirrorMapping
   */

  /**
   * @typedef {Object} ColorDef
   * @property {string} ColorDef.light
   * @property {string} ColorDef.dark
   */

  /**
   * @typedef {Object} YSyncOpts
   * @property {Array<ColorDef>} [YSyncOpts.colors]
   * @property {Map<string,ColorDef>} [YSyncOpts.colorMapping]
   * @property {Y.PermanentUserData|null} [YSyncOpts.permanentUserData]
   * @property {function} [YSyncOpts.onFirstRender] Fired when the content from Yjs is initially rendered to ProseMirror
   */

  /**
   * @type {Array<ColorDef>}
   */
  const defaultColors = [{ light: '#ecd44433', dark: '#ecd444' }];

  /**
   * @param {Map<string,ColorDef>} colorMapping
   * @param {Array<ColorDef>} colors
   * @param {string} user
   * @return {ColorDef}
   */
  const getUserColor = (colorMapping, colors, user) => {
    // @todo do not hit the same color twice if possible
    if (!colorMapping.has(user)) {
      if (colorMapping.size < colors.length) {
        const usedColors = create$1();
        colorMapping.forEach((color) => usedColors.add(color));
        colors = colors.filter((color) => !usedColors.has(color));
      }
      colorMapping.set(user, oneOf$1(colors));
    }
    return /** @type {ColorDef} */ (colorMapping.get(user))
  };

  /**
   * This plugin listens to changes in prosemirror view and keeps yXmlState and view in sync.
   *
   * This plugin also keeps references to the type and the shared document so other plugins can access it.
   * @param {Y.XmlFragment} yXmlFragment
   * @param {YSyncOpts} opts
   * @return {any} Returns a prosemirror plugin that binds to this type
   */
  const ySyncPlugin = (yXmlFragment, {
    colors = defaultColors,
    colorMapping = new Map(),
    permanentUserData = null,
    onFirstRender = () => {}
  } = {}) => {
    let changedInitialContent = false;
    let rerenderTimeout;
    const plugin = new Plugin({
      props: {
        editable: (state) => {
          const syncState = ySyncPluginKey.getState(state);
          return syncState.snapshot == null && syncState.prevSnapshot == null
        }
      },
      key: ySyncPluginKey,
      state: {
        /**
         * @returns {any}
         */
        init: (_initargs, _state) => {
          return {
            type: yXmlFragment,
            doc: yXmlFragment.doc,
            binding: null,
            snapshot: null,
            prevSnapshot: null,
            isChangeOrigin: false,
            isUndoRedoOperation: false,
            addToHistory: true,
            colors,
            colorMapping,
            permanentUserData
          }
        },
        apply: (tr, pluginState) => {
          const change = tr.getMeta(ySyncPluginKey);
          if (change !== undefined) {
            pluginState = Object.assign({}, pluginState);
            for (const key in change) {
              pluginState[key] = change[key];
            }
          }
          pluginState.addToHistory = tr.getMeta('addToHistory') !== false;
          // always set isChangeOrigin. If undefined, this is not change origin.
          pluginState.isChangeOrigin = change !== undefined &&
            !!change.isChangeOrigin;
          pluginState.isUndoRedoOperation = change !== undefined && !!change.isChangeOrigin && !!change.isUndoRedoOperation;
          if (pluginState.binding !== null) {
            if (
              change !== undefined &&
              (change.snapshot != null || change.prevSnapshot != null)
            ) {
              // snapshot changed, rerender next
              timeout(0, () => {
                if (
                  pluginState.binding == null || pluginState.binding.isDestroyed
                ) {
                  return
                }
                if (change.restore == null) {
                  pluginState.binding._renderSnapshot(
                    change.snapshot,
                    change.prevSnapshot,
                    pluginState
                  );
                } else {
                  pluginState.binding._renderSnapshot(
                    change.snapshot,
                    change.snapshot,
                    pluginState
                  );
                  // reset to current prosemirror state
                  delete pluginState.restore;
                  delete pluginState.snapshot;
                  delete pluginState.prevSnapshot;
                  pluginState.binding.mux(() => {
                    pluginState.binding._prosemirrorChanged(
                      pluginState.binding.prosemirrorView.state.doc
                    );
                  });
                }
              });
            }
          }
          return pluginState
        }
      },
      view: (view) => {
        const binding = new ProsemirrorBinding(yXmlFragment, view);
        if (rerenderTimeout != null) {
          rerenderTimeout.destroy();
        }
        // Make sure this is called in a separate context
        rerenderTimeout = timeout(0, () => {
          binding._forceRerender();
          view.dispatch(view.state.tr.setMeta(ySyncPluginKey, { binding }));
          onFirstRender();
        });
        return {
          update: () => {
            const pluginState = plugin.getState(view.state);
            if (
              pluginState.snapshot == null && pluginState.prevSnapshot == null
            ) {
              if (
                changedInitialContent ||
                view.state.doc.content.findDiffStart(
                  view.state.doc.type.createAndFill().content
                ) !== null
              ) {
                changedInitialContent = true;
                if (
                  pluginState.addToHistory === false &&
                  !pluginState.isChangeOrigin
                ) {
                  const yUndoPluginState = yUndoPluginKey.getState(view.state);
                  /**
                   * @type {Y.UndoManager}
                   */
                  const um = yUndoPluginState && yUndoPluginState.undoManager;
                  if (um) {
                    um.stopCapturing();
                  }
                }
                binding.mux(() => {
                  /** @type {Y.Doc} */ (pluginState.doc).transact((tr) => {
                    tr.meta.set('addToHistory', pluginState.addToHistory);
                    binding._prosemirrorChanged(view.state.doc);
                  }, ySyncPluginKey);
                });
              }
            }
          },
          destroy: () => {
            rerenderTimeout.destroy();
            binding.destroy();
          }
        }
      }
    });
    return plugin
  };

  /**
   * @param {any} tr
   * @param {any} relSel
   * @param {ProsemirrorBinding} binding
   */
  const restoreRelativeSelection = (tr, relSel, binding) => {
    if (relSel !== null && relSel.anchor !== null && relSel.head !== null) {
      const anchor = relativePositionToAbsolutePosition(
        binding.doc,
        binding.type,
        relSel.anchor,
        binding.mapping
      );
      const head = relativePositionToAbsolutePosition(
        binding.doc,
        binding.type,
        relSel.head,
        binding.mapping
      );
      if (anchor !== null && head !== null) {
        tr = tr.setSelection(TextSelection.create(tr.doc, anchor, head));
      }
    }
  };

  const getRelativeSelection = (pmbinding, state) => ({
    anchor: absolutePositionToRelativePosition(
      state.selection.anchor,
      pmbinding.type,
      pmbinding.mapping
    ),
    head: absolutePositionToRelativePosition(
      state.selection.head,
      pmbinding.type,
      pmbinding.mapping
    )
  });

  /**
   * Binding for prosemirror.
   *
   * @protected
   */
  class ProsemirrorBinding {
    /**
     * @param {Y.XmlFragment} yXmlFragment The bind source
     * @param {any} prosemirrorView The target binding
     */
    constructor (yXmlFragment, prosemirrorView) {
      this.type = yXmlFragment;
      this.prosemirrorView = prosemirrorView;
      this.mux = createMutex();
      this.isDestroyed = false;
      /**
       * @type {ProsemirrorMapping}
       */
      this.mapping = new Map();
      this._observeFunction = this._typeChanged.bind(this);
      /**
       * @type {Y.Doc}
       */
      // @ts-ignore
      this.doc = yXmlFragment.doc;
      /**
       * current selection as relative positions in the Yjs model
       */
      this.beforeTransactionSelection = null;
      this.beforeAllTransactions = () => {
        if (this.beforeTransactionSelection === null) {
          this.beforeTransactionSelection = getRelativeSelection(
            this,
            prosemirrorView.state
          );
        }
      };
      this.afterAllTransactions = () => {
        this.beforeTransactionSelection = null;
      };

      this.doc.on('beforeAllTransactions', this.beforeAllTransactions);
      this.doc.on('afterAllTransactions', this.afterAllTransactions);
      yXmlFragment.observeDeep(this._observeFunction);

      this._domSelectionInView = null;
    }

    /**
     * Create a transaction for changing the prosemirror state.
     *
     * @returns
     */
    get _tr () {
      return this.prosemirrorView.state.tr.setMeta('addToHistory', false)
    }

    _isLocalCursorInView () {
      if (!this.prosemirrorView.hasFocus()) return false
      if (isBrowser && this._domSelectionInView === null) {
        // Calculate the domSelectionInView and clear by next tick after all events are finished
        timeout(0, () => {
          this._domSelectionInView = null;
        });
        this._domSelectionInView = this._isDomSelectionInView();
      }
      return this._domSelectionInView
    }

    _isDomSelectionInView () {
      const selection = this.prosemirrorView._root.getSelection();

      const range = this.prosemirrorView._root.createRange();
      range.setStart(selection.anchorNode, selection.anchorOffset);
      range.setEnd(selection.focusNode, selection.focusOffset);

      // This is a workaround for an edgecase where getBoundingClientRect will
      // return zero values if the selection is collapsed at the start of a newline
      // see reference here: https://stackoverflow.com/a/59780954
      const rects = range.getClientRects();
      if (rects.length === 0) {
        // probably buggy newline behavior, explicitly select the node contents
        if (range.startContainer && range.collapsed) {
          range.selectNodeContents(range.startContainer);
        }
      }

      const bounding = range.getBoundingClientRect();
      const documentElement = doc$2.documentElement;

      return bounding.bottom >= 0 && bounding.right >= 0 &&
        bounding.left <=
          (window.innerWidth || documentElement.clientWidth || 0) &&
        bounding.top <= (window.innerHeight || documentElement.clientHeight || 0)
    }

    /**
     * @param {Y.Snapshot} snapshot
     * @param {Y.Snapshot} prevSnapshot
     */
    renderSnapshot (snapshot, prevSnapshot) {
      if (!prevSnapshot) {
        prevSnapshot = createSnapshot(createDeleteSet(), new Map());
      }
      this.prosemirrorView.dispatch(
        this._tr.setMeta(ySyncPluginKey, { snapshot, prevSnapshot })
      );
    }

    unrenderSnapshot () {
      this.mapping = new Map();
      this.mux(() => {
        const fragmentContent = this.type.toArray().map((t) =>
          createNodeFromYElement(
            /** @type {Y.XmlElement} */ (t),
            this.prosemirrorView.state.schema,
            this.mapping
          )
        ).filter((n) => n !== null);
        // @ts-ignore
        const tr = this._tr.replace(
          0,
          this.prosemirrorView.state.doc.content.size,
          new Slice(Fragment.from(fragmentContent), 0, 0)
        );
        tr.setMeta(ySyncPluginKey, { snapshot: null, prevSnapshot: null });
        this.prosemirrorView.dispatch(tr);
      });
    }

    _forceRerender () {
      this.mapping = new Map();
      this.mux(() => {
        const fragmentContent = this.type.toArray().map((t) =>
          createNodeFromYElement(
            /** @type {Y.XmlElement} */ (t),
            this.prosemirrorView.state.schema,
            this.mapping
          )
        ).filter((n) => n !== null);
        // @ts-ignore
        const tr = this._tr.replace(
          0,
          this.prosemirrorView.state.doc.content.size,
          new Slice(Fragment.from(fragmentContent), 0, 0)
        );
        this.prosemirrorView.dispatch(
          tr.setMeta(ySyncPluginKey, { isChangeOrigin: true })
        );
      });
    }

    /**
     * @param {Y.Snapshot} snapshot
     * @param {Y.Snapshot} prevSnapshot
     * @param {Object} pluginState
     */
    _renderSnapshot (snapshot$1, prevSnapshot, pluginState) {
      if (!snapshot$1) {
        snapshot$1 = snapshot(this.doc);
      }
      // clear mapping because we are going to rerender
      this.mapping = new Map();
      this.mux(() => {
        this.doc.transact((transaction) => {
          // before rendering, we are going to sanitize ops and split deleted ops
          // if they were deleted by seperate users.
          const pud = pluginState.permanentUserData;
          if (pud) {
            pud.dss.forEach((ds) => {
              iterateDeletedStructs(transaction, ds, (_item) => {});
            });
          }
          /**
           * @param {'removed'|'added'} type
           * @param {Y.ID} id
           */
          const computeYChange = (type, id) => {
            const user = type === 'added'
              ? pud.getUserByClientId(id.client)
              : pud.getUserByDeletedId(id);
            return {
              user,
              type,
              color: getUserColor(
                pluginState.colorMapping,
                pluginState.colors,
                user
              )
            }
          };
          // Create document fragment and render
          const fragmentContent = typeListToArraySnapshot(
            this.type,
            new Snapshot(prevSnapshot.ds, snapshot$1.sv)
          ).map((t) => {
            if (
              !t._item.deleted || isVisible(t._item, snapshot$1) ||
              isVisible(t._item, prevSnapshot)
            ) {
              return createNodeFromYElement(
                t,
                this.prosemirrorView.state.schema,
                new Map(),
                snapshot$1,
                prevSnapshot,
                computeYChange
              )
            } else {
              // No need to render elements that are not visible by either snapshot.
              // If a client adds and deletes content in the same snapshot the element is not visible by either snapshot.
              return null
            }
          }).filter((n) => n !== null);
          // @ts-ignore
          const tr = this._tr.replace(
            0,
            this.prosemirrorView.state.doc.content.size,
            new Slice(Fragment.from(fragmentContent), 0, 0)
          );
          this.prosemirrorView.dispatch(
            tr.setMeta(ySyncPluginKey, { isChangeOrigin: true })
          );
        }, ySyncPluginKey);
      });
    }

    /**
     * @param {Array<Y.YEvent<any>>} events
     * @param {Y.Transaction} transaction
     */
    _typeChanged (events, transaction) {
      const syncState = ySyncPluginKey.getState(this.prosemirrorView.state);
      if (
        events.length === 0 || syncState.snapshot != null ||
        syncState.prevSnapshot != null
      ) {
        // drop out if snapshot is active
        this.renderSnapshot(syncState.snapshot, syncState.prevSnapshot);
        return
      }
      this.mux(() => {
        /**
         * @param {any} _
         * @param {Y.AbstractType<any>} type
         */
        const delType = (_, type) => this.mapping.delete(type);
        iterateDeletedStructs(
          transaction,
          transaction.deleteSet,
          (struct) => {
            if (struct.constructor === Item) {
              const type = /** @type {Y.ContentType} */ (/** @type {Y.Item} */ (struct).content).type;
              type && this.mapping.delete(type);
            }
          }
        );
        transaction.changed.forEach(delType);
        transaction.changedParentTypes.forEach(delType);
        const fragmentContent = this.type.toArray().map((t) =>
          createNodeIfNotExists(
            /** @type {Y.XmlElement | Y.XmlHook} */ (t),
            this.prosemirrorView.state.schema,
            this.mapping
          )
        ).filter((n) => n !== null);
        // @ts-ignore
        let tr = this._tr.replace(
          0,
          this.prosemirrorView.state.doc.content.size,
          new Slice(Fragment.from(fragmentContent), 0, 0)
        );
        restoreRelativeSelection(tr, this.beforeTransactionSelection, this);
        tr = tr.setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: transaction.origin instanceof UndoManager });
        if (
          this.beforeTransactionSelection !== null && this._isLocalCursorInView()
        ) {
          tr.scrollIntoView();
        }
        this.prosemirrorView.dispatch(tr);
      });
    }

    _prosemirrorChanged (doc) {
      this.doc.transact(() => {
        updateYFragment(this.doc, this.type, doc, this.mapping);
        this.beforeTransactionSelection = getRelativeSelection(
          this,
          this.prosemirrorView.state
        );
      }, ySyncPluginKey);
    }

    destroy () {
      this.isDestroyed = true;
      this.type.unobserveDeep(this._observeFunction);
      this.doc.off('beforeAllTransactions', this.beforeAllTransactions);
      this.doc.off('afterAllTransactions', this.afterAllTransactions);
    }
  }

  /**
   * @private
   * @param {Y.XmlElement | Y.XmlHook} el
   * @param {PModel.Schema} schema
   * @param {ProsemirrorMapping} mapping
   * @param {Y.Snapshot} [snapshot]
   * @param {Y.Snapshot} [prevSnapshot]
   * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
   * @return {PModel.Node | null}
   */
  const createNodeIfNotExists = (
    el,
    schema,
    mapping,
    snapshot,
    prevSnapshot,
    computeYChange
  ) => {
    const node = /** @type {PModel.Node} */ (mapping.get(el));
    if (node === undefined) {
      if (el instanceof YXmlElement) {
        return createNodeFromYElement(
          el,
          schema,
          mapping,
          snapshot,
          prevSnapshot,
          computeYChange
        )
      } else {
        throw methodUnimplemented() // we are currently not handling hooks
      }
    }
    return node
  };

  /**
   * @private
   * @param {Y.XmlElement} el
   * @param {any} schema
   * @param {ProsemirrorMapping} mapping
   * @param {Y.Snapshot} [snapshot]
   * @param {Y.Snapshot} [prevSnapshot]
   * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
   * @return {PModel.Node | null} Returns node if node could be created. Otherwise it deletes the yjs type and returns null
   */
  const createNodeFromYElement = (
    el,
    schema,
    mapping,
    snapshot,
    prevSnapshot,
    computeYChange
  ) => {
    const children = [];
    const createChildren = (type) => {
      if (type.constructor === YXmlElement) {
        const n = createNodeIfNotExists(
          type,
          schema,
          mapping,
          snapshot,
          prevSnapshot,
          computeYChange
        );
        if (n !== null) {
          children.push(n);
        }
      } else {
        const ns = createTextNodesFromYText(
          type,
          schema,
          mapping,
          snapshot,
          prevSnapshot,
          computeYChange
        );
        if (ns !== null) {
          ns.forEach((textchild) => {
            if (textchild !== null) {
              children.push(textchild);
            }
          });
        }
      }
    };
    if (snapshot === undefined || prevSnapshot === undefined) {
      el.toArray().forEach(createChildren);
    } else {
      typeListToArraySnapshot(el, new Snapshot(prevSnapshot.ds, snapshot.sv))
        .forEach(createChildren);
    }
    try {
      const attrs = el.getAttributes(snapshot);
      if (snapshot !== undefined) {
        if (!isVisible(/** @type {Y.Item} */ (el._item), snapshot)) {
          attrs.ychange = computeYChange
            ? computeYChange('removed', /** @type {Y.Item} */ (el._item).id)
            : { type: 'removed' };
        } else if (!isVisible(/** @type {Y.Item} */ (el._item), prevSnapshot)) {
          attrs.ychange = computeYChange
            ? computeYChange('added', /** @type {Y.Item} */ (el._item).id)
            : { type: 'added' };
        }
      }
      const nodeAttrs = {};
      const nodeMarks = [];

      for (const key in attrs) {
        if (key.startsWith(MarkPrefix)) {
          const markName = key.replace(MarkPrefix, '');
          const markValue = attrs[key];
          nodeMarks.push(schema.mark(markName, markValue.attrs));
        } else {
          nodeAttrs[key] = attrs[key];
        }
      }
      const node = schema.node(el.nodeName, nodeAttrs, children, nodeMarks);
      mapping.set(el, node);
      return node
    } catch (e) {
      // an error occured while creating the node. This is probably a result of a concurrent action.
      /** @type {Y.Doc} */ (el.doc).transact((transaction) => {
        /** @type {Y.Item} */ (el._item).delete(transaction);
      }, ySyncPluginKey);
      mapping.delete(el);
      return null
    }
  };

  /**
   * @private
   * @param {Y.XmlText} text
   * @param {any} schema
   * @param {ProsemirrorMapping} _mapping
   * @param {Y.Snapshot} [snapshot]
   * @param {Y.Snapshot} [prevSnapshot]
   * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
   * @return {Array<PModel.Node>|null}
   */
  const createTextNodesFromYText = (
    text,
    schema,
    _mapping,
    snapshot,
    prevSnapshot,
    computeYChange
  ) => {
    const nodes = [];
    const deltas = text.toDelta(snapshot, prevSnapshot, computeYChange);
    try {
      for (let i = 0; i < deltas.length; i++) {
        const delta = deltas[i];
        const marks = [];
        for (const markName in delta.attributes) {
          marks.push(schema.mark(markName, delta.attributes[markName]));
        }
        nodes.push(schema.text(delta.insert, marks));
      }
    } catch (e) {
      // an error occured while creating the node. This is probably a result of a concurrent action.
      /** @type {Y.Doc} */ (text.doc).transact((transaction) => {
        /** @type {Y.Item} */ (text._item).delete(transaction);
      }, ySyncPluginKey);
      return null
    }
    // @ts-ignore
    return nodes
  };

  /**
   * @private
   * @param {Array<any>} nodes prosemirror node
   * @param {ProsemirrorMapping} mapping
   * @return {Y.XmlText}
   */
  const createTypeFromTextNodes = (nodes, mapping) => {
    const type = new YXmlText();
    const delta = nodes.map((node) => ({
      // @ts-ignore
      insert: node.text,
      attributes: marksToAttributes(node.marks)
    }));
    type.applyDelta(delta);
    mapping.set(type, nodes);
    return type
  };

  /**
   * @private
   * @param {any} node prosemirror node
   * @param {ProsemirrorMapping} mapping
   * @return {Y.XmlElement}
   */
  const createTypeFromElementNode = (node, mapping) => {
    const type = new YXmlElement(node.type.name);
    const nodeMarksAttr = nodeMarksToAttributes(node.marks);
    for (const key in node.attrs) {
      const val = node.attrs[key];
      if (val !== null && key !== 'ychange') {
        type.setAttribute(key, val);
      }
    }
    for (const key in nodeMarksAttr) {
      type.setAttribute(key, nodeMarksAttr[key]);
    }
    type.insert(
      0,
      normalizePNodeContent(node).map((n) =>
        createTypeFromTextOrElementNode(n, mapping)
      )
    );
    mapping.set(type, node);
    return type
  };

  /**
   * @private
   * @param {PModel.Node|Array<PModel.Node>} node prosemirror text node
   * @param {ProsemirrorMapping} mapping
   * @return {Y.XmlElement|Y.XmlText}
   */
  const createTypeFromTextOrElementNode = (node, mapping) =>
    node instanceof Array
      ? createTypeFromTextNodes(node, mapping)
      : createTypeFromElementNode(node, mapping);

  const isObject = (val) => typeof val === 'object' && val !== null;

  const equalAttrs = (pattrs, yattrs) => {
    const keys = Object.keys(pattrs).filter((key) => pattrs[key] !== null);
    let eq =
      keys.length ===
        Object.keys(yattrs).filter((key) => yattrs[key] !== null && !key.startsWith(MarkPrefix)).length;
    for (let i = 0; i < keys.length && eq; i++) {
      const key = keys[i];
      const l = pattrs[key];
      const r = yattrs[key];
      eq = key === 'ychange' || l === r ||
        (isObject(l) && isObject(r) && equalAttrs(l, r));
    }
    return eq
  };

  const equalMarks = (pmarks, yattrs) => {
    const keys = Object.keys(yattrs).filter((key) => key.startsWith(MarkPrefix));
    let eq =
      keys.length === pmarks.length;
    const pMarkAttr = nodeMarksToAttributes(pmarks);
    for (let i = 0; i < keys.length && eq; i++) {
      const key = keys[i];
      const l = pMarkAttr[key];
      const r = yattrs[key];
      eq = key === 'ychange' || equalityDeep(l, r);
    }
    return eq
  };

  /**
   * @typedef {Array<Array<PModel.Node>|PModel.Node>} NormalizedPNodeContent
   */

  /**
   * @param {any} pnode
   * @return {NormalizedPNodeContent}
   */
  const normalizePNodeContent = (pnode) => {
    const c = pnode.content.content;
    const res = [];
    for (let i = 0; i < c.length; i++) {
      const n = c[i];
      if (n.isText) {
        const textNodes = [];
        for (let tnode = c[i]; i < c.length && tnode.isText; tnode = c[++i]) {
          textNodes.push(tnode);
        }
        i--;
        res.push(textNodes);
      } else {
        res.push(n);
      }
    }
    return res
  };

  /**
   * @param {Y.XmlText} ytext
   * @param {Array<any>} ptexts
   */
  const equalYTextPText = (ytext, ptexts) => {
    const delta = ytext.toDelta();
    return delta.length === ptexts.length &&
      delta.every((d, i) =>
        d.insert === /** @type {any} */ (ptexts[i]).text &&
        keys$1(d.attributes || {}).length === ptexts[i].marks.length &&
        ptexts[i].marks.every((mark) =>
          equalAttrs(d.attributes[mark.type.name] || {}, mark.attrs)
        )
      )
  };

  /**
   * @param {Y.XmlElement|Y.XmlText|Y.XmlHook} ytype
   * @param {any|Array<any>} pnode
   */
  const equalYTypePNode = (ytype, pnode) => {
    if (
      ytype instanceof YXmlElement && !(pnode instanceof Array) &&
      matchNodeName(ytype, pnode)
    ) {
      const normalizedContent = normalizePNodeContent(pnode);
      return ytype._length === normalizedContent.length &&
        equalAttrs(pnode.attrs, ytype.getAttributes()) &&
        equalMarks(pnode.marks, ytype.getAttributes()) &&
        ytype.toArray().every((ychild, i) =>
          equalYTypePNode(ychild, normalizedContent[i])
        )
    }
    return ytype instanceof YXmlText && pnode instanceof Array &&
      equalYTextPText(ytype, pnode)
  };

  /**
   * @param {PModel.Node | Array<PModel.Node> | undefined} mapped
   * @param {PModel.Node | Array<PModel.Node>} pcontent
   */
  const mappedIdentity = (mapped, pcontent) =>
    mapped === pcontent ||
    (mapped instanceof Array && pcontent instanceof Array &&
      mapped.length === pcontent.length && mapped.every((a, i) =>
      pcontent[i] === a
    ));

  /**
   * @param {Y.XmlElement} ytype
   * @param {PModel.Node} pnode
   * @param {ProsemirrorMapping} mapping
   * @return {{ foundMappedChild: boolean, equalityFactor: number }}
   */
  const computeChildEqualityFactor = (ytype, pnode, mapping) => {
    const yChildren = ytype.toArray();
    const pChildren = normalizePNodeContent(pnode);
    const pChildCnt = pChildren.length;
    const yChildCnt = yChildren.length;
    const minCnt = min(yChildCnt, pChildCnt);
    let left = 0;
    let right = 0;
    let foundMappedChild = false;
    for (; left < minCnt; left++) {
      const leftY = yChildren[left];
      const leftP = pChildren[left];
      if (mappedIdentity(mapping.get(leftY), leftP)) {
        foundMappedChild = true; // definite (good) match!
      } else if (!equalYTypePNode(leftY, leftP)) {
        break
      }
    }
    for (; left + right < minCnt; right++) {
      const rightY = yChildren[yChildCnt - right - 1];
      const rightP = pChildren[pChildCnt - right - 1];
      if (mappedIdentity(mapping.get(rightY), rightP)) {
        foundMappedChild = true;
      } else if (!equalYTypePNode(rightY, rightP)) {
        break
      }
    }
    return {
      equalityFactor: left + right,
      foundMappedChild
    }
  };

  const ytextTrans = (ytext) => {
    let str = '';
    /**
     * @type {Y.Item|null}
     */
    let n = ytext._start;
    const nAttrs = {};
    while (n !== null) {
      if (!n.deleted) {
        if (n.countable && n.content instanceof ContentString) {
          str += n.content.str;
        } else if (n.content instanceof ContentFormat) {
          nAttrs[n.content.key] = null;
        }
      }
      n = n.right;
    }
    return {
      str,
      nAttrs
    }
  };

  /**
   * @todo test this more
   *
   * @param {Y.Text} ytext
   * @param {Array<any>} ptexts
   * @param {ProsemirrorMapping} mapping
   */
  const updateYText = (ytext, ptexts, mapping) => {
    mapping.set(ytext, ptexts);
    const { nAttrs, str } = ytextTrans(ytext);
    const content = ptexts.map((p) => ({
      insert: /** @type {any} */ (p).text,
      attributes: Object.assign({}, nAttrs, marksToAttributes(p.marks))
    }));
    const { insert, remove, index } = simpleDiff(
      str,
      content.map((c) => c.insert).join('')
    );
    ytext.delete(index, remove);
    ytext.insert(index, insert);
    ytext.applyDelta(
      content.map((c) => ({ retain: c.insert.length, attributes: c.attributes }))
    );
  };

  const marksToAttributes = (marks) => {
    const pattrs = {};
    marks.forEach((mark) => {
      if (mark.type.name !== 'ychange') {
        pattrs[mark.type.name] = mark.attrs;
      }
    });
    return pattrs
  };

  const nodeMarksToAttributes = (marks) => {
    const pattrs = {};
    marks.forEach((mark) => {
      if (mark.type.name !== 'ychange') {
        pattrs[`${MarkPrefix}${mark.type.name}`] = mark.toJSON();
      }
    });
    return pattrs
  };

  /**
   * @private
   * @param {{transact: Function}} y
   * @param {Y.XmlFragment} yDomFragment
   * @param {any} pNode
   * @param {ProsemirrorMapping} mapping
   */
  const updateYFragment = (y, yDomFragment, pNode, mapping) => {
    if (
      yDomFragment instanceof YXmlElement &&
      yDomFragment.nodeName !== pNode.type.name
    ) {
      throw new Error('node name mismatch!')
    }
    mapping.set(yDomFragment, pNode);
    // update attributes
    if (yDomFragment instanceof YXmlElement) {
      const yDomAttrs = yDomFragment.getAttributes();
      const pAttrs = pNode.attrs;
      const pNodeMarksAttr = nodeMarksToAttributes(pNode.marks);
      const attrs = { ...pAttrs, ...pNodeMarksAttr };

      for (const key in attrs) {
        if (attrs[key] !== null) {
          if (yDomAttrs[key] !== attrs[key] && key !== 'ychange') {
            yDomFragment.setAttribute(key, attrs[key]);
          }
        } else {
          yDomFragment.removeAttribute(key);
        }
      }
      // remove all keys that are no longer in pAttrs
      for (const key in yDomAttrs) {
        if (attrs[key] === undefined) {
          yDomFragment.removeAttribute(key);
        }
      }
    }
    // update children
    const pChildren = normalizePNodeContent(pNode);
    const pChildCnt = pChildren.length;
    const yChildren = yDomFragment.toArray();
    const yChildCnt = yChildren.length;
    const minCnt = min(pChildCnt, yChildCnt);
    let left = 0;
    let right = 0;
    // find number of matching elements from left
    for (; left < minCnt; left++) {
      const leftY = yChildren[left];
      const leftP = pChildren[left];
      if (!mappedIdentity(mapping.get(leftY), leftP)) {
        if (equalYTypePNode(leftY, leftP)) {
          // update mapping
          mapping.set(leftY, leftP);
        } else {
          break
        }
      }
    }
    // find number of matching elements from right
    for (; right + left + 1 < minCnt; right++) {
      const rightY = yChildren[yChildCnt - right - 1];
      const rightP = pChildren[pChildCnt - right - 1];
      if (!mappedIdentity(mapping.get(rightY), rightP)) {
        if (equalYTypePNode(rightY, rightP)) {
          // update mapping
          mapping.set(rightY, rightP);
        } else {
          break
        }
      }
    }
    y.transact(() => {
      // try to compare and update
      while (yChildCnt - left - right > 0 && pChildCnt - left - right > 0) {
        const leftY = yChildren[left];
        const leftP = pChildren[left];
        const rightY = yChildren[yChildCnt - right - 1];
        const rightP = pChildren[pChildCnt - right - 1];
        if (leftY instanceof YXmlText && leftP instanceof Array) {
          if (!equalYTextPText(leftY, leftP)) {
            updateYText(leftY, leftP, mapping);
          }
          left += 1;
        } else {
          let updateLeft = leftY instanceof YXmlElement &&
            matchNodeName(leftY, leftP);
          let updateRight = rightY instanceof YXmlElement &&
            matchNodeName(rightY, rightP);
          if (updateLeft && updateRight) {
            // decide which which element to update
            const equalityLeft = computeChildEqualityFactor(
              /** @type {Y.XmlElement} */ (leftY),
              /** @type {PModel.Node} */ (leftP),
              mapping
            );
            const equalityRight = computeChildEqualityFactor(
              /** @type {Y.XmlElement} */ (rightY),
              /** @type {PModel.Node} */ (rightP),
              mapping
            );
            if (
              equalityLeft.foundMappedChild && !equalityRight.foundMappedChild
            ) {
              updateRight = false;
            } else if (
              !equalityLeft.foundMappedChild && equalityRight.foundMappedChild
            ) {
              updateLeft = false;
            } else if (
              equalityLeft.equalityFactor < equalityRight.equalityFactor
            ) {
              updateLeft = false;
            } else {
              updateRight = false;
            }
          }
          if (updateLeft) {
            updateYFragment(
              y,
              /** @type {Y.XmlFragment} */ (leftY),
              /** @type {PModel.Node} */ (leftP),
              mapping
            );
            left += 1;
          } else if (updateRight) {
            updateYFragment(
              y,
              /** @type {Y.XmlFragment} */ (rightY),
              /** @type {PModel.Node} */ (rightP),
              mapping
            );
            right += 1;
          } else {
            mapping.delete(yDomFragment.get(left));
            yDomFragment.delete(left, 1);
            yDomFragment.insert(left, [
              createTypeFromTextOrElementNode(leftP, mapping)
            ]);
            left += 1;
          }
        }
      }
      const yDelLen = yChildCnt - left - right;
      if (
        yChildCnt === 1 && pChildCnt === 0 && yChildren[0] instanceof YXmlText
      ) {
        mapping.delete(yChildren[0]);
        // Edge case handling https://github.com/yjs/y-prosemirror/issues/108
        // Only delete the content of the Y.Text to retain remote changes on the same Y.Text object
        yChildren[0].delete(0, yChildren[0].length);
      } else if (yDelLen > 0) {
        yDomFragment.slice(left, left + yDelLen).forEach(type => mapping.delete(type));
        yDomFragment.delete(left, yDelLen);
      }
      if (left + right < pChildCnt) {
        const ins = [];
        for (let i = left; i < pChildCnt - right; i++) {
          ins.push(createTypeFromTextOrElementNode(pChildren[i], mapping));
        }
        yDomFragment.insert(left, ins);
      }
    }, ySyncPluginKey);
  };

  /**
   * @function
   * @param {Y.XmlElement} yElement
   * @param {any} pNode Prosemirror Node
   */
  const matchNodeName = (yElement, pNode) =>
    !(pNode instanceof Array) && yElement.nodeName === pNode.type.name;

  /**
   * Transforms a Prosemirror based absolute position to a Yjs Cursor (relative position in the Yjs model).
   *
   * @param {number} pos
   * @param {Y.XmlFragment} type
   * @param {ProsemirrorMapping} mapping
   * @return {any} relative position
   */
  const absolutePositionToRelativePosition = (pos, type, mapping) => {
    if (pos === 0) {
      return createRelativePositionFromTypeIndex(type, 0)
    }
    /**
     * @type {any}
     */
    let n = type._first === null ? null : /** @type {Y.ContentType} */ (type._first.content).type;
    while (n !== null && type !== n) {
      if (n instanceof YXmlText) {
        if (n._length >= pos) {
          return createRelativePositionFromTypeIndex(n, pos)
        } else {
          pos -= n._length;
        }
        if (n._item !== null && n._item.next !== null) {
          n = /** @type {Y.ContentType} */ (n._item.next.content).type;
        } else {
          do {
            n = n._item === null ? null : n._item.parent;
            pos--;
          } while (n !== type && n !== null && n._item !== null && n._item.next === null)
          if (n !== null && n !== type) {
            // @ts-gnore we know that n.next !== null because of above loop conditition
            n = n._item === null ? null : /** @type {Y.ContentType} */ (/** @type Y.Item */ (n._item.next).content).type;
          }
        }
      } else {
        const pNodeSize = /** @type {any} */ (mapping.get(n) || { nodeSize: 0 }).nodeSize;
        if (n._first !== null && pos < pNodeSize) {
          n = /** @type {Y.ContentType} */ (n._first.content).type;
          pos--;
        } else {
          if (pos === 1 && n._length === 0 && pNodeSize > 1) {
            // edge case, should end in this paragraph
            return new RelativePosition(n._item === null ? null : n._item.id, n._item === null ? findRootTypeKey(n) : null, null)
          }
          pos -= pNodeSize;
          if (n._item !== null && n._item.next !== null) {
            n = /** @type {Y.ContentType} */ (n._item.next.content).type;
          } else {
            if (pos === 0) {
              // set to end of n.parent
              n = n._item === null ? n : n._item.parent;
              return new RelativePosition(n._item === null ? null : n._item.id, n._item === null ? findRootTypeKey(n) : null, null)
            }
            do {
              n = /** @type {Y.Item} */ (n._item).parent;
              pos--;
            } while (n !== type && /** @type {Y.Item} */ (n._item).next === null)
            // if n is null at this point, we have an unexpected case
            if (n !== type) {
              // We know that n._item.next is defined because of above loop condition
              n = /** @type {Y.ContentType} */ (/** @type {Y.Item} */ (/** @type {Y.Item} */ (n._item).next).content).type;
            }
          }
        }
      }
      if (n === null) {
        throw unexpectedCase()
      }
      if (pos === 0 && n.constructor !== YXmlText && n !== type) { // TODO: set to <= 0
        return createRelativePosition(n._item.parent, n._item)
      }
    }
    return createRelativePositionFromTypeIndex(type, type._length)
  };

  const createRelativePosition = (type, item) => {
    let typeid = null;
    let tname = null;
    if (type._item === null) {
      tname = findRootTypeKey(type);
    } else {
      typeid = createID(type._item.id.client, type._item.id.clock);
    }
    return new RelativePosition(typeid, tname, item.id)
  };

  /**
   * @param {Y.Doc} y
   * @param {Y.XmlFragment} documentType Top level type that is bound to pView
   * @param {any} relPos Encoded Yjs based relative position
   * @param {ProsemirrorMapping} mapping
   * @return {null|number}
   */
  const relativePositionToAbsolutePosition = (y, documentType, relPos, mapping) => {
    const decodedPos = createAbsolutePositionFromRelativePosition(relPos, y);
    if (decodedPos === null || (decodedPos.type !== documentType && !isParentOf(documentType, decodedPos.type._item))) {
      return null
    }
    let type = decodedPos.type;
    let pos = 0;
    if (type.constructor === YXmlText) {
      pos = decodedPos.index;
    } else if (type._item === null || !type._item.deleted) {
      let n = type._first;
      let i = 0;
      while (i < type._length && i < decodedPos.index && n !== null) {
        if (!n.deleted) {
          const t = /** @type {Y.ContentType} */ (n.content).type;
          i++;
          if (t instanceof YXmlText) {
            pos += t._length;
          } else {
            pos += /** @type {any} */ (mapping.get(t)).nodeSize;
          }
        }
        n = /** @type {Y.Item} */ (n.right);
      }
      pos += 1; // increase because we go out of n
    }
    while (type !== documentType && type._item !== null) {
      // @ts-ignore
      const parent = type._item.parent;
      // @ts-ignore
      if (parent._item === null || !parent._item.deleted) {
        pos += 1; // the start tag
        let n = /** @type {Y.AbstractType} */ (parent)._first;
        // now iterate until we found type
        while (n !== null) {
          const contentType = /** @type {Y.ContentType} */ (n.content).type;
          if (contentType === type) {
            break
          }
          if (!n.deleted) {
            if (contentType instanceof YXmlText) {
              pos += contentType._length;
            } else {
              pos += /** @type {any} */ (mapping.get(contentType)).nodeSize;
            }
          }
          n = n.right;
        }
      }
      type = /** @type {Y.AbstractType} */ (parent);
    }
    return pos - 1 // we don't count the most outer tag, because it is a fragment
  };

  /**
   * Utility method to convert a Prosemirror Doc Node into a Y.Doc.
   *
   * This can be used when importing existing content to Y.Doc for the first time,
   * note that this should not be used to rehydrate a Y.Doc from a database once
   * collaboration has begun as all history will be lost
   *
   * @param {Node} doc
   * @param {string} xmlFragment
   * @return {Y.Doc}
   */
  function prosemirrorToYDoc (doc, xmlFragment = 'prosemirror') {
    const ydoc = new Doc();
    const type = /** @type {Y.XmlFragment} */ (ydoc.get(xmlFragment, YXmlFragment));
    if (!type.doc) {
      return ydoc
    }

    prosemirrorToYXmlFragment(doc, type);
    return type.doc
  }

  /**
   * Utility method to update an empty Y.XmlFragment with content from a Prosemirror Doc Node.
   *
   * This can be used when importing existing content to Y.Doc for the first time,
   * note that this should not be used to rehydrate a Y.Doc from a database once
   * collaboration has begun as all history will be lost
   *
   * Note: The Y.XmlFragment does not need to be part of a Y.Doc document at the time that this
   * method is called, but it must be added before any other operations are performed on it.
   *
   * @param {Node} doc prosemirror document.
   * @param {Y.XmlFragment} [xmlFragment] If supplied, an xml fragment to be
   *   populated from the prosemirror state; otherwise a new XmlFragment will be created.
   * @return {Y.XmlFragment}
   */
  function prosemirrorToYXmlFragment (doc, xmlFragment) {
    const type = xmlFragment || new YXmlFragment();
    const ydoc = type.doc ? type.doc : { transact: (transaction) => transaction(undefined) };
    updateYFragment(ydoc, type, doc, new Map());
    return type
  }

  /**
   * Utility method to convert Prosemirror compatible JSON into a Y.Doc.
   *
   * This can be used when importing existing content to Y.Doc for the first time,
   * note that this should not be used to rehydrate a Y.Doc from a database once
   * collaboration has begun as all history will be lost
   *
   * @param {Schema} schema
   * @param {any} state
   * @param {string} xmlFragment
   * @return {Y.Doc}
   */
  function prosemirrorJSONToYDoc (schema, state, xmlFragment = 'prosemirror') {
    const doc = Node.fromJSON(schema, state);
    return prosemirrorToYDoc(doc, xmlFragment)
  }

  /**
   * Utility method to convert Prosemirror compatible JSON to a Y.XmlFragment
   *
   * This can be used when importing existing content to Y.Doc for the first time,
   * note that this should not be used to rehydrate a Y.Doc from a database once
   * collaboration has begun as all history will be lost
   *
   * @param {Schema} schema
   * @param {any} state
   * @param {Y.XmlFragment} [xmlFragment] If supplied, an xml fragment to be
   *   populated from the prosemirror state; otherwise a new XmlFragment will be created.
   * @return {Y.XmlFragment}
   */
  function prosemirrorJSONToYXmlFragment (schema, state, xmlFragment) {
    const doc = Node.fromJSON(schema, state);
    return prosemirrorToYXmlFragment(doc, xmlFragment)
  }

  /**
   * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
   *
   * @param {Y.Doc} ydoc
   * @param {string} xmlFragment
   * @return {Record<string, any>}
   */
  function yDocToProsemirrorJSON (
    ydoc,
    xmlFragment = 'prosemirror'
  ) {
    return yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(xmlFragment))
  }

  /**
   * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
   *
   * @param {Y.XmlFragment} xmlFragment The fragment, which must be part of a Y.Doc.
   * @return {Record<string, any>}
   */
  function yXmlFragmentToProsemirrorJSON (xmlFragment) {
    const items = xmlFragment.toArray();

    function serialize (item) {
      /**
       * @type {Object} NodeObject
       * @property {string} NodeObject.type
       * @property {Record<string, string>=} NodeObject.attrs
       * @property {Array<NodeObject>=} NodeObject.content
       */
      let response;

      // TODO: Must be a better way to detect text nodes than this
      if (!item.nodeName) {
        const delta = item.toDelta();
        response = delta.map((d) => {
          const text = {
            type: 'text',
            text: d.insert
          };

          if (d.attributes) {
            text.marks = Object.keys(d.attributes).map((type) => {
              const attrs = d.attributes[type];
              const mark = {
                type
              };

              if (Object.keys(attrs)) {
                mark.attrs = attrs;
              }

              return mark
            });
          }
          return text
        });
      } else {
        response = {
          type: item.nodeName
        };

        const attrs = item.getAttributes();
        if (Object.keys(attrs).length) {
          response.attrs = attrs;
        }

        const children = item.toArray();
        if (children.length) {
          response.content = children.map(serialize).flat();
        }
      }

      return response
    }

    return {
      type: 'doc',
      content: items.map(serialize)
    }
  }

  const undo = state => {
    const undoManager = yUndoPluginKey.getState(state).undoManager;
    if (undoManager != null) {
      undoManager.undo();
      return true
    }
  };

  const redo = state => {
    const undoManager = yUndoPluginKey.getState(state).undoManager;
    if (undoManager != null) {
      undoManager.redo();
      return true
    }
  };

  const defaultProtectedNodes = new Set(['paragraph']);

  const defaultDeleteFilter = (item, protectedNodes) => !(item instanceof Item) ||
  !(item.content instanceof ContentType) ||
  !(item.content.type instanceof YText ||
    (item.content.type instanceof YXmlElement && protectedNodes.has(item.content.type.nodeName))) ||
  item.content.type._length === 0;

  const yUndoPlugin = ({ protectedNodes = defaultProtectedNodes, trackedOrigins = [], undoManager = null } = {}) => new Plugin({
    key: yUndoPluginKey,
    state: {
      init: (initargs, state) => {
        // TODO: check if plugin order matches and fix
        const ystate = ySyncPluginKey.getState(state);
        const _undoManager = undoManager || new UndoManager(ystate.type, {
          trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
          deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes),
          captureTransaction: tr => tr.meta.get('addToHistory') !== false
        });
        return {
          undoManager: _undoManager,
          prevSel: null,
          hasUndoOps: _undoManager.undoStack.length > 0,
          hasRedoOps: _undoManager.redoStack.length > 0
        }
      },
      /**
       * @returns {any}
       */
      apply: (tr, val, oldState, state) => {
        const binding = ySyncPluginKey.getState(state).binding;
        const undoManager = val.undoManager;
        const hasUndoOps = undoManager.undoStack.length > 0;
        const hasRedoOps = undoManager.redoStack.length > 0;
        if (binding) {
          return {
            undoManager,
            prevSel: getRelativeSelection(binding, oldState),
            hasUndoOps,
            hasRedoOps
          }
        } else {
          if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps) {
            return Object.assign({}, val, {
              hasUndoOps: undoManager.undoStack.length > 0,
              hasRedoOps: undoManager.redoStack.length > 0
            })
          } else { // nothing changed
            return val
          }
        }
      }
    },
    view: view => {
      const ystate = ySyncPluginKey.getState(view.state);
      const undoManager = yUndoPluginKey.getState(view.state).undoManager;
      undoManager.on('stack-item-added', ({ stackItem }) => {
        const binding = ystate.binding;
        if (binding) {
          stackItem.meta.set(binding, yUndoPluginKey.getState(view.state).prevSel);
        }
      });
      undoManager.on('stack-item-popped', ({ stackItem }) => {
        const binding = ystate.binding;
        if (binding) {
          binding.beforeTransactionSelection = stackItem.meta.get(binding) || binding.beforeTransactionSelection;
        }
      });
      return {
        destroy: () => {
          undoManager.destroy();
        }
      }
    }
  });

  const pDOM = ["p", 0], blockquoteDOM = ["blockquote", 0], hrDOM = ["hr"], preDOM = ["pre", ["code", 0]], brDOM$1 = ["br"];
  /**
  [Specs](https://prosemirror.net/docs/ref/#model.NodeSpec) for the nodes defined in this schema.
  */
  const nodes$1 = {
      /**
      NodeSpec The top level document node.
      */
      doc: {
          content: "block+"
      },
      /**
      A plain paragraph textblock. Represented in the DOM
      as a `<p>` element.
      */
      paragraph: {
          content: "inline*",
          group: "block",
          parseDOM: [{ tag: "p" }],
          toDOM() { return pDOM; }
      },
      /**
      A blockquote (`<blockquote>`) wrapping one or more blocks.
      */
      blockquote: {
          content: "block+",
          group: "block",
          defining: true,
          parseDOM: [{ tag: "blockquote" }],
          toDOM() { return blockquoteDOM; }
      },
      /**
      A horizontal rule (`<hr>`).
      */
      horizontal_rule: {
          group: "block",
          parseDOM: [{ tag: "hr" }],
          toDOM() { return hrDOM; }
      },
      /**
      A heading textblock, with a `level` attribute that
      should hold the number 1 to 6. Parsed and serialized as `<h1>` to
      `<h6>` elements.
      */
      heading: {
          attrs: { level: { default: 1 } },
          content: "inline*",
          group: "block",
          defining: true,
          parseDOM: [{ tag: "h1", attrs: { level: 1 } },
              { tag: "h2", attrs: { level: 2 } },
              { tag: "h3", attrs: { level: 3 } },
              { tag: "h4", attrs: { level: 4 } },
              { tag: "h5", attrs: { level: 5 } },
              { tag: "h6", attrs: { level: 6 } }],
          toDOM(node) { return ["h" + node.attrs.level, 0]; }
      },
      /**
      A code listing. Disallows marks or non-text inline
      nodes by default. Represented as a `<pre>` element with a
      `<code>` element inside of it.
      */
      code_block: {
          content: "text*",
          marks: "",
          group: "block",
          code: true,
          defining: true,
          parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
          toDOM() { return preDOM; }
      },
      /**
      The text node.
      */
      text: {
          group: "inline"
      },
      /**
      An inline image (`<img>`) node. Supports `src`,
      `alt`, and `href` attributes. The latter two default to the empty
      string.
      */
      image: {
          inline: true,
          attrs: {
              src: {},
              alt: { default: null },
              title: { default: null }
          },
          group: "inline",
          draggable: true,
          parseDOM: [{ tag: "img[src]", getAttrs(dom) {
                      return {
                          src: dom.getAttribute("src"),
                          title: dom.getAttribute("title"),
                          alt: dom.getAttribute("alt")
                      };
                  } }],
          toDOM(node) { let { src, alt, title } = node.attrs; return ["img", { src, alt, title }]; }
      },
      /**
      A hard line break, represented in the DOM as `<br>`.
      */
      hard_break: {
          inline: true,
          group: "inline",
          selectable: false,
          parseDOM: [{ tag: "br" }],
          toDOM() { return brDOM$1; }
      }
  };
  const emDOM$1 = ["em", 0], strongDOM$1 = ["strong", 0], codeDOM$1 = ["code", 0];
  /**
  [Specs](https://prosemirror.net/docs/ref/#model.MarkSpec) for the marks in the schema.
  */
  const marks$1 = {
      /**
      A link. Has `href` and `title` attributes. `title`
      defaults to the empty string. Rendered and parsed as an `<a>`
      element.
      */
      link: {
          attrs: {
              href: {},
              title: { default: null }
          },
          inclusive: false,
          parseDOM: [{ tag: "a[href]", getAttrs(dom) {
                      return { href: dom.getAttribute("href"), title: dom.getAttribute("title") };
                  } }],
          toDOM(node) { let { href, title } = node.attrs; return ["a", { href, title }, 0]; }
      },
      /**
      An emphasis mark. Rendered as an `<em>` element. Has parse rules
      that also match `<i>` and `font-style: italic`.
      */
      em: {
          parseDOM: [{ tag: "i" }, { tag: "em" }, { style: "font-style=italic" }],
          toDOM() { return emDOM$1; }
      },
      /**
      A strong mark. Rendered as `<strong>`, parse rules also match
      `<b>` and `font-weight: bold`.
      */
      strong: {
          parseDOM: [{ tag: "strong" },
              // This works around a Google Docs misbehavior where
              // pasted content will be inexplicably wrapped in `<b>`
              // tags with a font-weight normal.
              { tag: "b", getAttrs: (node) => node.style.fontWeight != "normal" && null },
              { style: "font-weight", getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }],
          toDOM() { return strongDOM$1; }
      },
      /**
      Code font mark. Represented as a `<code>` element.
      */
      code: {
          parseDOM: [{ tag: "code" }],
          toDOM() { return codeDOM$1; }
      }
  };
  /**
  This schema roughly corresponds to the document schema used by
  [CommonMark](http://commonmark.org/), minus the list elements,
  which are defined in the [`prosemirror-schema-list`](https://prosemirror.net/docs/ref/#schema-list)
  module.

  To reuse elements from this schema, extend or read from its
  `spec.nodes` and `spec.marks` [properties](https://prosemirror.net/docs/ref/#model.Schema.spec).
  */
  const schema$2 = new Schema({ nodes: nodes$1, marks: marks$1 });

  const brDOM = ['br'];

  const calcYchangeDomAttrs = (attrs, domAttrs = {}) => {
    domAttrs = Object.assign({}, domAttrs);
    if (attrs.ychange !== null) {
      domAttrs.ychange_user = attrs.ychange.user;
      domAttrs.ychange_state = attrs.ychange.state;
    }
    return domAttrs
  };

  // :: Object
  // [Specs](#model.NodeSpec) for the nodes defined in this schema.
  const nodes = {
    // :: NodeSpec The top level document node.
    doc: {
      content: 'custom paragraph'
    },

    custom: {
      atom: true,
      attrs: { checked: { default: false } },
      parseDOM: [{ tag: 'div' }],
      toDOM () {
        return ['div']
      }
    },

    // :: NodeSpec A plain paragraph textblock. Represented in the DOM
    // as a `<p>` element.
    paragraph: {
      attrs: { ychange: { default: null } },
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM (node) {
        return ['p', calcYchangeDomAttrs(node.attrs), 0]
      }
    },

    // :: NodeSpec A blockquote (`<blockquote>`) wrapping one or more blocks.
    blockquote: {
      attrs: { ychange: { default: null } },
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM (node) {
        return ['blockquote', calcYchangeDomAttrs(node.attrs), 0]
      }
    },

    // :: NodeSpec A horizontal rule (`<hr>`).
    horizontal_rule: {
      attrs: { ychange: { default: null } },
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM (node) {
        return ['hr', calcYchangeDomAttrs(node.attrs)]
      }
    },

    // :: NodeSpec A heading textblock, with a `level` attribute that
    // should hold the number 1 to 6. Parsed and serialized as `<h1>` to
    // `<h6>` elements.
    heading: {
      attrs: {
        level: { default: 1 },
        ychange: { default: null }
      },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 5 } },
        { tag: 'h6', attrs: { level: 6 } }
      ],
      toDOM (node) {
        return ['h' + node.attrs.level, calcYchangeDomAttrs(node.attrs), 0]
      }
    },

    // :: NodeSpec A code listing. Disallows marks or non-text inline
    // nodes by default. Represented as a `<pre>` element with a
    // `<code>` element inside of it.
    code_block: {
      attrs: { ychange: { default: null } },
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM (node) {
        return ['pre', calcYchangeDomAttrs(node.attrs), ['code', 0]]
      }
    },

    // :: NodeSpec The text node.
    text: {
      group: 'inline'
    },

    // :: NodeSpec An inline image (`<img>`) node. Supports `src`,
    // `alt`, and `href` attributes. The latter two default to the empty
    // string.
    image: {
      inline: true,
      attrs: {
        ychange: { default: null },
        src: {},
        alt: { default: null },
        title: { default: null }
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs (dom) {
            return {
              src: dom.getAttribute('src'),
              title: dom.getAttribute('title'),
              alt: dom.getAttribute('alt')
            }
          }
        }
      ],
      toDOM (node) {
        const domAttrs = {
          src: node.attrs.src,
          title: node.attrs.title,
          alt: node.attrs.alt
        };
        return ['img', calcYchangeDomAttrs(node.attrs, domAttrs)]
      }
    },

    // :: NodeSpec A hard line break, represented in the DOM as `<br>`.
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM () {
        return brDOM
      }
    }
  };

  const emDOM = ['em', 0];
  const strongDOM = ['strong', 0];
  const codeDOM = ['code', 0];

  // :: Object [Specs](#model.MarkSpec) for the marks in the schema.
  const marks = {
    // :: MarkSpec A link. Has `href` and `title` attributes. `title`
    // defaults to the empty string. Rendered and parsed as an `<a>`
    // element.
    link: {
      attrs: {
        href: {},
        title: { default: null }
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs (dom) {
            return {
              href: dom.getAttribute('href'),
              title: dom.getAttribute('title')
            }
          }
        }
      ],
      toDOM (node) {
        return ['a', node.attrs, 0]
      }
    },

    // :: MarkSpec An emphasis mark. Rendered as an `<em>` element.
    // Has parse rules that also match `<i>` and `font-style: italic`.
    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM () {
        return emDOM
      }
    },

    // :: MarkSpec A strong mark. Rendered as `<strong>`, parse rules
    // also match `<b>` and `font-weight: bold`.
    strong: {
      parseDOM: [
        { tag: 'strong' },
        // This works around a Google Docs misbehavior where
        // pasted content will be inexplicably wrapped in `<b>`
        // tags with a font-weight normal.
        {
          tag: 'b',
          getAttrs: node => node.style.fontWeight !== 'normal' && null
        },
        {
          style: 'font-weight',
          getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null
        }
      ],
      toDOM () {
        return strongDOM
      }
    },

    // :: MarkSpec Code font mark. Represented as a `<code>` element.
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM () {
        return codeDOM
      }
    },
    ychange: {
      attrs: {
        user: { default: null },
        state: { default: null }
      },
      inclusive: false,
      parseDOM: [{ tag: 'ychange' }],
      toDOM (node) {
        return [
          'ychange',
          { ychange_user: node.attrs.user, ychange_state: node.attrs.state },
          0
        ]
      }
    }
  };

  // :: Schema
  // This schema rougly corresponds to the document schema used by
  // [CommonMark](http://commonmark.org/), minus the list elements,
  // which are defined in the [`prosemirror-schema-list`](#schema-list)
  // module.
  //
  // To reuse elements from this schema, extend or read from its
  // `spec.nodes` and `spec.marks` [properties](#model.Schema.spec).
  const schema$1 = new Schema({ nodes, marks });

  const schema = /** @type {any} */ (schema$2);

  /**
   * Verify that update events in plugins are only fired once.
   *
   * Initially reported in https://github.com/yjs/y-prosemirror/issues/121
   *
   * @param {t.TestCase} _tc
   */
  const testPluginIntegrity = (_tc) => {
    const ydoc = new Doc();
    let viewUpdateEvents = 0;
    let stateUpdateEvents = 0;
    const customPlugin = new Plugin({
      state: {
        init: () => {
          return {}
        },
        apply: () => {
          stateUpdateEvents++;
        }
      },
      view: () => {
        return {
          update () {
            viewUpdateEvents++;
          }
        }
      }
    });
    const view = new EditorView(null, {
      // @ts-ignore
      state: EditorState.create({
        schema,
        plugins: [
          ySyncPlugin(ydoc.get('prosemirror', YXmlFragment)),
          yUndoPlugin(),
          customPlugin
        ]
      })
    });
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('hello world')
        ))
      )
    );
    compare$1({ viewUpdateEvents, stateUpdateEvents }, {
      viewUpdateEvents: 1,
      stateUpdateEvents: 1
    }, 'events are fired only once');
  };

  /**
   * @param {t.TestCase} tc
   */
  const testDocTransformation = (_tc) => {
    const view = createNewProsemirrorView(new Doc());
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('hello world')
        ))
      )
    );
    const stateJSON = view.state.doc.toJSON();
    // test if transforming back and forth from Yjs doc works
    const backandforth = yDocToProsemirrorJSON(
      prosemirrorJSONToYDoc(/** @type {any} */ (schema), stateJSON)
    );
    compare$1(stateJSON, backandforth);
  };

  const testXmlFragmentTransformation = (_tc) => {
    const view = createNewProsemirrorView(new Doc());
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('hello world')
        ))
      )
    );
    const stateJSON = view.state.doc.toJSON();
    console.log(JSON.stringify(stateJSON));
    // test if transforming back and forth from yXmlFragment works
    const xml = new YXmlFragment();
    prosemirrorJSONToYXmlFragment(/** @type {any} */ (schema), stateJSON, xml);
    const doc = new Doc();
    doc.getMap('root').set('firstDoc', xml);
    const backandforth = yXmlFragmentToProsemirrorJSON(xml);
    console.log(JSON.stringify(backandforth));
    compare$1(stateJSON, backandforth);
  };

  const testChangeOrigin = (_tc) => {
    const ydoc = new Doc();
    const yXmlFragment = ydoc.get('prosemirror', YXmlFragment);
    const yundoManager = new UndoManager(yXmlFragment, { trackedOrigins: new Set(['trackme']) });
    const view = createNewProsemirrorView(ydoc);
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('world')
        ))
      )
    );
    const ysyncState1 = ySyncPluginKey.getState(view.state);
    assert(ysyncState1.isChangeOrigin === false);
    assert(ysyncState1.isUndoRedoOperation === false);
    ydoc.transact(() => {
      yXmlFragment.get(0).get(0).insert(0, 'hello');
    }, 'trackme');
    const ysyncState2 = ySyncPluginKey.getState(view.state);
    assert(ysyncState2.isChangeOrigin === true);
    assert(ysyncState2.isUndoRedoOperation === false);
    yundoManager.undo();
    const ysyncState3 = ySyncPluginKey.getState(view.state);
    assert(ysyncState3.isChangeOrigin === true);
    assert(ysyncState3.isUndoRedoOperation === true);
  };

  /**
   * @param {t.TestCase} tc
   */
  const testEmptyNotSync = (_tc) => {
    const ydoc = new Doc();
    const type = ydoc.getXmlFragment('prosemirror');
    const view = createNewComplexProsemirrorView(ydoc);
    assert(type.toString() === '', 'should only sync after first change');

    view.dispatch(
      view.state.tr.setNodeMarkup(0, undefined, {
        checked: true
      })
    );
    compareStrings(
      type.toString(),
      '<custom checked="true"></custom><paragraph></paragraph>'
    );
  };

  /**
   * @param {t.TestCase} tc
   */
  const testEmptyParagraph = (_tc) => {
    const ydoc = new Doc();
    const view = createNewProsemirrorView(ydoc);
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('123')
        ))
      )
    );
    const yxml = ydoc.get('prosemirror');
    assert(
      yxml.length === 2 && yxml.get(0).length === 1,
      'contains one paragraph containing a ytext'
    );
    view.dispatch(view.state.tr.delete(1, 4)); // delete characters 123
    assert(
      yxml.length === 2 && yxml.get(0).length === 1,
      "doesn't delete the ytext"
    );
  };

  const testAddToHistory = (_tc) => {
    const ydoc = new Doc();
    const view = createNewProsemirrorViewWithUndoManager(ydoc);
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('123')
        ))
      )
    );
    const yxml = ydoc.get('prosemirror');
    assert(
      yxml.length === 2 && yxml.get(0).length === 1,
      'contains inserted content'
    );
    undo(view.state);
    assert(yxml.length === 0, 'insertion was undone');
    redo(view.state);
    assert(
      yxml.length === 2 && yxml.get(0).length === 1,
      'contains inserted content'
    );
    undo(view.state);
    assert(yxml.length === 0, 'insertion was undone');
    // now insert content again, but with `'addToHistory': false`
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('123')
        ))
      ).setMeta('addToHistory', false)
    );
    assert(
      yxml.length === 2 && yxml.get(0).length === 1,
      'contains inserted content'
    );
    undo(view.state);
    assert(
      yxml.length === 2 && yxml.get(0).length === 1,
      'insertion was *not* undone'
    );
  };

  const testAddToHistoryIgnore = (_tc) => {
    const ydoc = new Doc();
    const view = createNewProsemirrorViewWithUndoManager(ydoc);
    // perform two changes that are tracked by um - supposed to be merged into a single undo-manager item
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('123')
        ))
      )
    );
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('456')
        ))
      )
    );
    const yxml = ydoc.get('prosemirror');
    assert(
      yxml.length === 3 && yxml.get(0).length === 1,
      'contains inserted content (1)'
    );
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('abc')
        ))
      ).setMeta('addToHistory', false)
    );
    assert(
      yxml.length === 4 && yxml.get(0).length === 1,
      'contains inserted content (2)'
    );
    view.dispatch(
      view.state.tr.insert(
        0,
        /** @type {any} */ (schema.node(
          'paragraph',
          undefined,
          schema.text('xyz')
        ))
      )
    );
    assert(
      yxml.length === 5 && yxml.get(0).length === 1,
      'contains inserted content (3)'
    );
    undo(view.state);
    assert(yxml.length === 4, 'insertion (3) was undone');
    undo(view.state);
    console.log(yxml.toString());
    assert(
      yxml.length === 1 &&
        yxml.get(0).toString() === '<paragraph>abc</paragraph>',
      'insertion (1) was undone'
    );
  };

  const createNewProsemirrorViewWithSchema = (y, schema, undoManager = false) => {
    const view = new EditorView(null, {
      // @ts-ignore
      state: EditorState.create({
        schema,
        plugins: [ySyncPlugin(y.get('prosemirror', YXmlFragment))].concat(
          undoManager ? [yUndoPlugin()] : []
        )
      })
    });
    return view
  };

  const createNewComplexProsemirrorView = (y, undoManager = false) =>
    createNewProsemirrorViewWithSchema(y, schema$1, undoManager);

  const createNewProsemirrorView = (y) =>
    createNewProsemirrorViewWithSchema(y, schema, false);

  const createNewProsemirrorViewWithUndoManager = (y) =>
    createNewProsemirrorViewWithSchema(y, schema, true);

  let charCounter = 0;

  const marksChoices = [
    [schema.mark('strong')],
    [schema.mark('em')],
    [schema.mark('em'), schema.mark('strong')],
    [],
    []
  ];

  const pmChanges = [
    /**
     * @param {Y.Doc} y
     * @param {prng.PRNG} gen
     * @param {EditorView} p
     */
    (_y, gen, p) => { // insert text
      const insertPos = int32(gen, 0, p.state.doc.content.size);
      const marks = oneOf(gen, marksChoices);
      const tr = p.state.tr;
      const text = charCounter++ + word(gen);
      p.dispatch(tr.insert(insertPos, schema.text(text, marks)));
    },
    /**
     * @param {Y.Doc} y
     * @param {prng.PRNG} gen
     * @param {EditorView} p
     */
    (_y, gen, p) => { // delete text
      const insertPos = int32(gen, 0, p.state.doc.content.size);
      const overwrite = min(
        int32(gen, 0, p.state.doc.content.size - insertPos),
        2
      );
      p.dispatch(p.state.tr.insertText('', insertPos, insertPos + overwrite));
    },
    /**
     * @param {Y.Doc} y
     * @param {prng.PRNG} gen
     * @param {EditorView} p
     */
    (_y, gen, p) => { // replace text
      const insertPos = int32(gen, 0, p.state.doc.content.size);
      const overwrite = min(
        int32(gen, 0, p.state.doc.content.size - insertPos),
        2
      );
      const text = charCounter++ + word(gen);
      p.dispatch(p.state.tr.insertText(text, insertPos, insertPos + overwrite));
    },
    /**
     * @param {Y.Doc} y
     * @param {prng.PRNG} gen
     * @param {EditorView} p
     */
    (_y, gen, p) => { // insert paragraph
      const insertPos = int32(gen, 0, p.state.doc.content.size);
      const marks = oneOf(gen, marksChoices);
      const tr = p.state.tr;
      const text = charCounter++ + word(gen);
      p.dispatch(
        tr.insert(
          insertPos,
          schema.node('paragraph', undefined, schema.text(text, marks))
        )
      );
    },
    /**
     * @param {Y.Doc} y
     * @param {prng.PRNG} gen
     * @param {EditorView} p
     */
    (_y, gen, p) => { // insert codeblock
      const insertPos = int32(gen, 0, p.state.doc.content.size);
      const tr = p.state.tr;
      const text = charCounter++ + word(gen);
      p.dispatch(
        tr.insert(
          insertPos,
          schema.node('code_block', undefined, schema.text(text))
        )
      );
    },
    /**
     * @param {Y.Doc} y
     * @param {prng.PRNG} gen
     * @param {EditorView} p
     */
    (_y, gen, p) => { // wrap in blockquote
      const insertPos = int32(gen, 0, p.state.doc.content.size);
      const overwrite = int32(gen, 0, p.state.doc.content.size - insertPos);
      const tr = p.state.tr;
      tr.setSelection(
        TextSelection.create(tr.doc, insertPos, insertPos + overwrite)
      );
      const $from = tr.selection.$from;
      const $to = tr.selection.$to;
      const range = $from.blockRange($to);
      const wrapping = range && findWrapping(range, schema.nodes.blockquote);
      if (wrapping) {
        p.dispatch(tr.wrap(range, wrapping));
      }
    }
  ];

  /**
   * @param {any} result
   */
  const checkResult = (result) => {
    for (let i = 1; i < result.testObjects.length; i++) {
      const p1 = result.testObjects[i - 1].state.doc.toJSON();
      const p2 = result.testObjects[i].state.doc.toJSON();
      compare$1(p1, p2);
    }
  };

  /**
   * @param {t.TestCase} tc
   */
  const testRepeatGenerateProsemirrorChanges2 = (tc) => {
    checkResult(applyRandomTests(tc, pmChanges, 2, createNewProsemirrorView));
  };

  /**
   * @param {t.TestCase} tc
   */
  const testRepeatGenerateProsemirrorChanges3 = (tc) => {
    checkResult(applyRandomTests(tc, pmChanges, 3, createNewProsemirrorView));
  };

  /**
   * @param {t.TestCase} tc
   */
  const testRepeatGenerateProsemirrorChanges30 = (tc) => {
    checkResult(applyRandomTests(tc, pmChanges, 30, createNewProsemirrorView));
  };

  /**
   * @param {t.TestCase} tc
   */
  const testRepeatGenerateProsemirrorChanges40 = (tc) => {
    checkResult(applyRandomTests(tc, pmChanges, 40, createNewProsemirrorView));
  };

  /**
   * @param {t.TestCase} tc
   */
  const testRepeatGenerateProsemirrorChanges70 = (tc) => {
    checkResult(applyRandomTests(tc, pmChanges, 70, createNewProsemirrorView));
  };

  /**
   * @param {t.TestCase} tc
   *
  export const testRepeatGenerateProsemirrorChanges100 = tc => {
    checkResult(applyRandomTests(tc, pmChanges, 100, createNewProsemirrorView))
  }

  /**
   * @param {t.TestCase} tc
   *
  export const testRepeatGenerateProsemirrorChanges300 = tc => {
    checkResult(applyRandomTests(tc, pmChanges, 300, createNewProsemirrorView))
  }
  */

  var prosemirror = /*#__PURE__*/Object.freeze({
    __proto__: null,
    testPluginIntegrity: testPluginIntegrity,
    testDocTransformation: testDocTransformation,
    testXmlFragmentTransformation: testXmlFragmentTransformation,
    testChangeOrigin: testChangeOrigin,
    testEmptyNotSync: testEmptyNotSync,
    testEmptyParagraph: testEmptyParagraph,
    testAddToHistory: testAddToHistory,
    testAddToHistoryIgnore: testAddToHistoryIgnore,
    testRepeatGenerateProsemirrorChanges2: testRepeatGenerateProsemirrorChanges2,
    testRepeatGenerateProsemirrorChanges3: testRepeatGenerateProsemirrorChanges3,
    testRepeatGenerateProsemirrorChanges30: testRepeatGenerateProsemirrorChanges30,
    testRepeatGenerateProsemirrorChanges40: testRepeatGenerateProsemirrorChanges40,
    testRepeatGenerateProsemirrorChanges70: testRepeatGenerateProsemirrorChanges70
  });

  if (isBrowser) {
    createVConsole(document.body);
  }
  runTests({
    prosemirror
  }).then(success => {
    /* istanbul ignore next */
    if (isNode) {
      process.exit(success ? 0 : 1);
    }
  });

})();
//# sourceMappingURL=test.js.map
