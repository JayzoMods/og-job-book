"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function ClerkHeaderControls() {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Show when="signed-out">
        <SignInButton>
          <button type="button" className="btn btn-ghost">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton>
          <button type="button" className="btn btn-primary">
            Sign up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
