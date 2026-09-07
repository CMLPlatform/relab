---
title: Glossary
description: What the words in Relab mean, in plain language.
---

Relab borrows its vocabulary from circular-economy research. Each term below is defined in
ordinary words, with what Relab expects you to put in the field that carries it.

You do not need to learn any of this before you start. Every field that uses one of these terms
carries a short version of the same explanation next to it.

## Records

### Record

One entry in Relab. A record is either a whole product or one component taken out of another
record. Both hold the same fields.

### Product

The whole item you started with, such as a cordless drill. A product is the top of a record
tree: it has no parent.

### Component

A part taken out of a product, such as a battery pack or a motor. A component is a record
with a parent, and it can hold components of its own. The tree has no depth limit.

Create a component when the part is worth its own photos and notes. See
[When to create a child component](/user-guides/data-collection/#when-to-create-a-child-component)
for where to draw the line.

### Teardown

One session in which somebody takes a product apart and records what they find. A finished
teardown is a product record with its components under it.

### Amount

How many of a component the parent contains. Four identical screws in one housing are one
component record with an amount of 4, not four records.

## Measurements

### Physical properties

The item's size and weight, measured as it sits in front of you. Width, height, and depth are
in centimetres; weight is in grams. Record a sub-gram weight, such as a clip, as a decimal.

Leave a field empty if you did not measure it. An empty field means "not recorded". Do not type
`0` instead: Relab rejects it, because a zero claims the object really is flat or weightless.

### Circularity

How well a product's materials and parts can be recovered and used again once it reaches the
end of its life. The three circularity notes record it.

### Circularity notes

Three free-text observations you can add to any record. Write what you saw. An uncertain note is
more useful than a confident guess. If you have neither, leave the note empty.

### Recyclability

What the parts are made of, and whether those materials can be separated and recovered.

Example: "Housing likely polypropylene, unconfirmed — no resin code moulded in."

### Disassemblability

How easily the product comes apart into its parts, and whether that damages them. Tools
needed, glued or welded joins, and anything you had to break all count.

Example: "Opens with 6 Torx T10; battery is glued, had to be prised."

### Remanufacturability

Whether whole parts could be cleaned up and used again in another product.

Example: "Motor and gearbox look reusable; control board is potted."

## Reference data

The shared lists you pick from: materials, categories, taxonomies, and product types. They exist so that two people describing the same thing use the
same words.

If no entry fits, leave the field empty. Do not pick the closest match.

### Product type

What kind of thing the item is, picked from a shared list rather than typed. Most entries come
from CPV.

### CPV

Common Procurement Vocabulary, a standard European list of product categories. Relab uses it so
that researchers can compare and count records across teardowns. You browse it by category and
pick the closest match. The code itself never appears in the app.

### Category

A branch of the product-type list, such as tools or furniture. Categories group product types.
They are not a separate label on your record.

### Taxonomy

One named classification scheme. CPV is a taxonomy. Relab can hold more than one.

### Material

What a part is made of, picked from a shared list. Attach a material to the record it describes,
which is usually a component rather than the whole product.

## The project

### 9R framework

Nine strategies for keeping products and materials in use, from refusing a product outright to
recovering its energy. They motivate the project and give the wordmark its nine.

Relab does **not** tag your records with an R-strategy. See
[The 9R framework](/project/9r-framework/) for the strategies themselves.

### Dataset release

A published snapshot of Relab's records, as files anybody can download and cite. Contributors
are credited collectively, not against individual rows. See
[Dataset](/project/dataset/) and the [Dataset codebook](/project/codebook/).

## Media and devices

### Media

Photos, videos, and files attached to a record. Photos often carry more evidence than the form
fields, so attach anything a later reader might want to check.

### Research file

A non-image file attached to a record, such as a spreadsheet or a measurement dataset. Relab
stores these unchanged, without image processing.

### RPi camera

An optional Raspberry Pi camera rig that sends photos straight into a record. You set it up once
per camera, and the integration stays off until you turn it on. See
[RPi camera integration](/user-guides/rpi-cam/).

### Pairing code

A six-character code the Raspberry Pi shows on its setup page or in its startup logs. Enter it
in Relab once to connect that camera to your account.

## Accounts

### Verified

An account whose email address has been confirmed. You can browse Relab without an account, and
you can sign in without verifying. You need a verified email address to create records.

### Two-step verification

A second check at sign-in, on top of your password, using a code from an authenticator app.
Also called MFA (multi-factor authentication) or 2FA.

### Profile visibility

Who can see your contributor profile: everyone, signed-in users only, or nobody. On the
private setting your uploads stay anonymous.
