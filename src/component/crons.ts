import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "sweep expired api keys",
  { hours: 1 },
  internal.sweep.sweepExpired,
  {},
);

crons.interval(
  "sweep idle expired api keys",
  { hours: 1 },
  internal.sweep.sweepIdleExpired,
  {},
);

export default crons;
