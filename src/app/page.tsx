import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Welcome to Family Tree</h1>
      <p className="text-sm text-black/70 dark:text-white/70 max-w-prose">
        Build your family tree locally in your browser. Start by adding people,
        then define relationships, and visualize the tree.
      </p>
      <div className="flex gap-3">
        <Link
          href="/people"
          className="inline-flex items-center rounded-md px-4 py-2 border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          Go to People
        </Link>
        <Link
          href="/tree"
          className="inline-flex items-center rounded-md px-4 py-2 border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          View Tree
        </Link>
      </div>
    </div>
  );
}
