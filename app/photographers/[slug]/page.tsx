"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, MapPin, Menu } from "lucide-react";
import { PageSkeleton } from "@/components/page-skeleton";

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
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryBusy, setEnquiryBusy] = useState(false);
  const [enquiryError, setEnquiryError] = useState("");
  const [enquirySuccess, setEnquirySuccess] = useState("");
  const [enquiryForm, setEnquiryForm] = useState({ name: "", email: "", phone: "", eventType: "", eventDate: "", eventLocation: "", message: "", consent: false, website: "" });

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

  async function submitEnquiry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enquiryBusy) return;
    setEnquiryBusy(true);
    setEnquiryError("");
    setEnquirySuccess("");
    try {
      const response = await fetch(`/api/public/photographers/${encodeURIComponent(slug)}/enquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(enquiryForm)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your enquiry could not be sent.");
      setEnquirySuccess(result.message || "Thank you. Your enquiry has been received.");
      setEnquiryForm({ name: "", email: "", phone: "", eventType: "", eventDate: "", eventLocation: "", message: "", consent: false, website: "" });
    } catch (error) {
      setEnquiryError(error instanceof Error ? error.message : "Your enquiry could not be sent.");
    } finally {
      setEnquiryBusy(false);
    }
  }

  if (loading) {
    return <PageSkeleton label="Preparing this photographer’s story" variant="profile"/>;
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
        <div className="profile-actions"><button className="button-dark" type="button" onClick={() => { setEnquiryOpen(true); setEnquirySuccess(""); setEnquiryError(""); }}>Send an enquiry <ArrowRight size={16}/></button><Link className="button-outline" href="/contact">Contact Lens & Light</Link></div>
        <p className="profile-interaction-note">Your enquiry is sent privately to this photographer and the Lens & Light support team. Your contact details are not displayed publicly.</p>
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
        <p>Tell the photographer a little about what you have in mind. Your details will be shared privately for a response.</p>
        <button className="button-dark" type="button" onClick={() => { setEnquiryOpen(true); setEnquirySuccess(""); setEnquiryError(""); }}>Start an enquiry <ArrowRight size={15}/></button>
        <small>Enquiries are private and visible only to this photographer and authorised Lens & Light support administrators.</small>
      </aside>
    </section>

    {enquiryOpen && <section className="profile-enquiry-section" id="photographer-enquiry">
      <div className="profile-section-head"><p className="kicker">PRIVATE PHOTOGRAPHER ENQUIRY</p><span>LET’S PLAN SOMETHING</span></div>
      <div className="profile-enquiry-heading"><h2>Tell us about<br/><em>your occasion.</em></h2><p>Share the essentials. The photographer can review your enquiry privately and follow up using the details you provide.</p></div>
      {enquirySuccess ? <div className="profile-enquiry-success" role="status"><CheckCircle2 size={22}/><div><strong>Enquiry received</strong><p>{enquirySuccess}</p></div><button type="button" onClick={() => setEnquiryOpen(false)}>Close</button></div> : <form className="profile-enquiry-form" onSubmit={submitEnquiry}>
        <label>Your name<input required minLength={2} maxLength={120} autoComplete="name" value={enquiryForm.name} onChange={e=>setEnquiryForm(v=>({...v,name:e.target.value}))}/></label>
        <label>Email address<input required type="email" maxLength={254} autoComplete="email" value={enquiryForm.email} onChange={e=>setEnquiryForm(v=>({...v,email:e.target.value}))}/></label>
        <label>Phone number<input required type="tel" minLength={7} maxLength={40} autoComplete="tel" value={enquiryForm.phone} onChange={e=>setEnquiryForm(v=>({...v,phone:e.target.value}))}/></label>
        <label>What are you planning?<select required value={enquiryForm.eventType} onChange={e=>setEnquiryForm(v=>({...v,eventType:e.target.value}))}><option value="">Choose an occasion</option><option>Wedding</option><option>Engagement</option><option>Portrait session</option><option>Family session</option><option>Corporate / commercial</option><option>Event</option><option>Product photography</option><option>Other</option></select></label>
        <label>Preferred date <span>(optional)</span><input type="date" value={enquiryForm.eventDate} onChange={e=>setEnquiryForm(v=>({...v,eventDate:e.target.value}))}/></label>
        <label>Location<input required maxLength={160} placeholder="Town, venue or area" value={enquiryForm.eventLocation} onChange={e=>setEnquiryForm(v=>({...v,eventLocation:e.target.value}))}/></label>
        <label className="profile-enquiry-wide">A little more about your plans<textarea required minLength={20} maxLength={4000} rows={5} placeholder="Tell the photographer what you have in mind, the style you like, and any useful details…" value={enquiryForm.message} onChange={e=>setEnquiryForm(v=>({...v,message:e.target.value}))}/></label>
        <label className="profile-enquiry-consent"><input type="checkbox" required checked={enquiryForm.consent} onChange={e=>setEnquiryForm(v=>({...v,consent:e.target.checked}))}/> I agree that Lens & Light may share these details with this photographer so they can respond to my enquiry.</label>
        <label className="profile-enquiry-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={enquiryForm.website} onChange={e=>setEnquiryForm(v=>({...v,website:e.target.value}))}/></label>
        {enquiryError && <p className="profile-enquiry-error" role="alert">{enquiryError}</p>}
        <div className="profile-enquiry-actions"><button className="button-dark" type="submit" disabled={enquiryBusy}>{enquiryBusy?"Sending securely…":"Send private enquiry"} <ArrowRight size={16}/></button><button type="button" className="button-outline" disabled={enquiryBusy} onClick={()=>setEnquiryOpen(false)}>Cancel</button></div>
        <p className="profile-enquiry-privacy">Your contact details are not shown on this public profile. They are stored securely for the purpose of responding to this enquiry.</p>
      </form>}
    </section>}
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
