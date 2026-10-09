import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold">BuyMeAHome</h1>
      <p className="mt-3 text-stone-600">
        Answer 10 short questions and get a ranked report of the best micro-markets in Bangalore to buy a home to live in.
      </p>
      <Link href="/chat" className="mt-6 inline-block rounded-md bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-800">
        Start your search
      </Link>
      <p className="mt-8 text-xs text-stone-500">Not financial or legal advice. Verify everything before buying.</p>
    </main>
  );
}
