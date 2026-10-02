import { NextResponse } from "next/server";

// The service worker normally answers this POST (Web Share Target). If it is not controlling the page yet,
// the file cannot be kept, so just open the chat.
export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/chat", request.url), 303);
}
