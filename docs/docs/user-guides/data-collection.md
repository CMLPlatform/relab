# Data Collection Guide

A good record captures the original product identity, the component hierarchy that emerges during disassembly, the media and measurements taken along the way, and any material or category observations you can make with confidence.

## Before You Start

- Make sure you can sign in.
- Prepare a workspace with good lighting and enough room for separated components.
- Gather the tools needed for safe disassembly.
- Decide what you will capture during disassembly and what you will add afterwards.

## Recommended Workflow

1. Create a top-level product record for the item you are about to document (e.g. a cordless drill).
1. Add identifying metadata: name, brand, model, and descriptive notes.
1. Record initial media for the intact product.
1. As disassembly progresses, create child records for meaningful components or subassemblies.
1. Attach images, files, measurements, and notes to the most appropriate record level.
1. Link product types, categories, or materials where those observations are known with reasonable confidence.

## When to Create a Child Component

Create a child record when:

- the part is functionally meaningful
- the part has distinct material or circularity relevance
- the part needs its own images or notes
- the part may be useful in later comparison across products

!!! tip "A useful rule of thumb"
If you would photograph it separately and write notes about it specifically, it probably deserves its own record. A battery pack is a component. A single screw usually is not.

## Practical Modeling Advice

- Use parent-child product links to represent the physical breakdown of the object.
- Keep free-text notes for uncertainty, unusual joins, damage, or ambiguous materials.
- Treat images as part of the research record, not as decorative attachments.

!!! note "Partial is fine"
Do not force precision where the evidence does not support it. A partial observation such as "likely polypropylene, unconfirmed" is more useful than invented detail.

## Good Notes Often Include

- disassembly difficulty
- destructive versus non-destructive steps
- uncertainty about materials
- wear, damage, or contamination
- reasons for modeling decisions made while documenting the product

## Reference Data

Use materials, categories, taxonomies, and product types when they improve consistency. Do not force a taxonomy entry when the evidence is weak; a missing link is clearer than a wrong one.

## Media Capture

Attach media in two ways:

- manual upload of files and images
- device-assisted capture through the Raspberry Pi camera integration

If you are using the camera integration, see [RPI Camera Integration](rpi-cam.md).

<!-- TODO: screenshot → static/images/screenshots/product-hierarchy.png
<figure markdown>
  ![A documented power tool broken into child components in the app](../static/images/screenshots/product-hierarchy.png){ loading=lazy }
  <figcaption>A disassembled cordless drill: battery pack, motor assembly, and housing as child records</figcaption>
</figure>
-->

## Final Check

- Verify component-parent relations are correct.
- Make sure important images are attached to the right record.
- Add missing notes while the work is still fresh.
- Normalize product types or materials where possible.
- Leave uncertainty explicit rather than silently resolving it.
