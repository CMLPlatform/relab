# Getting Started

RELab is a platform for documenting product disassembly. You create structured records of what a product is made of, how it comes apart, and what the components look like.

Those records are not just for private note-taking. The broader goal is that they can later be shared, compared, and reused as part of a larger open product-data infrastructure.

## Create an Account

1. Go to [app.cml-relab.org](https://app.cml-relab.org) or open [sign up](https://app.cml-relab.org/new-account).
1. Register with email and password, or sign in with GitHub or Google.
1. Verify your email if prompted. Some features only activate once the account is verified.

!!! tip "Fastest path in"
GitHub and Google OAuth skip the manual email-verification step. If you have access to either, use that.

## Your First Product

Once you're logged in, the core workflow is:

1. Create a **product record** for the item you're about to document (e.g. a power drill).
1. Add identifying information: name, brand, model, any initial notes.
1. Photograph the intact product before you open it.
1. As you disassemble, create **child records** for meaningful components (e.g. battery pack, motor assembly, housing).
1. Attach images, measurements, and notes at the level where they belong.

This workflow is intentionally simple enough to work in labs, workshops, and other collaborative settings. Over time, the aim is to support wider contribution by repairers, dismantlers, and citizen scientists without making the data structure unusable.

!!! note "Start simple"
A partial record with good photos and honest notes is usually more useful than an over-structured one that takes twice as long. You can fill in gaps later.

<!-- TODO: screenshot → static/images/screenshots/new-product-form.png
<figure markdown>
  ![New product form in the RELab app](../static/images/screenshots/new-product-form.png){ loading=lazy }
  <figcaption>Creating a product record</figcaption>
</figure>
-->

## Before You Start

- Prepare a workspace with enough space for the product and separated components.
- Good lighting matters more than fancy equipment, see [Hardware](hardware.md) for what works.
- Have a device ready for photos. A phone is fine; a camera rig is optional.

## Next Steps

- [Data Collection Guide](data-collection.md): how to build a thorough record
- [Hardware](hardware.md): simple and advanced capture setups
- [RPI Camera](rpi-cam.md): if you are using a camera device
- [API Guide](api.md): for scripts and technical integrations
