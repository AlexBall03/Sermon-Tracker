/**
 * Illustrative content for the marketing preview only. This is not real
 * data and not the Phase 2 domain model.
 */
export type SampleIdea = {
  kind: "Sermon idea" | "Point idea" | "Undecided";
  title: string;
  scripture: string;
  note: string;
};

export const sampleIdeas: SampleIdea[] = [
  {
    kind: "Sermon idea",
    title: "The Patience of the Farmer",
    scripture: "James 5:7–11",
    note: "Developing",
  },
  {
    kind: "Point idea",
    title: "Waiting is not the same as idleness",
    scripture: "James 5:7",
    note: "Used in 2 sermons",
  },
  {
    kind: "Undecided",
    title: "Why does Jonah end with a question?",
    scripture: "Jonah 4:11",
    note: "Captured",
  },
  {
    kind: "Sermon idea",
    title: "Planted by Streams of Water",
    scripture: "Psalm 1",
    note: "Preached",
  },
  {
    kind: "Point idea",
    title: "Delight comes before fruit",
    scripture: "Psalm 1:2–3",
    note: "Used in 1 sermon",
  },
];
