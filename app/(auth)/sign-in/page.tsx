import type { Metadata } from "next";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Scale X",
};

export default function SignInPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <SignInForm />
    </div>
  );
}
