# King James Bible dataset

`kjv.json` is the complete text of the King James (Authorized) Version, 66 books, loaded into the `bible_verses` table by the database commands. `kjv-psalm-titles.json` holds the titles of the Psalms from the same source, loaded into `bible_psalm_titles`. Neither file is edited by hand: both are written by `scripts/bible/build-dataset.mjs`. See [docs/DATABASE.md](../../docs/DATABASE.md) for how and when it is loaded.

## Source

|                                     |                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Publisher                           | eBible.org                                                                                        |
| Edition                             | "King James (Authorized) Version", the standardized text of 1769, protocanon only (`eng-kjv2006`) |
| File                                | `https://ebible.org/Scriptures/eng-kjv2006_usfm.zip`                                              |
| Retrieved                           | 9 October 2026; again on 10 October 2026 for the psalm titles, the archive identical              |
| SHA-256 of the archive              | `5789dcd000d60a554abb4cf9b37ce10a53628bfc686e11ada2d6c981455239c1`                                |
| Licence, as stated by the publisher | Public Domain                                                                                     |

The publisher adds this note, which is the owner's decision to weigh and not a technical matter: letters patent with no expiry mean that printing this translation in the United Kingdom, or importing printed copies there, needs permission (Cambridge University Press, Oxford University Press, and Collins hold the right); outside the United Kingdom the work is in the public domain.

## Contents

|                      |                                                                    |
| -------------------- | ------------------------------------------------------------------ |
| Books                | 66                                                                 |
| Chapters             | 1,189                                                              |
| Verses               | 31,102                                                             |
| Checksum of the text | `32cf22df7ea6458cae45f962c8044677bfcfdb604fb059c9fc5f0b977f56a165` |

The checksum is SHA-256 over the parsed text (`checksum` in `scripts/bible/dataset.mjs`), not over the file's bytes, so a checkout that changes line endings does not change it. It is also recorded in that script as `committedChecksum`; a test fails if the file and the recorded value disagree.

Format: `books[book - 1][chapter - 1][verse - 1]` is the verse text. Books are in canonical order, Genesis (1) to Revelation (66).

## Psalm titles

|                        |                                                                    |
| ---------------------- | ------------------------------------------------------------------ |
| File                   | `kjv-psalm-titles.json`                                            |
| Titles                 | 116                                                                |
| Checksum of the titles | `8356d05fc4b2db0f08c647de3290d7e33ef18b08c9a995cc6f3b48ca4ede713f` |

These are the headings printed above verse 1 of many psalms ("A Psalm of David, when he fled from Absalom his son."). Format: an object from psalm number to title; a psalm without a title is absent. The checksum (`titlesChecksum` in `scripts/bible/dataset.mjs`) is SHA-256 over the titles as `[psalm, text]` pairs in psalm order, so the file's layout and line endings do not change it. It is recorded in that script as `committedTitlesChecksum`, and a test fails if the file and the recorded value disagree.

A title is not verse text. It is kept out of `kjv.json`, has no verse number, and is not among the 31,102 verses; adding the titles left `kjv.json`, its checksum, and `versification.ts` exactly as they were.

They were restored on 10 October 2026 (Phase 2C.1A) by the same builder from the same archive, downloaded again and matching the SHA-256 above. The builder now keeps the USFM `\d` lines of the Psalms instead of discarding them, reduces them with the same rules as verse text (no Strong's numbers, markup, or notes; wording, capitals, and punctuation untouched), refuses a title that is not before a psalm's first verse or is in any other book, and refuses any count but 116. Nothing was typed by hand.

## How the text was reduced

`scripts/bible/build-dataset.mjs` reads the publisher's USFM files and keeps verse text only. Spelling, capitals, and punctuation are untouched. Removed:

- Strong's numbers and all USFM markup
- footnotes and cross-references
- the marking of words supplied by the translators (italics in print; the words themselves are kept)
- paragraph marks (¶)
- headings that are not verse text: book titles, the Hebrew letter headings of Psalm 119, and the subscriptions at the end of the epistles

The titles of the Psalms are not verse text either, and are not in `kjv.json`; they are kept beside it (see "Psalm titles" above). Until Phase 2C.1A they were discarded with the other headings.

## How it was checked

- Counts: 66 books, 1,189 chapters, 31,102 verses.
- Against the publisher's own verse-per-line export of the same edition (`eng-kjv2006_vpl.zip`): identical in every verse once that file's bracket and paragraph marks are removed, apart from the 116 psalm titles it runs into verse 1.
- The psalm titles, against that same export: for every one of the 150 psalms, the export's verse 1 is exactly the title (where there is one) followed by our verse 1. 116 psalms with a title, 34 without, no differences.
- Against an independent copy (scrollmapper/bible_databases, `KJV.json`): the same words in 30,824 of 31,102 verses. The rest differ in the spelling of names, hyphenation, or the psalm titles.

## Replacing the text

1. Download and unzip the publisher's USFM archive.
2. `node scripts/bible/build-dataset.mjs <folder>` rewrites `kjv.json`, `kjv-psalm-titles.json`, and `src/features/scripture/versification.ts`, and prints the counts and both checksums.
3. Update `committedChecksum` and `committedTitlesChecksum` in `scripts/bible/dataset.mjs` and the tables above.
4. `npm run test`, then commit. Each database reloads itself the next time its migrate command runs.

If verse counts change, references already saved on ideas may point at verses that no longer exist; check before deploying.
