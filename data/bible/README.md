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

# Reina-Valera Gómez dataset

`rvg.json` is the complete text of the Santa Biblia Reina-Valera Gómez, 66 books, in the same shape as `kjv.json`, loaded into `scripture_verses` under the translation `rvg`. `rvg-psalm-titles.json` holds the headings it prints above its psalms. Neither file is edited by hand: both are written by `scripts/bible/build-rvg.mjs` from the publisher's own file. In the application the translation is shown as **RVG**; the revision year is recorded here and is not shown.

## Source

|                            |                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Publisher                  | The translation's own site, reinavaleragomez.com ("RVG Source text for computer usage")           |
| Revision                   | RVG 2023 (the file is named `RVG23-RLI-20251028`, dated 28 October 2025)                          |
| File                       | `https://www.reinavaleragomez.com/audio/RVG23-RLI-20251028.txt.zip`                               |
| Retrieved                  | 12 October 2026                                                                                   |
| SHA-256 of the archive     | `4f365c9fc5cb2a974926a18c8b68af99dd69547fa16ccbebe558570489654cfd`                                |
| SHA-256 of the text inside | `d6639ef05239fb51f432ca68a4a82182b8a0bd57cb300d360ca4d9d953f3ccc4`                                |
| Copyright                  | Copyright 2004, 2010, 2023 by Dr. Humberto Gómez Caballero. Derechos reservados / Rights reserved |

The site refuses a request without a browser's User-Agent (HTTP 406); download it in a browser, or with one named. Both hashes are recorded in `scripts/bible/dataset.mjs` (`rvgSource`) and the builder refuses any other file.

The publisher's stated terms, as carried with the text: it may not be printed or reproduced for profit; churches and organizations may reproduce it for free distribution without royalties, provided none of its words are changed. The owner reviewed these terms for this project. Accordingly: the wording is never altered, the text is never placed behind payment, and this attribution is kept.

## Contents

|                        |                                                                    |
| ---------------------- | ------------------------------------------------------------------ |
| Books                  | 66                                                                 |
| Chapters               | 1,189                                                              |
| Verses                 | 31,102                                                             |
| Checksum of the text   | `31853733f2bf79164e2346a001f0cc273e508121706de07abaac83791830a745` |
| Psalm titles           | 123                                                                |
| Checksum of the titles | `c6af8842376c37907593f01028beecab37bd5efa74fbc478be6ddb8c98d15ca2` |

Both checksums are computed as the King James ones are, and are recorded in `datasets.rvg` in `scripts/bible/dataset.mjs`; a test fails if a file and its recorded value disagree.

## Verse numbering

The publisher's file is 31,102 lines, one verse to a line, **with no references**: a line's position is the only thing that says which verse it is. The Reina-Valera Gómez numbers its chapters and verses as the King James does, so the builder lays the file over the King James verse counts. That fit is not assumed. The builder refuses to write unless the file has exactly 31,102 non-empty lines, every one of the 66 books opens on that book's own first verse, and a further list of verses where a slip of one line would show (Genesis 50:26, Psalm 3:1, Psalm 119:73, Malachi 4:6, Acts 8:37, 1 John 5:7, 3 John 14, Revelation 12:17, 13:1, and 22:21) is where it should be.

Because the numbering is shared, a reference (on an idea, in a favorite, in the reader's address) is the same passage in either translation, and `versification.ts` serves both. A test asserts that the two datasets have the same verse count in every chapter.

## How the text was reduced

The same rules as for the King James, and no wording is changed:

- `[word]` marks words supplied by the translators (italics in print): the brackets are removed and the words kept, including inside a word (`e[n]` is "en").
- `<…>` marks the words of Christ: the marks are removed and the words kept.
- `«…»` at the head of a psalm's first verse is that psalm's heading: it is moved to `rvg-psalm-titles.json` and is no part of the verse. The builder refuses a `« »` anywhere else.
- The Hebrew letter names that head each eight verses of Psalm 119 ("ALEF.", "BET.") are headings, and are left out, as the King James's were. The builder requires exactly 22.
- Runs of spaces become one, edge spaces are trimmed, and text is normalized to NFC (one letter in the file was written as two code points).

Three things follow from taking the publisher's file as it stands, and are worth knowing:

- **123 headings, where the King James has 116.** The file sets "Aleluya" (Psalms 111, 112, 113, 135) and "Alabad a Jehová" (148, 149, 150) as headings, where the King James has "Praise ye the LORD" as the opening words of verse 1; and it gives Psalm 1 a supplied heading. They are stored as the file has them. A heading is not searched, selected, or copied.
- **Psalm 145's heading is inside verse 1** in the file ("Salmo de alabanza: de David. Te exaltaré…"), with no `« »`, so it stays in the verse.
- One verse has a space before a comma in the file. It is left as it is.

## How it was checked

- Counts: 66 books, 1,189 chapters, 31,102 verses; the anchors above.
- Against an independent copy that carries references (eBible.org `sparvg`, `sparvg_vpl.zip`, copyright line "2004, 2010, 2023", retrieved 12 October 2026, SHA-256 `01cae55662c2a29c2c02b3493a8d9ef1aeb04e2df42284d3c8ff680cac720e74`): all 31,102 verses are present there under the same references, and 31,082 have the same wording. The 20 that differ are small revisions (for example Matthew 27:3 "traicionado" for "entregado", Luke 14:16 "invitó" for "convidó"); the publisher's file, which is the later, is what is loaded. Run it again with `node scripts/bible/build-rvg.mjs <zip> --verify <sparvg_vpl.txt>`.
- **Not checked by machine against the 2010 revision.** eBible's module named `sparvg2010eb` now carries the current text, so it could not serve as a 2010 copy. That this is the 2023 revision rests on the publisher's own site and file name and on the agreement above.

## Replacing the text

1. Download the publisher's archive and update `rvgSource` in `scripts/bible/dataset.mjs` with its address and both hashes.
2. `node scripts/bible/build-rvg.mjs <the zip>` rewrites both files and prints the counts and checksums.
3. Update `datasets.rvg` in `scripts/bible/dataset.mjs` and the tables above.
4. `npm run test`, then commit. Each database reloads the translation the next time its migrate command runs.
