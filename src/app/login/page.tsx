import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    // Covers the app shell: nothing behind it is usable before signing in.
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-bg px-4 py-10">
      <Suspense fallback={null}>
        {searchParams.then((sp) => (
          <LoginForm next={typeof sp.next === "string" ? sp.next : "/"} setup={sp.setup === "1"} />
        ))}
      </Suspense>
    </div>
  );
}
