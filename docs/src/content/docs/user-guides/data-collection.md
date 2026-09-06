---
title: Data collection guide
description: Capture a solid Relab record with clear hierarchy, media, and reference data.
---

A good record captures what the product is, how it comes apart, and the evidence you collected.
Photos and notes are often worth more than a perfectly filled form.

## Before you start

- Make sure you can sign in.
- Prepare a workspace with good lighting and enough room for separated components.
- Gather the tools needed for safe disassembly.
- Decide what you will capture during disassembly and what you will add afterwards.

## Recommended workflow

1. Create a top-level product record for the item you are about to document, such as a cordless
   drill.
1. Add identifying metadata: name, brand, model, and descriptive notes.
1. Record initial media for the intact product.
1. As disassembly progresses, create child records for meaningful components or subassemblies.
1. Attach images, files, measurements, and notes to the most appropriate record level.
1. Link product types, categories, or materials where you are reasonably confident.

## When to create a child component

Create a child record when:

- the part is functionally meaningful
- the part has distinct material or circularity relevance
- the part needs its own images or notes
- the part may be useful in later comparison across products

:::tip[A useful rule of thumb]
If you would photograph it separately and write notes about it specifically, it probably deserves
its own record. A battery pack is a component. A single screw usually is not.
:::

## Practical modeling advice

- Use parent-child product links to represent the physical breakdown of the object.
- Keep free-text notes for uncertainty, unusual joins, damage, or ambiguous materials.
- Use circularity notes for concise observations about recyclability, disassemblability, and
  remanufacturability. Leave them empty when there is no useful observation yet.
- Photograph anything a later reader might want to check.

:::note[Partial is fine]
If you are not sure, say so in the record. "Likely polypropylene, unconfirmed" is more useful than
a guess.
:::

## Good notes often include

- disassembly difficulty
- destructive versus non-destructive steps
- uncertainty about materials
- wear, damage, or contamination
- reasons for modeling decisions made while documenting the product

## Measurements

Physical properties are the item's overall size in centimetres (width, height, depth as it sits in
front of you) and its mass in grams. Enter what you measured. Leave a field empty rather than
typing `0`: empty means "not recorded", zero means a weightless or flat object. Sub-gram masses
(screws, clips) are fine as decimals.

The circularity notes ask for three observations. *Disassemblability* is how easily the item comes
apart and whether doing so damages the parts: tools needed, glued or welded joins, and anything you
had to break. *Recyclability* and *remanufacturability* are the same kind of observation about the
materials and the reusable assemblies. Uncertain notes are welcome.

The [Glossary](../glossary/) defines every other term.

## Reference data

Use materials, categories, taxonomies, and product types when they improve consistency. If no entry
fits, leave the field empty rather than picking the closest match.

## Media capture

Attach media in two ways:

- manual upload of files and images
- device-assisted capture through the Raspberry Pi camera integration

Use image uploads for display photos. Use file uploads for research documents and scientific
datasets (hyperspectral ENVI, HDF5, NITF, GeoTIFF); Relab stores those without image processing.

Every signed-in, verified account can upload images. Only a lab account sees the "Research files"
block on a record it owns. Ask an administrator if you need the lab role.

For the camera integration, see [RPi camera integration](../rpi-cam/).

## Upload limits

Accepted types and size limits:

- Images (up to 10 MiB): `.bmp`, `.gif`, `.jpeg`, `.jpg`, `.png`, `.webp`
- Research files (up to 50 MiB): `.csv`, `.docx`, `.json`, `.md`, `.pdf`, `.pptx`, `.tsv`, `.txt`,
  `.xlsx`
- Scientific data (up to 50 MiB): `.dat`, `.h5`, `.hdr`, `.hdf5`, `.img`, `.nitf`, `.ntf`, `.raw`,
  `.tif`, `.tiff`

Relab validates type, size, and content before storing a file, and unpacks and inspects office
files. If malware scanning is enabled, flagged files are rejected.

Each account also has a cap on total file count and storage, set by its role:

| Role          | Files  | Storage  |
| ------------- | ------ | -------- |
| `contributor` | 1000   | 1024 MB  |
| `lab`         | 20 000 | 20480 MB |

Operators tune both tiers through `MAX_UPLOAD_FILES_PER_USER` and `MAX_UPLOAD_BYTES_PER_USER_MB`
for contributors, and `MAX_UPLOAD_FILES_PER_LAB_USER` and `MAX_UPLOAD_BYTES_PER_LAB_USER_MB` for
lab accounts. An upload over either cap is rejected; deleting media releases its quota.

## Final check

- Verify component-parent relations are correct.
- Make sure important images are attached to the right record.
- Add missing notes while the work is still fresh.
- Normalize product types or materials where possible.
- Keep "unconfirmed" notes as they are. Do not replace them with guesses.
