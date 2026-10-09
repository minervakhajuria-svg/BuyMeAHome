import { notFound } from "next/navigation";
import { ReportView } from "@/components/report/ReportView";
import { getReportStore } from "@/lib/report/store";
import { TOKEN_PATTERN } from "@/lib/session/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your BuyMeAHome report", robots: { index: false, follow: false } };

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) notFound();
  const report = await getReportStore().get(token);
  if (!report) notFound();
  return <ReportView report={report} />;
}
