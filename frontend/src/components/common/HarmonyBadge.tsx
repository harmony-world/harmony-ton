const LETTERS = [...'HARMONY']

export function HarmonyBadge() {
  return (
    <span className="harmony-badge flex items-center gap-2" aria-label="HARMONY" role="img">
      <svg className="hb-mark h-[30px] w-[30px] overflow-visible" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="7" fill="var(--tg-brand-color)" />
        <circle className="hb-halo" cx="12" cy="12.5" r="7" />
        <rect className="hb-bar" x="5" y="5" width="3" height="14" rx="1.2" />
        <rect className="hb-bar hb-bar-2" x="16" y="5" width="3" height="14" rx="1.2" />
        <svg className="hb-heart" x="8.3" y="8.6" width="7.4" height="7.4" viewBox="2 4.4 16 15.8">
          <path d="M12 20s-7-4.6-9.3-9.2C1.3 7.8 2.8 4.6 6 4.6c2 0 3.2 1.5 4 2.6.8-1.1 2-2.6 4-2.6 3.2 0 4.7 3.2 3.3 6.2C19 15.4 12 20 12 20z" />
        </svg>
        <circle className="hb-spark" cx="10" cy="7" r="1.4" />
        <circle className="hb-spark hb-spark-2" cx="14" cy="7" r="1.1" />
      </svg>
      <span className="hb-word font-bold text-[19px] tracking-[0.5px] text-[var(--hb-text,var(--tg-theme-text-color,#1C1C1E))]" aria-hidden="true">
        {LETTERS.map((c, i) => (
          <b key={i} className="font-bold" style={{ animationDelay: `${i * 0.07}s` }}>{c}</b>
        ))}
      </span>
    </span>
  )
}
