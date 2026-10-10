/** The dashboard's title: by first name when there is one, and still a sentence when not. */
export function welcomeTitle(firstName?: string | null) {
  const name = firstName?.trim();
  return name ? `Welcome back, ${name}` : "Welcome back";
}
