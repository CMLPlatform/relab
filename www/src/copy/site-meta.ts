const siteMeta = {
  defaultDescription:
    'Relab is an open-source research platform for documenting teardowns of durable goods and organising the resulting product data.',
  heroTitle: 'Open product data for circular-economy research',
  // Says what is true today. The records are browsable as they are collected;
  // the licensed dataset release does not exist yet, so the hero does not
  // promise one. The terms live in the colophon, which links the docs.
  heroNutshell:
    'Relab documents how durable goods come apart: every component named, weighed and photographed. The records are open to browse as they are collected.',
  name: 'Relab',
  organization: 'CML, Leiden University',
  title: 'Relab',
};

/**
 * Research provenance, shown in the hero (affiliation) and the colophon.
 * Sourced from the repository's own CITATION.cff so the two cannot drift.
 */
export const research = {
  affiliation:
    'A research platform of the Institute of Environmental Sciences (CML), Leiden University',
  institution: 'Institute of Environmental Sciences (CML), Leiden University',
  authors: 'Simon van Lierde and Franco Donati, Department of Industrial Ecology, CML',
  citationUrl: 'https://doi.org/10.5281/zenodo.19703316',
  doi: '10.5281/zenodo.19703316',
  // The code licence. The dataset's own terms are deliberately not stated here:
  // ODbL 1.0 is planned for curated releases that do not exist yet, and the
  // docs are the one canonical statement of that (see dataLicenceUrl).
  licence: 'AGPL-3.0-or-later',
  licenceUrl: 'https://github.com/CMLPlatform/relab/blob/main/LICENSE',
  funding:
    'Leiden University Starter Fund; the Depack grant (Leiden University Fund); Sectorplan Gelden',
};

export const siteLinks = {
  github: 'https://github.com/CMLPlatform/relab',
  linkedin: 'https://www.linkedin.com/groups/15671021',
  youtube: 'https://www.youtube.com/@open_product_data',
};

export { siteMeta };
