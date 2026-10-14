/** A category page's groups of controls, one card each, in a readable column. */
export function SettingsStack({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl min-w-0 space-y-5">{children}</div>;
}

type SettingsBlockProps = {
  /** Where an address can point, as `/settings/app#install`. */
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
};

/** A group of related controls: one card, its heading and context above its controls. */
export function SettingsBlock({ id, title, description, children }: SettingsBlockProps) {
  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-6 rounded-xl border bg-surface p-5 shadow-card sm:p-6"
    >
      <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}
