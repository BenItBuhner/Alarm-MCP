"use client";

import { SignIn, useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { Mark } from "../components/Mark";

function handoff(jwt: string): void {
  const native = (window as unknown as { AlarmMcpNative?: { onClerkJwt: (token: string) => void } })
    .AlarmMcpNative;
  if (native?.onClerkJwt) {
    native.onClerkJwt(jwt);
    return;
  }
  window.location.href = `alarmmcp://auth#${encodeURIComponent(jwt)}`;
}

function Handoff() {
  const { isSignedIn, getToken } = useAuth();
  const sent = useRef(false);

  useEffect(() => {
    if (!isSignedIn || sent.current) return;
    sent.current = true;
    void getToken({ template: "convex" }).then((jwt) => {
      if (jwt) handoff(jwt);
    });
  }, [isSignedIn, getToken]);

  if (!isSignedIn) {
    return (
      <SignIn
        routing="hash"
        forceRedirectUrl="/device-sign-in"
        signUpForceRedirectUrl="/device-sign-in"
        appearance={{
          elements: {
            footerAction: "hidden",
            logoBox: "hidden",
          },
        }}
      />
    );
  }

  return <p className="text-sm text-mute">Signed in. Return to the app.</p>;
}

export default function DeviceSignIn() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <div className="mb-10 flex items-center gap-2.5 text-glow">
        <Mark />
        <span className="text-[15px] font-medium tracking-tight text-paper">Alarm MCP</span>
      </div>
      <p className="mb-8 text-sm text-mute">Sign in with email. This device then registers itself.</p>
      <Handoff />
    </div>
  );
}
