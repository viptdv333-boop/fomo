// Side-effect module: hands the code that applies a profile pulled from fomo.spot (terminal login reconcile) to the sender, which cannot
// import the database / image code itself. Imported by the next-auth route handler, i.e. in the process that runs the credentials login.
import { registerPullApplier } from "./account-mirror-client";
import { applyPulledProfile } from "./account-mirror-server";

registerPullApplier((userId, profile) => applyPulledProfile(userId, profile));
