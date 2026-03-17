import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/upload";

export async function POST(request: NextRequest) {
  console.log("[api/upload] POST received");
  const session = await auth();
  if (!session?.user) {
    console.log("[api/upload] Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = formData.get("type") as string | null;

  console.log(`[api/upload] file: ${file?.name}, size: ${file?.size}, type param: ${type}`);

  if (!file || !type) {
    return NextResponse.json({ error: "file and type required" }, { status: 400 });
  }

  if (!["avatars", "ideas", "receipts", "messages"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    const result = await saveUploadedFile(
      file,
      type as "avatars" | "ideas" | "receipts" | "messages",
      session.user.id!
    );
    console.log(`[api/upload] Success: ${result.url}`);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/upload] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
