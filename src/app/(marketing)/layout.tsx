import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/** Public, indexable pages for visitors who are not signed in. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1 pt-24">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
