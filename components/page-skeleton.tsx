import { Camera } from "lucide-react";

export function PageSkeleton({ label = "Preparing your page", variant = "workspace" }: { label?: string; variant?: "workspace" | "gallery" | "profile" }) {
  return <main className="ll-page-loading" aria-busy="true" aria-live="polite">
    <div className="ll-loading-brand"><span><Camera size={17}/></span><b>LENS <i>&amp;</i> LIGHT</b></div>
    <div className="ll-loading-intro"><p className="ll-loading-eyebrow">A MOMENT, PLEASE</p><h1>{label}<span>.</span></h1><p>We’re arranging the details and photographs for you. This should only take a moment.</p></div>
    {variant === "profile" ? <div className="ll-loading-profile"><div className="ll-skeleton ll-loading-cover"/><div className="ll-loading-profile-row"><div className="ll-skeleton ll-loading-avatar"/><div className="ll-loading-lines"><span className="ll-skeleton ll-line ll-line-wide"/><span className="ll-skeleton ll-line ll-line-short"/></div></div><div className="ll-loading-content"><span className="ll-skeleton ll-line ll-line-medium"/><span className="ll-skeleton ll-line"/><span className="ll-skeleton ll-line ll-line-wide"/></div></div> : <><div className="ll-loading-feature"><div className="ll-loading-feature-copy"><span className="ll-skeleton ll-line ll-line-short"/><span className="ll-skeleton ll-line ll-line-wide"/><span className="ll-skeleton ll-line ll-line-medium"/></div><div className="ll-skeleton ll-loading-feature-image"/></div><div className={variant === "gallery" ? "ll-loading-cards ll-loading-gallery" : "ll-loading-cards"}>{[0,1,2].map((item)=><div className="ll-loading-card" key={item}><div className="ll-skeleton ll-loading-card-image"/><span className="ll-skeleton ll-line ll-line-medium"/><span className="ll-skeleton ll-line ll-line-short"/></div>)}</div></>}
    <div className="ll-loading-foot"><span className="ll-loading-pulse"/> Your experience is being prepared</div>
  </main>;
}
