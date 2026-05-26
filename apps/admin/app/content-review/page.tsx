export default function ContentReviewPage() {
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Content Review</h1>
      <p className="mt-1 text-sm text-slate-400">AI-flagged listings · manual approve / reject</p>
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
        Queue is empty.
      </div>
    </div>
  );
}
