/**
 * Illustrative content for the marketing preview only. This is not real
 * data and not the Phase 2 domain model. The sermon titles are taken from the
 * owner's own list of ideas; the points and references were written to suit.
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
    title: "His Grace is Sufficient",
    scripture: "2 Corinthians 12:7–10",
    note: "Developing",
  },
  {
    kind: "Point idea",
    title: "Strength is made perfect in weakness",
    scripture: "2 Corinthians 12:9",
    note: "Used in 2 sermons",
  },
  {
    kind: "Undecided",
    title: "The story isn't over",
    scripture: "Genesis 50:20",
    note: "Captured",
  },
  {
    kind: "Sermon idea",
    title: "It is Well",
    scripture: "2 Kings 4:8–37",
    note: "Preached",
  },
  {
    kind: "Point idea",
    title: "Faith speaks before it sees",
    scripture: "2 Kings 4:26",
    note: "Used in 1 sermon",
  },
  {
    kind: "Sermon idea",
    title: "A Still Small Voice",
    scripture: "1 Kings 19:11–13",
    note: "Idea",
  },
];

const [grace, strength, story, well, faith] = sampleIdeas;

/** A third sermon, so one point can be shown serving two. */
const notAlone: SampleIdea = {
  kind: "Sermon idea",
  title: "You're Not Alone",
  scripture: "Isaiah 41:10",
  note: "Idea",
};

/**
 * The library illustration: points on one side, sermons on the other. Each
 * point lists the positions of the sermons it serves, which is what the
 * connector lines draw.
 */
export const sampleLibrary = {
  points: [
    { idea: strength, sermons: [0, 1] },
    { idea: faith, sermons: [2] },
  ],
  sermons: [grace, notAlone, well],
  undecided: story,
};

/** One idea followed from first thought to pulpit, for the three stages. */
export const sampleJourney = {
  thought: story.title,
  capturedAt: "Tuesday, 9:14 pm",
  sermon: "The Story Isn't Over",
  scripture: "Genesis 50:15–21",
  point: "God meant it unto good",
  preachedOn: "Sunday morning, 14 June",
  preachedAt: "Grace Chapel",
};

export const samplePoint = {
  idea: strength,
  body: "Paul asked three times for the thorn to be taken away. The answer was not relief, but grace enough to bear it.",
  sermons: [grace, notAlone],
};
