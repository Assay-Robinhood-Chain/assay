import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-24 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-line bg-panel text-xl">
        🔎
      </span>
      <h1 className="text-xl font-semibold text-ink">Not found</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        <span className="font-mono text-[12.5px]">{`{ error: { code: "not_found" } }`}</span>
        <br />
        This launchpad isn&rsquo;t tracked, or the link is wrong.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink hover:border-faint"
      >
        Back to the directory
      </Link>
    </div>
  );
}
