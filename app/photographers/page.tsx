"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, MapPin, Search, SlidersHorizontal, Menu } from "lucide-react";
import { PageSkeleton } from "@/components/page-skeleton";

type Photographer = {
  id: string;
  slug: string;
  name: string;
  bio: string;
  primaryLocation: string;
  categories: string[];
  serviceAreas: string[];
  profileImageUrl: string | null;
  heroImageUrl: string | null;
};

const types = ["All styles", "Weddings", "Portraits", "Commercial"];

export default function PhotographersPage() {
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All styles");
  const [place, setPlace] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/photographers", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Directory unavailable");
        return response.json();
      })
      .then((data: { photographers?: Photographer[] }) => {
        setPhotographers(Array.isArray(data.photographers) ? data.photographers : []);
        setUnavailable(false);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => photographers.filter((photographer) => {
    const searchable = [photographer.name, photographer.bio, ...photographer.categories].join(" ").toLowerCase();
    const categoryMatch = type === "All styles" || photographer.categories.some((category) => category.toLowerCase().includes(type.toLowerCase().replace(/s$/, "")));
    const queryMatch = !query || searchable.includes(query.toLowerCase());
    const normalizedPlace = place.trim().toLowerCase();
    const locationMatch = !normalizedPlace ||
      photographer.primaryLocation.toLowerCase().includes(normalizedPlace) ||
      photographer.serviceAreas.some((area) => area.toLowerCase().includes(normalizedPlace));
    return categoryMatch && queryMatch && locationMatch;
  }), [photographers, query, type, place]);

  return <main className="directory-page">
    <header className="market-header">
      <Link href="/" className="market-brand"><span className="brand-mark"><Camera size={19}/></span><span>LENS <i>&</i> LIGHT</span></Link>
      <nav className="desktop-site-nav">
        <Link href="/" className="home-nav-link">Home</Link><Link href="/photographers" aria-current="page">Find a photographer</Link>
        <Link href="/#how-it-works">How it works</Link><Link href="/#for-photographers">For photographers</Link><Link href="/contact" className="contact-nav-link">Contact</Link>
      </nav>
      <details className="mobile-site-menu"><summary aria-label="Open navigation menu"><Menu size={23} strokeWidth={2.4} aria-hidden="true"/></summary><nav>
        <Link href="/">Home</Link><Link href="/photographers">Find a photographer</Link><Link href="/#how-it-works">How it works</Link><Link href="/#for-photographers">For photographers</Link><Link href="/contact">Contact</Link>
      </nav></details>
      <Link className="header-cta" href="/photographers/apply">Apply to join <ArrowRight size={15}/></Link>
    </header>
    <section className="directory-intro">
      <Link href="/" className="back-link"><ArrowLeft size={15}/> BACK HOME</Link>
      <p className="kicker">THE LENS & LIGHT DIRECTORY</p><h1>Find someone who<br/><em>sees it your way.</em></h1>
      <p>Explore approved photographers by style and location. The right person can make all the difference.</p>
    </section>
    <section className="directory-content">
      <div className="directory-toolbar">
        <label className="search-field"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or what you want photographed"/></label>
        <label className="search-field location-field"><MapPin size={17}/><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Town, county or area"/></label>
        <span className="filter-label"><SlidersHorizontal size={15}/> FILTER BY</span>
        <div className="directory-filters">{types.map((item) => <button key={item} className={type === item ? "selected" : ""} onClick={() => setType(item)}>{item}</button>)}</div>
      </div>
      <div className="directory-result-head"><span>{loading ? "LOADING PHOTOGRAPHERS" : `${filtered.length} PHOTOGRAPHERS`}</span><span>APPROVED · PUBLISHED LISTINGS</span></div>
      {loading ? <PageSkeleton label="Finding photographers" variant="gallery"/> :
        unavailable ? <div className="directory-empty" role="alert"><Camera size={28}/><h2>Photographers are temporarily unavailable.</h2><p>Please try again in a little while.</p><button onClick={() => window.location.reload()}>Try again</button></div> :
        filtered.length > 0 ? <div className="directory-grid">{filtered.map((photographer) => {
          const category = photographer.categories[0] || "Photography";
          return <article className="photographer-card" key={photographer.id}>
            <div className="photographer-cover">
              {photographer.heroImageUrl || photographer.profileImageUrl ? <img src={photographer.heroImageUrl || photographer.profileImageUrl || ""} alt={`${photographer.name} photography`} loading="lazy"/> : <div className="directory-image-placeholder"><Camera size={30}/></div>}
              <span>APPROVED PHOTOGRAPHER</span>
            </div>
            <div className="photographer-info">
              <div className="photographer-avatar">{photographer.profileImageUrl || photographer.heroImageUrl ? <img src={photographer.profileImageUrl || photographer.heroImageUrl || ""} alt={`${photographer.name} portrait`} loading="lazy"/> : <Camera size={22}/>}</div>
              <p className="photographer-type">{category}</p><h2>{photographer.name}</h2>
              <p className="photographer-location"><MapPin size={13}/>{photographer.primaryLocation || "Location not specified"}</p>
              <p className="photographer-bio">{photographer.bio || "View this photographer's work and get in touch about your project."}</p>
              <p className="service-areas">Styles · {photographer.categories.join(" · ") || "Photography"}</p>
              {photographer.serviceAreas.length > 0 && <p className="service-areas">Also serving · {photographer.serviceAreas.join(" · ")}</p>}
              <div className="profile-card-bottom"><span>Lens & Light listing</span><Link href={`/photographers/${photographer.slug}`}>View profile <ArrowRight size={14}/></Link></div>
            </div>
          </article>;
        })}</div> :
        <div className="directory-empty"><Camera size={28}/><h2>{photographers.length === 0 ? "No photographers published just yet." : "No photographers match those filters."}</h2>
          <p>{photographers.length === 0 ? "Approved photographers will appear here once their profiles are published." : "Try another name, location or photography style."}</p>
          <button onClick={() => { setQuery(""); setPlace(""); setType("All styles"); }}>Clear filters</button>
        </div>}
      <p className="directory-disclaimer">Only photographer profiles marked approved and published by Lens & Light administrators appear in this directory.</p>
    </section>
    <footer className="market-footer"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={18}/></span><span>LENS <i>&</i> LIGHT</span></Link><span>PHOTOGRAPHY, WITH PEOPLE AT ITS HEART.</span><div><Link href="/">HOME</Link><Link href="/photographers/apply">JOIN US</Link><Link href="/contact">CONTACT</Link></div><small>© {new Date().getFullYear()} LENS & LIGHT. ALL RIGHTS RESERVED.</small></footer>
  </main>;
}
