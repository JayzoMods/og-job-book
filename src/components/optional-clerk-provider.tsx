import { ClerkProvider } from "@clerk/nextjs";
import { clerkAuthConfigured, clerkPublishableKeyFromEnv } from "@/lib/ledger/auth";

export function OptionalClerkProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = clerkPublishableKeyFromEnv();
  if (!publishableKey || !clerkAuthConfigured()) {
    return children;
  }
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={{ cssLayerName: "clerk" }}>
      {children}
    </ClerkProvider>
  );
}
