import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "cleanup revoked api keys",
  { hours: 24 },
  internal.cleanup.cleanupKeys,
);

crons.interval(
  "cleanup api key events",
  { hours: 24 },
  internal.cleanup.cleanupEvents,
);

export default crons;
