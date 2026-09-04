/** GET / DELETE конкретной заявки по публичному идентификатору. */
import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { findings as findingsTable, reviewFiles, submissions } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json(
    { error: "База данных недоступна. Задайте DATABASE_URL в переменных окружения Vercel и примените миграции (npx drizzle-kit push)." },
    { status: 503 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    console.error("[submission] БД недоступна:", error);
    return dbUnavailable();
  }
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.publicId, publicId))
    .limit(1);

  if (!submission) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }

  const [files, issues] = await Promise.all([
    db
      .select()
      .from(reviewFiles)
      .where(eq(reviewFiles.submissionId, submission.id))
      .orderBy(asc(reviewFiles.path)),
    db
      .select()
      .from(findingsTable)
      .where(eq(findingsTable.submissionId, submission.id))
      .orderBy(asc(findingsTable.line)),
  ]);

  return NextResponse.json({ submission, files, findings: issues });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    console.error("[submission] БД недоступна:", error);
    return dbUnavailable();
  }
  const deleted = await db
    .delete(submissions)
    .where(eq(submissions.publicId, publicId))
    .returning({ id: submissions.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
