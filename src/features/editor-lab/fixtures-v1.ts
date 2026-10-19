import type { JSONContent } from "@tiptap/core";

/*
 * Documents exactly as PS-1A's converter (schema v1) wrote them for the legacy
 * fixtures, captured before PS-1B.2A changed any code. They are the PS-1A
 * documents the v1 → v2 migration must keep loading. Generated once; never
 * edit by hand.
 */
export const v1Documents: Record<string, JSONContent> = {
  empty: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-empty",
      legacyRevision: 7,
    },
    content: [],
  },
  minimal: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-minimal",
      legacyRevision: 7,
    },
    content: [
      {
        type: "outlinePoint",
        attrs: {
          id: "min-1",
          legacyEntryId: "min-1",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "The one point",
              },
            ],
          },
        ],
      },
    ],
  },
  sections: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-sections",
      legacyRevision: 7,
    },
    content: [
      {
        type: "sermonIntroduction",
        attrs: {
          id: "sec-intro",
          legacyEntryId: "sec-intro",
          legacyRevision: 1,
          derivedFrom: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Introduction",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Open with a question.",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "sec-1",
          legacyEntryId: "sec-1",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "First point",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "sec-2",
          legacyEntryId: "sec-2",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Second point",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Explain.",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Apply.",
              },
            ],
          },
        ],
      },
      {
        type: "sermonConclusion",
        attrs: {
          id: "sec-end",
          legacyEntryId: "sec-end",
          legacyRevision: 1,
          derivedFrom: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Conclusion",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Call to respond.",
              },
            ],
          },
        ],
      },
    ],
  },
  nested: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-nested",
      legacyRevision: 7,
    },
    content: [
      {
        type: "outlinePoint",
        attrs: {
          id: "n-a",
          legacyEntryId: "n-a",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Level one, first",
              },
            ],
          },
          {
            type: "outlinePoint",
            attrs: {
              id: "n-a1",
              legacyEntryId: "n-a1",
              legacyRevision: 1,
              derivedFrom: null,
              sourcePointId: null,
              legacyParentId: null,
            },
            content: [
              {
                type: "entryTitle",
                content: [
                  {
                    type: "text",
                    text: "Level two",
                  },
                ],
              },
              {
                type: "outlinePoint",
                attrs: {
                  id: "n-a1x",
                  legacyEntryId: "n-a1x",
                  legacyRevision: 1,
                  derivedFrom: null,
                  sourcePointId: null,
                  legacyParentId: null,
                },
                content: [
                  {
                    type: "entryTitle",
                    content: [
                      {
                        type: "text",
                        text: "Level three",
                      },
                    ],
                  },
                  {
                    type: "outlinePoint",
                    attrs: {
                      id: "n-a1x1",
                      legacyEntryId: "n-a1x1",
                      legacyRevision: 1,
                      derivedFrom: null,
                      sourcePointId: null,
                      legacyParentId: null,
                    },
                    content: [
                      {
                        type: "entryTitle",
                        content: [
                          {
                            type: "text",
                            text: "Level four",
                          },
                        ],
                      },
                      {
                        type: "outlinePoint",
                        attrs: {
                          id: "n-a1x1i",
                          legacyEntryId: "n-a1x1i",
                          legacyRevision: 1,
                          derivedFrom: null,
                          sourcePointId: null,
                          legacyParentId: null,
                        },
                        content: [
                          {
                            type: "entryTitle",
                            content: [
                              {
                                type: "text",
                                text: "Level five",
                              },
                            ],
                          },
                          {
                            type: "outlinePoint",
                            attrs: {
                              id: "n-a1x1ii",
                              legacyEntryId: "n-a1x1ii",
                              legacyRevision: 1,
                              derivedFrom: null,
                              sourcePointId: null,
                              legacyParentId: null,
                            },
                            content: [
                              {
                                type: "entryTitle",
                                content: [
                                  {
                                    type: "text",
                                    text: "Level six",
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "outlinePoint",
            attrs: {
              id: "n-a2",
              legacyEntryId: "n-a2",
              legacyRevision: 1,
              derivedFrom: null,
              sourcePointId: null,
              legacyParentId: null,
            },
            content: [
              {
                type: "entryTitle",
                content: [
                  {
                    type: "text",
                    text: "Level two, second",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "n-b",
          legacyEntryId: "n-b",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Level one, second",
              },
            ],
          },
          {
            type: "outlinePoint",
            attrs: {
              id: "n-b1",
              legacyEntryId: "n-b1",
              legacyRevision: 1,
              derivedFrom: null,
              sourcePointId: null,
              legacyParentId: null,
            },
            content: [
              {
                type: "entryTitle",
                content: [
                  {
                    type: "text",
                    text: "Under the second",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  custom: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "custom",
        levels: [
          {
            counter: "roman",
            case: "upper",
            bullet: "•",
            prefix: "POINT ",
            suffix: ":",
            composite: false,
            separator: ".",
          },
          {
            counter: "alpha",
            case: "lower",
            bullet: "•",
            prefix: "(",
            suffix: ")",
            composite: false,
            separator: ".",
          },
          {
            counter: "decimal",
            case: "upper",
            bullet: "•",
            prefix: "",
            suffix: ".",
            composite: true,
            separator: ".",
          },
        ],
        overflow: "repeat",
        repeatFrom: 1,
      },
      legacyOutlineId: "fx-custom",
      legacyRevision: 7,
    },
    content: [
      {
        type: "sermonIntroduction",
        attrs: {
          id: "c-intro",
          legacyEntryId: "c-intro",
          legacyRevision: 1,
          derivedFrom: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Introduction",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "c-a",
          legacyEntryId: "c-a",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Main",
              },
            ],
          },
          {
            type: "outlinePoint",
            attrs: {
              id: "c-a1",
              legacyEntryId: "c-a1",
              legacyRevision: 1,
              derivedFrom: null,
              sourcePointId: null,
              legacyParentId: null,
            },
            content: [
              {
                type: "entryTitle",
                content: [
                  {
                    type: "text",
                    text: "Sub",
                  },
                ],
              },
              {
                type: "outlinePoint",
                attrs: {
                  id: "c-a1x",
                  legacyEntryId: "c-a1x",
                  legacyRevision: 1,
                  derivedFrom: null,
                  sourcePointId: null,
                  legacyParentId: null,
                },
                content: [
                  {
                    type: "entryTitle",
                    content: [
                      {
                        type: "text",
                        text: "Composite",
                      },
                    ],
                  },
                  {
                    type: "outlinePoint",
                    attrs: {
                      id: "c-a1x1",
                      legacyEntryId: "c-a1x1",
                      legacyRevision: 1,
                      derivedFrom: null,
                      sourcePointId: null,
                      legacyParentId: null,
                    },
                    content: [
                      {
                        type: "entryTitle",
                        content: [
                          {
                            type: "text",
                            text: "Overflow repeats from level two",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "c-b",
          legacyEntryId: "c-b",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Second main",
              },
            ],
          },
        ],
      },
    ],
  },
  reusedPoints: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-reused",
      legacyRevision: 7,
    },
    content: [
      {
        type: "outlinePoint",
        attrs: {
          id: "r-1",
          legacyEntryId: "r-1",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: "saved-grace",
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Grace that saves",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "r-2",
          legacyEntryId: "r-2",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: "saved-grace",
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Grace that teaches",
              },
            ],
          },
          {
            type: "outlinePoint",
            attrs: {
              id: "r-2a",
              legacyEntryId: "r-2a",
              legacyRevision: 1,
              derivedFrom: null,
              sourcePointId: "saved-faith",
              legacyParentId: null,
            },
            content: [
              {
                type: "entryTitle",
                content: [
                  {
                    type: "text",
                    text: "Faith comes by hearing",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  passages: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-passages",
      legacyRevision: 7,
    },
    content: [
      {
        type: "outlinePoint",
        attrs: {
          id: "p-1",
          legacyEntryId: "p-1",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Ten passages, in their stored order",
              },
            ],
          },
          {
            type: "entryPassages",
            content: [
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref1",
                  book: 19,
                  chapterStart: 12,
                  verseStart: 6,
                  chapterEnd: null,
                  verseEnd: 7,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref2",
                  book: 19,
                  chapterStart: 119,
                  verseStart: 105,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref3",
                  book: 55,
                  chapterStart: 3,
                  verseStart: 16,
                  chapterEnd: null,
                  verseEnd: 17,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref4",
                  book: 58,
                  chapterStart: 4,
                  verseStart: 12,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref5",
                  book: 23,
                  chapterStart: 40,
                  verseStart: 8,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref6",
                  book: 40,
                  chapterStart: 24,
                  verseStart: 35,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref7",
                  book: 60,
                  chapterStart: 1,
                  verseStart: 23,
                  chapterEnd: null,
                  verseEnd: 25,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref8",
                  book: 20,
                  chapterStart: 30,
                  verseStart: 5,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref9",
                  book: 43,
                  chapterStart: 17,
                  verseStart: 17,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-1#ref10",
                  book: 45,
                  chapterStart: 10,
                  verseStart: 17,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "p-2",
          legacyEntryId: "p-2",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Whole chapter, across chapters, a one-chapter book",
              },
            ],
          },
          {
            type: "entryPassages",
            content: [
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-2#ref1",
                  book: 19,
                  chapterStart: 23,
                  verseStart: null,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-2#ref2",
                  book: 1,
                  chapterStart: 1,
                  verseStart: 1,
                  chapterEnd: 2,
                  verseEnd: 3,
                },
              },
              {
                type: "scriptureReference",
                attrs: {
                  id: "p-2#ref3",
                  book: 65,
                  chapterStart: 1,
                  verseStart: 3,
                  chapterEnd: null,
                  verseEnd: null,
                },
              },
            ],
          },
        ],
      },
    ],
  },
  whitespace: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-whitespace",
      legacyRevision: 7,
    },
    content: [
      {
        type: "outlinePoint",
        attrs: {
          id: "w-1",
          legacyEntryId: "w-1",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Blank lines",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "First",
              },
            ],
          },
          {
            type: "paragraph",
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Second",
              },
            ],
          },
          {
            type: "paragraph",
          },
          {
            type: "paragraph",
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Third",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "w-2",
          legacyEntryId: "w-2",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Edges",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "  leading and trailing  ",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "w-3",
          legacyEntryId: "w-3",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Trailing newline",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Ends with a newline",
              },
            ],
          },
          {
            type: "paragraph",
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "w-4",
          legacyEntryId: "w-4",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Only newlines",
              },
            ],
          },
          {
            type: "paragraph",
          },
          {
            type: "paragraph",
          },
          {
            type: "paragraph",
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "w-5",
          legacyEntryId: "w-5",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Empty string",
              },
            ],
          },
          {
            type: "paragraph",
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "w-6",
          legacyEntryId: "w-6",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Tabs and spaces",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "\tindented",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "    four spaces",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: " \t ",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "w-7",
          legacyEntryId: "w-7",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Carriage return",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Windows\r",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "line",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "w-8",
          legacyEntryId: "w-8",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "  padded title  ",
              },
            ],
          },
        ],
      },
    ],
  },
  malformed: {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: {
        version: 1,
        preset: "traditional",
      },
      legacyOutlineId: "fx-malformed",
      legacyRevision: 7,
    },
    content: [
      {
        type: "sermonIntroduction",
        attrs: {
          id: "m-intro",
          legacyEntryId: "m-intro",
          legacyRevision: 1,
          derivedFrom: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Introduction",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "m-a",
          legacyEntryId: "m-a",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "A fine main point",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "m-b",
          legacyEntryId: "m-b",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: null,
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Shares position 0 with A",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "m-orphan",
          legacyEntryId: "m-orphan",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: "no-such-entry",
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Names a parent that is gone",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "m-under-intro",
          legacyEntryId: "m-under-intro",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: "m-intro",
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Under the introduction",
              },
            ],
          },
        ],
      },
      {
        type: "outlinePoint",
        attrs: {
          id: "m-loop-x",
          legacyEntryId: "m-loop-x",
          legacyRevision: 1,
          derivedFrom: null,
          sourcePointId: null,
          legacyParentId: "m-loop-y",
        },
        content: [
          {
            type: "entryTitle",
            content: [
              {
                type: "text",
                text: "Loop X",
              },
            ],
          },
          {
            type: "outlinePoint",
            attrs: {
              id: "m-loop-y",
              legacyEntryId: "m-loop-y",
              legacyRevision: 1,
              derivedFrom: null,
              sourcePointId: null,
              legacyParentId: null,
            },
            content: [
              {
                type: "entryTitle",
                content: [
                  {
                    type: "text",
                    text: "Loop Y",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
