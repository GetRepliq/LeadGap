import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        
        {/* Left: Brand Logo */}
        <div className="flex flex-1 items-center justify-start">
          <Link href="/" className="text-xl font-bold tracking-tight text-black dark:text-white">
            LeadGap
          </Link>
        </div>

        {/* Center: Links (Absolutely centered) */}
        <div className="absolute left-1/2 flex -translate-x-1/2 space-x-8 text-sm font-medium">
          <Link href="/" className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors">
            Home
          </Link>
          <Link href="/webapp" className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors">
            WebApp
          </Link>
          <Link href="#" className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors">
            Features
          </Link>
        </div>

        {/* Right: CTA */}
        <div className="flex flex-1 items-center justify-end">
          <Link
            href="/webapp"
            className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Launch App
          </Link>
        </div>

      </div>
    </nav>
  );
}
