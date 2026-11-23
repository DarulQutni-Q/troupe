/**
 * Launch flags for every Chromium that paints the React reference.
 *
 * - `--font-render-hinting=slight`: headless Chromium defaults to `full`,
 *   which lays text out on hinted whole-pixel advances, so a 13 px Inter line
 *   came out 2.2 % wider than the font's design widths. Desktop Chrome on
 *   Linux follows fontconfig (`slight` on stock GNOME), and macOS and Windows
 *   lay out fractional advances.
 * - `--disable-lcd-text`: grayscale anti-aliasing. Rune's headless frames
 *   draw grayscale text; LCD against grayscale alone measured a 0.5 to 0.7 %
 *   floor in the chat prototype.
 * - The network flag lets a route-fulfilled page open sockets to 127.0.0.1.
 */
export const REFERENCE_ARGS = [
  '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks',
  '--font-render-hinting=slight',
  '--disable-lcd-text'
]
