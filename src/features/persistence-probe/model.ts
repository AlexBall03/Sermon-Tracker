/*
 * What marks a sermon as the persistence probe's own (A2.3B.2D): its title.
 * Only such a sermon is ever deleted by the probe.
 */

const prefix = "[Persistence probe fixture]";

export const probeFixtureTitle = (at: Date) => `${prefix} ${at.toISOString()}`;

export const isProbeFixture = (idea: { kind: string; title: string }) =>
  idea.kind === "sermon" && idea.title.startsWith(`${prefix} `);
