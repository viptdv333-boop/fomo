import { handlers } from "@/lib/auth";
// registers the code that applies the profile pulled from fomo.spot at login (terminal only; see account-mirror-client.ts)
import "@/lib/account-mirror-pull";

export const { GET, POST } = handlers;
