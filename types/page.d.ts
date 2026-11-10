/* Browser members the page uses that lib.dom does not declare (vendor-prefixed and dev-only), for `tsc --checkJs` (see tsconfig.json). */
interface Window {
  webkitAudioContext?: typeof AudioContext;
  __wordStats?: () => unknown;
  __dbg?: unknown;
}
interface Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}
interface HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
