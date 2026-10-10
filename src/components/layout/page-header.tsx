type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  /** The page's one main action, set at the end of the title block. */
  action?: React.ReactNode;
};

/** Title block shared by application pages: a serif title, one line of context, a hairline. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-6">
      <div className="min-w-0 flex-1 basis-80">
        <h1 className="font-display text-[1.875rem] leading-tight font-medium tracking-[-0.015em] sm:text-[2.125rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}
