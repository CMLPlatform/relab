---
title: Data collection guide
description: Capture a solid RELab record with clear hierarchy, media, and reference data.
---

A good record captures what the product is, how it comes apart, and what evidence you collected along the way. Photos and notes are often more valuable than a perfectly filled form.

## Before you start

- Make sure you can sign in.
- Prepare a workspace with good lighting and enough room for separated components.
- Gather the tools needed for safe disassembly.
- Decide what you will capture during disassembly and what you will add afterwards.

## Recommended workflow

1. Create a top-level product record for the item you are about to document, such as a cordless drill.
1. Add identifying metadata: name, brand, model, and descriptive notes.
1. Record initial media for the intact product.
1. As disassembly progresses, create child records for meaningful components or subassemblies.
1. Attach images, files, measurements, and notes to the most appropriate record level.
1. Link product types, categories, or materials where those observations are known with reasonable confidence.

## When to create a child component

Create a child record when:

- the part is functionally meaningful
- the part has distinct material or circularity relevance
- the part needs its own images or notes
- the part may be useful in later comparison across products

!!! tip "A useful rule of thumb"
If you would photograph it separately and write notes about it specifically, it probably deserves its own record. A battery pack is a component. A single screw usually is not.

## Practical modeling advice

- Use parent-child product links to represent the physical breakdown of the object.
- Keep free-text notes for uncertainty, unusual joins, damage, or ambiguous materials.
- Use circularity notes for concise observations about recyclability, disassemblability, and remanufacturability. Leave them empty when there is no useful observation yet.
- Treat images as part of the research record, not as decorative attachments.

!!! note "Partial is fine"
Do not force precision where the evidence does not support it. A partial observation such as "likely polypropylene, unconfirmed" is more useful than invented detail.

## Good notes often include

- disassembly difficulty
- destructive versus non-destructive steps
- uncertainty about materials
- wear, damage, or contamination
- reasons for modeling decisions made while documenting the product

## Reference data

Use materials, categories, taxonomies, and product types when they improve consistency. Do not force a taxonomy entry when the evidence is weak; a missing link is clearer than a wrong one.

## Media capture

Attach media in two ways:

- manual upload of files and images
- device-assisted capture through the Raspberry Pi camera integration

If you are using the camera integration, see [RPI camera integration](../rpi-cam/).

## Final check

- Verify component-parent relations are correct.
- Make sure important images are attached to the right record.
- Add missing notes while the work is still fresh.
- Normalize product types or materials where possible.
- Leave uncertainty explicit rather than silently resolving it.
