type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
};

/** Title block shared by application pages: a serif title, one line of context, a hairline. */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="border-b pb-6">
      <h1 className="font-display text-[1.875rem] leading-tight font-medium tracking-[-0.015em] sm:text-[2.125rem]">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}
