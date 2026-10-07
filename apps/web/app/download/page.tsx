import Link from "next/link";
import { ANDROID_APK_URL, WINDOWS_INSTALLER_URL } from "@/lib/downloads";
import { Shell } from "../components/Shell";

export default function Download() {
  return (
    <Shell
      action={
        <Link href="/" className="hover:text-paper">
          Home
        </Link>
      }
    >
      <h1 className="text-4xl font-medium tracking-tight">Download</h1>
      <p className="mt-4 text-mute">Sign in on the device. It registers itself. No pairing code.</p>
      <ul className="mt-10 divide-y divide-line border-y border-line">
        <li>
          <a className="flex items-center justify-between py-5 hover:text-glow" href={WINDOWS_INSTALLER_URL}>
            <span>Windows</span>
            <span className="font-mono text-xs text-mute">.exe</span>
          </a>
        </li>
        <li>
          <a className="flex items-center justify-between py-5 hover:text-glow" href={ANDROID_APK_URL}>
            <span>Android</span>
            <span className="font-mono text-xs text-mute">.apk</span>
          </a>
        </li>
      </ul>
      <p className="mt-8 text-sm text-mute">Unsigned Windows installer. Android APK is debug-signed.</p>
    </Shell>
  );
}
