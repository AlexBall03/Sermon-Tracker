/** The pages shown before signing in, and to an account that may not come in. */
export const auth = {
  home: "Sermon Tracker home",
  backHome: "Back to home",
  loading: "Loading",
  language: "Language",
  beta: "Invitation-only beta",
  signIn: {
    metaTitle: "Sign in",
    unavailableTitle: "Sign-in is not available here",
    unavailable:
      "Authentication has not been configured for this environment, so nobody can sign in yet.",
  },
  invitation: {
    metaTitle: "Accept invitation",
    requiredTitle: "An invitation is required",
    required:
      "Accounts are created from an invitation email. Open the link in your invitation to continue, or ask an administrator to send a new one if it has expired.",
  },
  denied: {
    metaTitle: "Access denied",
    eyebrow: "Access denied",
    title: "You do not have access",
    body: "Your account cannot open this part of Sermon Tracker. If you think this is a mistake, contact an administrator.",
    dashboard: "Go to dashboard",
    signOut: "Sign out",
  },
  access: {
    sessionEnded: "Your session has ended. Sign in again.",
    noAccess: "Your account does not have access.",
    adminsOnly: "Only administrators can do that.",
  },
};
