/* The site's art, encoded for the pages that draw it.
 *
 * Every quality here is a measured budget: bytes paid against likeness kept.
 * The hero's two are measured directly; the decoratives are held to the
 * budget their weight serves, the hero's own first load. A number here
 * changes only with new measurements behind it, and
 * `scripts/check-encodes.mjs` holds the built weights to these choices.
 *
 * Every derivative keeps the frame of its source. The transform passes no
 * dimension, and Astro then carries the source's own width and height into
 * the encoder, whose resize of an image onto its own size changes nothing.
 * No crop, no flatten, and the alpha channel survives. The hero's 1536 by
 * 1024 stays the frame the canvas effects normalize their coordinates
 * against.
 */

import { getImage } from 'astro:assets'
import garden from '../assets/art/garden.png'
import seedling from '../assets/art/seedling.png'
import vine from '../assets/art/vine.png'

/** An image the page renders: where it is served from, and the frame it fills. */
type ArtImage = {
  readonly src: string
  readonly width: number
  readonly height: number
}

// The width and the height are the source's own. The transform passes no
// dimension, so the derivative carries the source frame pixel for pixel.
async function encode(source: ImageMetadata, quality: number): Promise<ArtImage> {
  const encoded = await getImage({ src: source, format: 'avif', quality })

  return { src: encoded.src, width: source.width, height: source.height }
}

/** The hero a narrow viewport loads. Quality 45 weighs 147 KB, inside the
 * budget a throttled phone connection carries before the paint. */
export const heroMobile = await encode(garden, 45)

/** The hero a wider viewport loads. Quality 60 is the last step that earns its
 * bytes. The step above it costs 30 KB more and looks almost the same. */
export const heroDesktop = await encode(garden, 60)

/** The source raster, which a browser without AVIF renders instead. It is
 * also where a reader of this module finds the hero's natural size. */
export const heroOriginal: ArtImage = {
  src: garden.src,
  width: garden.width,
  height: garden.height,
}

/** The vine draped over the installer. Quality 50 takes the 352 KB raster to
 * 44 KB, out of the hero's way on the first load. */
export const installerVine = await encode(vine, 50)

/** The seedling in the mark, which the landing's header and the
 * documentation's bar both draw. The mark is small and always on screen, so
 * quality 60 keeps its leaf veins for 14 KB. */
export const navSeedling = await encode(seedling, 60)
