import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "cleanup expired api keys",
  { hours: 24 },
  internal.internal.cleanupExpiredKeys,
);

export default crons;
