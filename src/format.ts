/**
 * Frame geometry per format. Landscape is the desktop-video layout; vertical (9:16, Reels, Shorts,
 * TikTok) keeps everything inside the area platform UI doesn't cover, and records the app at a narrow
 * portrait viewport shaped like its window, so each page is laid out for a small screen and fits.
 */
export type Format = 'landscape' | 'vertical';

export interface Geometry {
  width: number;
  height: number;
  /** Where recorded footage is shown. */
  window: { x: number; y: number; w: number; h: number };
  /** Text must stay inside this. */
  safe: { left: number; top: number; right: number; bottom: number };
  /** Full-frame text stays above this line: captions go below it. */
  captionTop: number;
  /** The recording viewport when the spec sets none. */
  viewport: { width: number; height: number; scale: number };
  /** How far the camera may push in on a target (unset: the timeline's own limit). */
  maxZoom?: number;
}

export const GEOMETRY: Record<Format, Geometry> = {
  landscape: {
    width: 1920, height: 1080,
    window: { x: 114, y: 100, w: 1692, h: 952 },
    safe: { left: 60, top: 54, right: 1860, bottom: 1026 },
    captionTop: 890,
    viewport: { width: 1280, height: 720, scale: 1.5 },
  },
  vertical: {
    width: 1080, height: 1920,
    window: { x: 60, y: 300, w: 960, h: 1180 },
    // Platform UI covers the top ~110 px, the right ~120 px edge (buttons) and the bottom ~300 px.
    safe: { left: 60, top: 120, right: 1020, bottom: 1700 },
    captionTop: 1520,
    // Shaped like the window (960×1180): the page fills it, laid out for a phone-width screen.
    viewport: { width: 440, height: 541, scale: 2.5 },
    // The page already fills the window: the ring shows the target, no push-in.
    maxZoom: 1,
  },
};
