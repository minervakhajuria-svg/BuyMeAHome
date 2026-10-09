import { readFileSync } from "node:fs";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report/ReportView";
import { loadSampleDataset } from "@/lib/dataset/sample";
import { generateReport } from "@/lib/report/generate";
import { buyerProfile } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sample report | BuyMeAHome", robots: { index: false, follow: false } };

/** Preview of the report layout using the bundled sample dataset and the template narrative (no model call). */
export default async function SampleReport() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_SAMPLE_REPORT !== "true") notFound();
  const profile = buyerProfile.parse(JSON.parse(readFileSync("data/sample/profile.example.json", "utf8")));
  return <ReportView report={await generateReport(profile, loadSampleDataset())} />;
}
