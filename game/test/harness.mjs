// Headless loader: runs game/garage.js in a vm with a tiny DOM stub (same idea as Gear Mill det-node).
import { readFileSync } from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
export function loadGarage(search = '') {
  const el = () => new Proxy(function () {}, {
    get: (t, k) => k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains() { return false; } }
      : k === 'style' ? {} : k === 'getContext' ? () => ctx2d
      : k === 'getBoundingClientRect' ? () => ({ left: 0, top: 0 })
      : k === 'parentElement' ? { clientWidth: 412, clientHeight: 760 }
      : k === 'addEventListener' || k === 'setPointerCapture' ? () => {} : '',
    set: () => true
  });
  const ctx2d = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  const els = {};
  const sandbox = {
    console, Math, JSON, Object, Array, Number, String, Uint8Array, URLSearchParams, Blob: class {}, URL,
    setTimeout: () => 0, clearTimeout: () => {}, performance: { now: () => 0 },
    location: { search },
    document: { getElementById: (id) => (els[id] ||= el()), createElement: () => el() },
    navigator: {},
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(here, '..', 'garage.js'), 'utf8'), sandbox);
  return sandbox.__garage;
}
