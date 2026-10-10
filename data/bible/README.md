# King James Bible dataset

`kjv.json` is the complete text of the King James (Authorized) Version, 66 books, loaded into the `bible_verses` table by the database commands. See [docs/DATABASE.md](../../docs/DATABASE.md) for how and when it is loaded.

## Source

|                                     |                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Publisher                           | eBible.org                                                                                        |
| Edition                             | "King James (Authorized) Version", the standardized text of 1769, protocanon only (`eng-kjv2006`) |
| File                                | `https://ebible.org/Scriptures/eng-kjv2006_usfm.zip`                                              |
| Retrieved                           | 9 October 2026                                                                                    |
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

## How the text was reduced

`scripts/bible/build-dataset.mjs` reads the publisher's USFM files and keeps verse text only. Spelling, capitals, and punctuation are untouched. Removed:

- Strong's numbers and all USFM markup
- footnotes and cross-references
- the marking of words supplied by the translators (italics in print; the words themselves are kept)
- paragraph marks (¶)
- headings that are not verse text: book titles, the Hebrew letter headings of Psalm 119, the subscriptions at the end of the epistles, and **the titles of the Psalms** ("A Psalm of David.")

The last is a real omission: 116 psalms have a title that printed Bibles set above verse 1, and it is not stored. Restoring it needs a place for text that belongs to a chapter and not to a verse.

## How it was checked

- Counts: 66 books, 1,189 chapters, 31,102 verses.
- Against the publisher's own verse-per-line export of the same edition (`eng-kjv2006_vpl.zip`): identical in every verse once that file's bracket and paragraph marks are removed, apart from the 116 psalm titles it runs into verse 1.
- Against an independent copy (scrollmapper/bible_databases, `KJV.json`): the same words in 30,824 of 31,102 verses. The rest differ in the spelling of names, hyphenation, or the psalm titles.

## Replacing the text

1. Download and unzip the publisher's USFM archive.
2. `node scripts/bible/build-dataset.mjs <folder>` rewrites `kjv.json` and `src/features/scripture/versification.ts`, and prints the counts and checksum.
3. Update `committedChecksum` in `scripts/bible/dataset.mjs` and the tables above.
4. `npm run test`, then commit. Each database reloads itself the next time its migrate command runs.

If verse counts change, references already saved on ideas may point at verses that no longer exist; check before deploying.
