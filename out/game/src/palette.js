// TIDEWATER — dawn at a container harbor. One accent (signal orange), one team blue,
// and the dawn sky does the rest. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#251a14', // warm dusk dark (fog / sky base — sunset identity)
  surface: '#22303c', // steel blue-grey
  hairline: '#3a4a58', // weathered steel
  ink: '#eef2f0', // off-white
  muted: '#8fa3ad', // mist grey-blue
  accent: '#ff8c2e', // signal orange (TIDE RUNNERS)
  teamBlue: '#3fa7ff', // HARBOR WATCH
  teamOrange: '#ff8c2e', // TIDE RUNNERS
  danger: '#ff4d4d',
  money: '#7ee081',
  skyTop: '#1b3a52',
  skyHorizon: '#e8905a',
  sun: '#ffb35c',
};

export function shade(name) {
  return PALETTE[name];
}
