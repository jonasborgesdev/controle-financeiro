type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function PageHero({ eyebrow, title, description, children }: PageHeroProps) {
  return (
    <section className="finance-glass-strong overflow-visible rounded-[2.25rem] p-5 text-white sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.78fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-cyan-200">{eyebrow}</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-black tracking-[-0.04em] text-balance sm:text-5xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
        </div>
        {children ? <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4 shadow-2xl shadow-slate-950/20">{children}</div> : null}
      </div>
    </section>
  );
}
