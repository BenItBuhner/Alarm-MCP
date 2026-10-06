import Link from "next/link";
import { ANDROID_APK_URL, WINDOWS_INSTALLER_URL } from "@/lib/downloads";

export default function Download() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <nav className="flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Alarm MCP
        </Link>
        <Link href="/" className="text-sm text-zinc-400 hover:text-glow">
          Home
        </Link>
      </nav>

      <h1 className="mt-20 text-4xl font-semibold tracking-tight">Download</h1>
      <p className="mt-6 text-zinc-400">Install, then pair from the dashboard.</p>
      <ul className="mt-10 space-y-4">
        <li>
          <a className="text-glow underline-offset-2 hover:underline" href={WINDOWS_INSTALLER_URL}>
            Windows installer
          </a>
        </li>
        <li>
          <a className="text-glow underline-offset-2 hover:underline" href={ANDROID_APK_URL}>
            Android APK
          </a>
        </li>
      </ul>
      <p className="mt-10 text-sm text-zinc-500">
        Unsigned Windows installer; Android APK is debug-signed.
      </p>
    </main>
  );
}
