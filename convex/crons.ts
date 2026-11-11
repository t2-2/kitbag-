import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.cron("yearly promotion", "0 0 1 9 *", internal.promote.start, {}); // 1 בספטמבר 00:00 UTC (03:00 בישראל)
export default crons;
