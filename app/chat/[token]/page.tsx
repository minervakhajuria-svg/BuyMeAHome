import { notFound } from "next/navigation";
import { IntakeChat } from "@/components/intake/IntakeChat";
import { getStore, TOKEN_PATTERN } from "@/lib/session/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your search | BuyMeAHome" };

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) notFound();
  const record = await getStore().get(token);
  if (!record) notFound();
  return <IntakeChat initialToken={record.token} initialProfile={record.profile} />;
}
