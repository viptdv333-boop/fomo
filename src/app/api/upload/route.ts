import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/upload";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = formData.get("type") as string | null;

  if (!file || !type) {
    return NextResponse.json({ error: "file and type required" }, { status: 400 });
  }

  if (!["avatars", "ideas", "receipts"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    const result = await saveUploadedFile(
      file,
      type as "avatars" | "ideas" | "receipts",
      session.user.id!
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
