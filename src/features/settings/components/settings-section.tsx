type SettingsSectionProps = {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

/**
 * One area of settings: its heading and context on the left, its controls on
 * the right, and a hairline between it and the next. Stacks below `lg`.
 */
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="grid gap-x-12 gap-y-6 border-b py-9 last:border-b-0 last:pb-0 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-10"
    >
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-[-0.015em]">
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="max-w-2xl min-w-0 space-y-9">{children}</div>
    </section>
  );
}

type SettingsBlockProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

/** A group of related controls inside a section. */
export function SettingsBlock({ title, description, children }: SettingsBlockProps) {
  return (
    <div>
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}
