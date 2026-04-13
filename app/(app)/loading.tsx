export default function AppLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-gray-200 border-t-bpm-600" />
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    </div>
  );
}
