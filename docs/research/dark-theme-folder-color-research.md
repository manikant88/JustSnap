# Dark-theme folder color research

**Research date:** 2026-09-17  
**Product context:** Small DockSnip Folder tiles on a near-black Dock (`#050506`), with image thumbnails inside, neutral overlay controls, and a hover/focus-only border.

## Executive conclusion

The strongest basis for DockSnip is a **categorical dark-theme palette**, not an evenly spaced color wheel and not twelve equally saturated brand colors. IBM Carbon's categorical sequence is the most directly relevant first-party precedent: it was designed for discrete, unrelated categories, for harmony within a page, and its order is explicitly curated to maximize contrast between neighboring colors. [IBM Carbon: color palettes](https://carbondesignsystem.com/data-visualization/color-palettes/)

However, using twelve full-strength categorical colors as 52px Folder backgrounds would be unnecessarily loud beside arbitrary screenshot thumbnails. Adobe Spectrum recommends fewer than six categorical colors when possible and says twelve become extremely difficult to comprehend; it also warns that too much color can be visually overwhelming. [Adobe Spectrum: data-visualization color](https://spectrum.adobe.com/page/color-for-data-visualization/) [Adobe Spectrum: color system](https://spectrum.adobe.com/page/color-system/)

For DockSnip, the best compromise is therefore:

1. Use a **six-color primary set** for the clearest early assignments.
2. Keep six additional colors as an overflow set so all twelve slots remain unique before reuse.
3. Use **dark, chromatic Folder surfaces** at rest and reserve the brighter source color for the 1px hover/focus border.
4. Preserve Carbon's high-contrast assignment order rather than sorting colors around the hue wheel.
5. Treat color as recognition assistance only; thumbnails, position, and accessible names must continue to identify Folders.

## What the primary sources establish

### Dark interfaces need controlled brightness, not simple inversion

Apple says Dark Mode colors are not necessarily inversions of light colors: backgrounds are dimmer while foreground colors are brighter. It also notes that colors appear brighter and more saturated in dark environments, so schemes must be tested under different lighting conditions. [Apple HIG: Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)

Fluent similarly shifts shared colors in both saturation and brightness in dark mode to reduce eye strain and support accessibility. It recommends using shared colors sparingly for accents and important areas, while lighter neutral surfaces create hierarchy. [Microsoft Fluent 2: Color](https://fluent2.microsoft.design/color)

Carbon's dark-theme layering model makes each foreground layer one step lighter than its parent rather than making components darker than the background. [IBM Carbon: color overview](https://carbondesignsystem.com/elements/color/overview/)

**DockSnip implication:** Folder surfaces should be clearly lighter than `#050506`, but they do not need to glow. A restrained chromatic surface plus a brighter interaction border creates separation without competing with the thumbnails.

### Side-by-side colors need a categorical sequence

Carbon defines categorical palettes for discrete categories with no inherent order and says its sequence must be applied as specified because it is curated to maximize contrast between neighboring colors. [IBM Carbon: color palettes](https://carbondesignsystem.com/data-visualization/color-palettes/)

Spectrum likewise defines categorical colors as visually distinct and optimized for users with color-vision deficiencies, but advises using fewer than six when possible because comprehension becomes difficult at six and especially at twelve. [Adobe Spectrum: data-visualization color](https://spectrum.adobe.com/page/color-for-data-visualization/)

**DockSnip implication:** Twelve unique slots are acceptable as progressive identity cues in a vertical Dock, but the first six should carry the strongest differentiation. A user should never have to compare all twelve or remember what a color means.

### Color cannot be the only identifier

WCAG 2.2 says color must not be the only visual means of distinguishing an element when that distinction conveys information. W3C also notes that hue differences are not perceived consistently by people with color-vision deficiencies. [W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) [W3C: Contrast Enhanced rationale](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced)

For visible component boundaries and state indicators, WCAG's non-text contrast guidance uses a 3:1 contrast ratio against adjacent colors. A boundary is not required when other visible content already identifies the control, but a sufficiently contrasting focus indicator is still needed. W3C also cautions that thin lines can render with less apparent contrast than their nominal value. [W3C: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)

**DockSnip implication:** The Folder's thumbnails and accessible name/role remain its identifiers. The hover/focus border should be treated as an interaction indicator and should target at least 3:1 against both the Folder surface and adjacent Dock. Because it is only 1px, choose a value comfortably above the minimum rather than one that barely passes.

### Neutral controls should remain neutral over colored tiles

Apple advises avoiding similar control-label colors over colorful content and prefers monochromatic controls when the background is visually rich. Spectrum uses neutral grays to avoid chromatic adaptation and simultaneous-contrast problems, and reserves static black or white overlays for colored backgrounds according to whichever provides adequate contrast. [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color) [Adobe Spectrum: color system](https://spectrum.adobe.com/page/color-system/) [Adobe Spectrum: using color](https://spectrum.adobe.com/page/using-color/)

**DockSnip implication:** Keep add/delete controls on the current dark neutral circular surface with white icons. Do not tint those controls per Folder; the Folder surface is already the identity cue.

## Recommended 12-color palette

This proposal derives its hue families and ordering from Carbon's dark categorical palette, then uses darker opaque surfaces for DockSnip's resting state. The bright values are reserved for the hover/focus border. This is a DockSnip adaptation—not a claim that the derived surface hex values are Carbon tokens.

| Slot | Family | Default surface | Hover/focus border | Set |
|---:|---|---|---|---|
| 1 | Purple | `#563E7F` | `#BE95FF` | Primary |
| 2 | Cyan | `#235C7F` | `#82CFFF` | Primary |
| 3 | Teal | `#106160` | `#3DDBD9` | Primary |
| 4 | Magenta | `#773150` | `#FFAFD2` | Primary |
| 5 | Coral red | `#7F474A` | `#FFB3B8` | Primary |
| 6 | Green | `#2A623A` | `#6FDC8C` | Primary |
| 7 | Blue | `#2B4A7F` | `#78A9FF` | Overflow |
| 8 | Gold | `#796318` | `#FDDC69` | Overflow |
| 9 | Pink | `#7F455E` | `#FFD6E8` | Overflow |
| 10 | Deep red | `#75272C` | `#FF8389` | Overflow |
| 11 | Aqua | `#286F6E` | `#9EF0F0` | Overflow |
| 12 | Orange | `#75401F` | `#FFB784` | Overflow |

### Why this order

- Adjacent assignments change hue family aggressively: purple → cyan → teal → magenta → red → green, rather than walking through subtly different neighboring hues.
- The first six avoid duplicate families and should cover most realistic Docks.
- Closely related secondaries—cyan/blue, magenta/pink, teal/aqua, red/orange—are separated across the sequence.
- The surfaces are opaque and restrained; thumbnails remain visually dominant.
- The bright border colors come from Carbon's dark categorical/brand families and provide a clear interaction moment without altering the Folder's fill. Each proposed border has at least 3.7:1 contrast against its paired surface under the WCAG 2 relative-luminance formula.

## Interaction and implementation constraints

1. **Do not change the surface on hover.** Hover/focus should add only the 1px bright border (and an optional neutral elevation), so users do not perceive a color change as a state or new identity. Fluent's focus guidance similarly changes the container stroke rather than the control color. [Microsoft Fluent 2: Color](https://fluent2.microsoft.design/color)
2. **Use a transparent 1px resting border.** This reserves geometry and prevents the tile from shifting when the bright border appears.
3. **Use the same visible treatment for keyboard focus.** If hover gets a bright border, focus must be at least as clear; Carbon requires focus states on interactive elements to pass 3:1 contrast. [IBM Carbon: color overview](https://carbondesignsystem.com/elements/color/overview/)
4. **Assign least-used slots in the specified order.** Use all twelve before reuse, but preserve stable assignment across reload, reorder, deletion/undo, and migration.
5. **Do not communicate status with these colors.** Red, yellow, and green here identify Folders, so status/error/success should continue to use iconography and text as well as color. Fluent reserves semantic colors for meaning and says they should not be decorative. [Microsoft Fluent 2: Color](https://fluent2.microsoft.design/color)
6. **Do not tint controls or thumbnail gaps.** One chromatic plane per Folder is enough; neutral controls and spacing reduce visual noise.
7. **Test in context, not as isolated swatches.** Validate with bright, dark, and highly saturated thumbnails, at compact Dock scale, in ordinary and dim room lighting, and with common color-vision-deficiency simulations.

## Acceptance checks before implementation

- The hover/focus border measures at least **3:1** against both its Folder surface and the Dock background; because the stroke is 1px, prefer meaningful headroom over exactly 3:1.
- White control icons measure at least **3:1** against their dark neutral circular control surface; any small text should meet **4.5:1** under WCAG 2.2. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- In a 12-Folder contact sheet, adjacent tiles remain distinguishable under protanopia, deuteranopia, and tritanopia simulation without relying on color to determine functionality.
- The first six remain the clearest set; slots 7–12 are acceptable overflow, not the default visual target.
- Hovering never changes the default surface color.
- Thumbnails remain more salient than the Folder fill, and the add/delete controls remain legible over every surface.

## Recommendation

Prototype this palette as a reversible design token set before restoring colors in the release UI. Review two variants side by side:

- **Recommended:** all twelve available, with the first six assigned first and the overflow six used only when needed.
- **Quieter fallback:** cycle only the six primary surfaces, then reuse them; this follows Spectrum's perceptual guidance more closely and may be more coherent at DockSnip's small tile size.

Do not choose the final palette from a swatch sheet alone. The deciding artifact should be a realistic Dock containing mixed screenshots, compacted tiles, hover/focus states, and at least one empty Folder.
