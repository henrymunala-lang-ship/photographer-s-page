"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, MapPin, Menu } from "lucide-react";

type Profile = {
  id: string;
  slug: string;
  name: string;
  bio: string;
  primaryLocation: string;
  categories: string[];
  profileImageUrl: string | null;
  heroImageUrl: string | null;
};
type GalleryItem = {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  altText: string;
  category: string;
  featured: boolean;
  sortOrder: number;
};
type Service = { id: string; name: string; description: string; imageUrl: string | null };
type ProfileResponse = {
  photographer: Profile;
  gallery: GalleryItem[];
  services: Service[];
  serviceAreas: string[];
};

export default function PublicPhotographerProfile() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug || "");
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [activeImage, setActiveImage] = useState<GalleryItem | null>(null);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetch(`/api/public/photographers/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
      cache: "no-store"
    })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Profile unavailable");
        return response.json() as Promise<ProfileResponse>;
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setUnavailable(false);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!controller.signal.aborted) setUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug]);

  if (loading) {
    return <main className="directory-page"><section className="directory-empty" role="status"><Camera size={28}/><h1>Loading photographer profile…</h1><p>Checking the latest approved and published profile.</p></section></main>;
  }

  if (unavailable) {
    return <main className="directory-page"><section className="directory-intro"><Link href="/photographers" className="back-link"><ArrowLeft size={15}/> BACK TO DIRECTORY</Link><h1>Profile temporarily unavailable.</h1><p>Please try again shortly, or return to the photographer directory.</p><Link className="button-dark" href="/photographers">Back to directory <ArrowRight size={16}/></Link></section></main>;
  }

  if (!data?.photographer) {
    return <main className="directory-page"><section className="directory-intro"><Link href="/photographers" className="back-link"><ArrowLeft size={15}/> BACK TO DIRECTORY</Link><h1>Profile not found.</h1><p>This photographer may no longer be published. Browse the directory to see currently available profiles.</p><Link className="button-dark" href="/photographers">Explore photographers <ArrowRight size={16}/></Link></section></main>;
  }

  const { photographer, gallery, services, serviceAreas } = data;
  const heroImage = photographer.heroImageUrl || gallery[0]?.imageUrl || photographer.profileImageUrl;

  return <main className="directory-page public-profile">
    <header className="market-header">
      <Link href="/" className="market-brand"><span className="brand-mark"><Camera size={19}/></span><span>LENS <i>&</i> LIGHT</span></Link>
      <nav className="desktop-site-nav"><Link href="/" className="home-nav-link">Home</Link><Link href="/photographers">Find a photographer</Link><Link href="/#how-it-works">How it works</Link><Link href="/photographers/apply">For photographers</Link><Link href="/contact" className="contact-nav-link">Contact</Link></nav>
      <details className="mobile-site-menu"><summary aria-label="Open navigation menu"><Menu size={23} strokeWidth={2.4} aria-hidden="true"/></summary><nav><Link href="/">Home</Link><Link href="/photographers">Find a photographer</Link><Link href="/#how-it-works">How it works</Link><Link href="/photographers/apply">For photographers</Link><Link href="/contact">Contact</Link></nav></details>
      <Link className="header-cta" href="/photographers">Back to directory <ArrowRight size={15}/></Link>
    </header>

    <section className="profile-hero">
      <div className="profile-hero-image">
        {heroImage ? <img src={heroImage} alt={`${photographer.name} photography`}/> : <div className="directory-image-placeholder"><Camera size={32}/></div>}
        <span>APPROVED · PUBLISHED PROFILE</span>
      </div>
      <div className="profile-hero-copy">
        <Link href="/photographers" className="back-link"><ArrowLeft size={15}/> ALL PHOTOGRAPHERS</Link>
        <div className="profile-portrait" aria-label={`${photographer.name} profile photo`}>
          {photographer.profileImageUrl || photographer.heroImageUrl ? <img src={photographer.profileImageUrl || photographer.heroImageUrl || ""} alt={`${photographer.name} portrait`}/> : <div className="profile-portrait-placeholder"><Camera size={22}/></div>}
        </div>
        <p className="kicker">{photographer.categories.join(" · ") || "PHOTOGRAPHER"}</p>
        <h1>{photographer.name}</h1>
        <p className="profile-location"><MapPin size={15}/>{photographer.primaryLocation || "Location not specified"}</p>
        <p className="profile-lead">{photographer.bio || "This photographer has not added an introduction yet."}</p>
        <div className="profile-actions"><Link className="button-dark" href="/contact">Contact Lens & Light <ArrowRight size={16}/></Link></div>
        <p className="profile-interaction-note">Direct photographer enquiries are not enabled yet. Contact Lens & Light for general assistance.</p>
      </div>
    </section>

    <section className="profile-main">
      <div className="profile-details">
        <div className="profile-section-head"><p className="kicker">A LITTLE ABOUT THE WORK</p><span>01 — INTRODUCTION</span></div>
        <h2>Every story has<br/><em>its own rhythm.</em></h2>
        <p>{photographer.bio || "More about this photographer will be added here as their profile is completed."}</p>
        <div className="profile-section-head"><p className="kicker">SERVICES</p><span>02 — WHAT I OFFER</span></div>
        {services.length ? <div className="profile-services">{services.map((service) => <div key={service.id}><CheckCircle2 size={16}/><span><strong>{service.name}</strong>{service.description && <small>{service.description}</small>}</span></div>)}</div> : <p>Published services have not been added yet.</p>}
        <div className="profile-section-head"><p className="kicker">BASED HERE, AVAILABLE THERE</p><span>03 — LOCATION</span></div>
        <p className="profile-location"><MapPin size={15}/>{photographer.primaryLocation || "Location not specified"}</p>
        {serviceAreas.length > 0 && <p className="profile-areas">ALSO AVAILABLE IN · {serviceAreas.join(" · ")}</p>}
      </div>
      <aside className="profile-contact-card">
        <p className="kicker">START A CONVERSATION</p><h2>Have a story<br/>in mind?</h2>
        <p>We are preparing secure enquiry and messaging tools for Lens & Light. They are not available yet.</p>
        <Link className="button-dark" href="/contact">Contact Lens & Light <ArrowRight size={15}/></Link>
        <small>This link opens the general contact page; it does not send a message to the photographer.</small>
      </aside>
    </section>

    <section className="profile-gallery">
      <div className="profile-section-head"><p className="kicker">SELECTED WORK</p><span>04 — PORTFOLIO</span></div>
      <h2>A few moments<br/><em>worth keeping.</em></h2>
      {gallery.length ? <div className="profile-gallery-grid">{gallery.map((item) => <button key={item.id} type="button" onClick={() => setActiveImage(item)}><img src={item.imageUrl} alt={item.altText || item.title || `Portfolio image by ${photographer.name}`}/></button>)}</div> : <div className="directory-empty"><Camera size={28}/><h2>Portfolio coming soon.</h2><p>Published portfolio images will appear here when they are added to this photographer’s profile.</p></div>}
      <p className="directory-disclaimer">This page displays information and portfolio items approved for publication by Lens & Light administrators.</p>
    </section>

    {activeImage && <div className="profile-lightbox" role="dialog" aria-modal="true" aria-label="Portfolio image preview" onClick={() => setActiveImage(null)}><button type="button" onClick={() => setActiveImage(null)} aria-label="Close image">×</button><img src={activeImage.imageUrl} alt={activeImage.altText || activeImage.title || "Selected portfolio image"}/></div>}

    <footer className="market-footer"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={18}/></span><span>LENS <i>&</i> LIGHT</span></Link><span>PHOTOGRAPHY, WITH PEOPLE AT ITS HEART.</span><div><Link href="/photographers">DISCOVER</Link><Link href="/photographers/apply">JOIN US</Link><Link href="/contact">CONTACT</Link></div><small>© {new Date().getFullYear()} LENS & LIGHT. ALL RIGHTS RESERVED.</small></footer>
  </main>;
}
