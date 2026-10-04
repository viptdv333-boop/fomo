import type { ExternalChannel } from "@/lib/notification-events";
import * as email from "./email";
import * as telegram from "./telegram";
import * as whatsapp from "./whatsapp";
import * as max from "./max";
import * as vk from "./vk";
import * as webhook from "./webhook";
import type { AdapterDeps, ChannelMessage, ChannelRowLite, SendResult } from "./types";

export interface ExternalAdapter {
  isConfigured(): boolean;
  send(row: ChannelRowLite, msg: ChannelMessage, deps?: AdapterDeps): Promise<SendResult>;
}

export const ADAPTERS: Record<ExternalChannel, ExternalAdapter> = { email, telegram, whatsapp, max, vk, webhook };

export function isChannelConfigured(channel: ExternalChannel): boolean {
  return ADAPTERS[channel].isConfigured();
}

export type { AdapterDeps, ChannelMessage, ChannelRowLite, SendResult } from "./types";
