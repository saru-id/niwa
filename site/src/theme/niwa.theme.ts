import { defineTheme } from '@astryxdesign/core/theme'

/**
 * The site's AstryX theme.
 *
 * Two rules decide every value below.
 *
 * The first is that the site already has a palette, and it is measured.
 * `src/styles/app.css` declares the ground, surface, border, ink, accent and
 * role tokens in OKLCH, and every one of them was checked with APCA against
 * the two backgrounds it can sit on. So the colour tokens here point at
 * those custom properties instead of restating their values. One definition,
 * one place to change it, and no chance of a hex drifting away from the
 * value that was measured.
 *
 * The second is that pointing at them also settles light and dark. AstryX
 * resolves a `light-dark()` pair from `color-scheme`. The site resolves its
 * own tokens from a class on `<html>`. A token whose value is
 * `var(--ground)` follows the class, so the reader's choice drives both
 * palettes through one control. The tokens that still hold a
 * `light-dark()` pair are the ones this file does not override, and
 * `app.css` sets `color-scheme` per state so they follow the same class.
 *
 * The scale configs below still run. `color.accent` seeds the neutral and
 * accent ramps AstryX derives, which fills the tokens this file leaves
 * alone; the explicit overrides then win where a measured value exists.
 */
export const niwaTheme = defineTheme({
  name: 'niwa',

  // The indigo, as a seed. `neutral` is the lowest chroma the neutral ramp
  // offers, because the site's greys carry no hue at all and any derived
  // grey has to sit beside them.
  color: { accent: '#4e5bd0', neutralStyle: 'neutral', contrast: 'standard' },

  typography: {
    // 16px base. The site sets code at the same size as prose, so the base
    // is the reading size and nothing shrinks below it.
    scale: { base: 16, ratio: 1.2 },
  },

  // The site draws one corner. `--radius-element` is `base * 2`, so a base
  // of 4 lands it on the 8px frame the site already uses; the containers
  // are pulled back to the same 8px below, and the inner corner to the 5px
  // the site uses inside a frame.
  radius: { base: 4, multiplier: 1 },

  // One duration for everything, and the site's own easing keyword. A ratio
  // of 1 collapses the min and max variants onto the same number, so no
  // component can reach for a longer band.
  motion: { fast: 120, medium: 120, slow: 120, ratio: 1, easing: 'ease' },

  tokens: {
    // ---- Faces ---------------------------------------------------------
    // The site ships no webfonts. Both stacks live in `app.css`.
    '--font-family-body': 'var(--font-sans)',
    '--font-family-heading': 'var(--font-sans)',
    '--font-family-code': 'var(--font-mono)',

    // ---- Grounds -------------------------------------------------------
    '--color-background-body': 'var(--ground)',
    '--color-background-surface': 'var(--surface)',
    '--color-background-card': 'var(--surface)',
    '--color-background-popover': 'var(--surface)',
    '--color-background-muted': 'var(--surface)',
    // Inverted means the opposite end of the ink ramp, and the ramp already
    // flips with the theme: 0.16 on a light page, 0.965 on a dark one.
    '--color-background-inverted': 'var(--ink-strong)',

    // ---- Ink -----------------------------------------------------------
    // Running text is `--ink`. `--ink-strong` is reserved for headings and
    // identifiers; the `code` override below and one rule in `app.css` are
    // where it lands.
    '--color-text-primary': 'var(--ink)',
    '--color-text-secondary': 'var(--ink-muted)',
    // The site has no disabled ink. `--border-strong` is the grey that sits
    // one step past muted in both themes, which is what disabled has to be.
    '--color-text-disabled': 'var(--border-strong)',
    // Not the accent. The accent measures under the APCA body floor in the
    // dark theme on purpose, so it never sets text; `--link` is the pair
    // that clears it.
    '--color-text-accent': 'var(--link)',
    '--color-icon-primary': 'var(--ink)',
    '--color-icon-secondary': 'var(--ink-muted)',
    '--color-icon-disabled': 'var(--border-strong)',
    '--color-icon-accent': 'var(--accent)',

    // ---- Edges ---------------------------------------------------------
    '--color-border': 'var(--border)',
    '--color-border-emphasized': 'var(--border-strong)',
    '--color-track': 'var(--border-strong)',
    '--color-skeleton': 'var(--border)',

    // ---- Accent --------------------------------------------------------
    '--color-accent': 'var(--accent)',
    // The accent is dark in the light theme and light in the dark one, and
    // the ground is the opposite of the accent in both. So one token reads
    // correctly on top of the fill in either theme.
    '--color-on-accent': 'var(--ground)',

    // ---- Roles ---------------------------------------------------------
    // Named after the tool's own `Role` enum, so the site says what the
    // tool says. The `on-` tokens follow the accent's reasoning.
    '--color-success': 'var(--role-good)',
    '--color-on-success': 'var(--ground)',
    '--color-warning': 'var(--role-warn)',
    '--color-on-warning': 'var(--ground)',
    '--color-error': 'var(--role-bad)',
    '--color-on-error': 'var(--ground)',

    // ---- Overlay -------------------------------------------------------
    // The scrim the site already puts behind its search dialog. The page
    // has to dim in both themes, and in the dark theme it is already the
    // darker of the two grounds.
    '--color-overlay': ['rgb(0 0 0 / 0.4)', 'rgb(0 0 0 / 0.66)'],

    // ---- Shape ---------------------------------------------------------
    // 8px is the site's frame, everywhere, at every size. A 28px page
    // corner is the shape that reads as a different site.
    '--radius-inner': '5px',
    '--radius-container': '8px',
    '--radius-page': '8px',
    '--radius-chat': '8px',

    // ---- Elevation -----------------------------------------------------
    // A border is the only edge this site draws. A shadow with no blur and
    // a one pixel spread is a border in every way a reader can see, so the
    // three elevation steps all resolve to the same hairline and nothing
    // floats.
    '--shadow-low': '0 0 0 1px var(--border)',
    '--shadow-med': '0 0 0 1px var(--border)',
    '--shadow-high': '0 0 0 1px var(--border)',
    '--color-shadow': 'transparent',
  },

  components: {
    // A link the reader has not chosen sits a step back from the group
    // title above it. The selected state is not expressible here — the
    // component takes no `state` prop — so `app.css` marks it, off the
    // `data-selected` attribute the styling guide names as the stable
    // surface.
    'side-nav-item': {
      base: {
        color: 'var(--ink-muted)',
      },
    },
    // The site tightens a heading. Its colour is not set here: the design
    // system writes its own rule for `color="primary"` after every theme
    // override and at a weight this cannot reach, so `app.css` settles it.
    heading: {
      base: { letterSpacing: '-0.015em' },
    },
    // Inline code is an identifier inside a sentence. The site marks those
    // with weight and colour, never with a box: a border around every flag
    // name speckles running prose, and the reference pages are mostly flag
    // names.
    code: {
      base: {
        backgroundColor: 'transparent',
        color: 'var(--ink-strong)',
        paddingBlock: '0',
        paddingInline: '0',
        // The tool prints paths, flags and comparisons. `~=`, `->` and `!=`
        // must read as two characters.
        fontVariantLigatures: 'none',
      },
    },
  },
})
