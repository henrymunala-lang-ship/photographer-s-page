"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { ArrowRight, Camera, Heart, ShieldCheck, Sparkles, House, Mail, Phone, Instagram } from "lucide-react";
type HomepagePhotographer = { id: string; slug: string; name: string; primaryLocation: string; categories: string[]; profileImageUrl: string | null; heroImageUrl: string | null; };


export default function Home(){
const [photographers, setPhotographers] = useState<HomepagePhotographer[]>([]);
useEffect(() => {
  let active = true;
  const loadPhotographers = async () => {
    try {
      const response = await fetch("/api/public/photographers", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { photographers?: HomepagePhotographer[] };
      if (active && Array.isArray(data.photographers)) setPhotographers(data.photographers);
    } catch {
      // Keep the most recently loaded public profiles visible if the network is temporarily unavailable.
    }
  };
  void loadPhotographers();
  const interval = window.setInterval(() => void loadPhotographers(), 15000);
  const refreshOnFocus = () => { if (document.visibilityState === "visible") void loadPhotographers(); };
  window.addEventListener("focus", refreshOnFocus);
  document.addEventListener("visibilitychange", refreshOnFocus);
  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener("focus", refreshOnFocus);
    document.removeEventListener("visibilitychange", refreshOnFocus);
  };
}, []);
const leadPhotographer = photographers[0];
const leadImage = leadPhotographer?.heroImageUrl || leadPhotographer?.profileImageUrl;
const secondaryPhotographer = photographers[1] || leadPhotographer;
const secondaryImage = secondaryPhotographer?.heroImageUrl || secondaryPhotographer?.profileImageUrl;
return <main className="market"><header className="market-header"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={21} strokeWidth={2.5}/></span><span className="brand-wordmark"><strong>LENS &amp; LIGHT</strong><small>MAKE A SHOT, KEEP MEMORY</small></span></Link><nav className="desktop-site-nav"><Link href="/" className="home-nav-link" aria-current="page"><House size={13}/> Home</Link><Link href="/photographers">Find a photographer</Link><Link href="/contact" className="contact-nav-link">Contact</Link><a href="#how-it-works">How it works</a><a href="#for-photographers">For photographers</a></nav><details className="mobile-site-menu"><summary aria-label="Open navigation menu"><Menu size={23} strokeWidth={2.4} aria-hidden="true"/></summary><nav><Link href="/" aria-current="page">Home</Link><Link href="/photographers">Find a photographer</Link><Link href="/contact">Contact</Link><a href="#how-it-works">How it works</a><a href="#for-photographers">For photographers</a></nav></details><Link className="header-cta" href="/photographers">Explore photographers <ArrowRight size={15}/></Link></header>
<section className="market-hero"><div className="market-hero-copy"><p className="kicker"><span/> A HOME FOR PHOTOGRAPHY & THE PEOPLE BEHIND IT</p><h1>Find the eyes<br/>behind <em>your story.</em></h1><p className="hero-description">Discover thoughtful photographers for the moments, milestones and ideas you want to remember.</p><div className="hero-actions"><Link className="button-dark" href="/photographers">Find your photographer <ArrowRight size={16}/></Link><a className="button-text" href="#how-it-works">Discover how it works <span>↓</span></a></div><div className="hero-proof"><span><ShieldCheck size={16}/> Curated photographer profiles</span><span><Heart size={15}/> Genuine work, real stories</span></div></div><div className="market-hero-visual">{leadImage ? <img src={leadImage} alt={leadPhotographer ? `Photography by ${leadPhotographer.name}` : "Featured photographer work"}/> : <div className="homepage-photo-empty">Photographer images will appear here when profiles are published.</div>}<div className="hero-image-caption"><span>{leadPhotographer ? `FEATURED WORK · ${leadPhotographer.name.toUpperCase()}` : "THE ART OF REMEMBERING"}</span><span>LIVE PORTFOLIO</span></div><div className="floating-note"><Sparkles size={15}/><span>Fresh work from our photographers</span></div></div></section>
<section className="market-categories"><div className="section-topline"><p className="kicker">A GOOD PLACE TO BEGIN</p><span>01 — EXPLORE</span></div><div className="section-title-row"><h2>Meet the people<br/><em>behind the images.</em></h2><p>Explore the latest work shared by approved Lens & Light photographers. Profile image changes appear here automatically.</p></div><div className="category-grid">{photographers.length ? photographers.map((photographer,i)=>{const image=photographer.heroImageUrl||photographer.profileImageUrl;return <Link className="category-card" href={`/photographers/${photographer.slug}`} key={photographer.id}><div className="category-image">{image ? <img src={image} alt={`Photography by ${photographer.name}`} loading="lazy"/> : <div className="homepage-photo-empty"/>}<span>{String(i+1).padStart(2,"0")}</span><b><ArrowRight size={18}/></b></div><h3>{photographer.name}</h3><p>{photographer.categories.join(" · ") || photographer.primaryLocation || "Photographer"}</p></Link>}) : <div className="homepage-photo-empty">Approved and published photographer portfolios will appear here.</div>}</div></section>
<section className="how-section" id="how-it-works"><div className="how-image">{secondaryImage ? <img src={secondaryImage} alt={secondaryPhotographer ? `Recent work by ${secondaryPhotographer.name}` : "Photographer portfolio image"}/> : <div className="homepage-photo-empty">Photographer work will appear here.</div>}</div><div className="how-copy"><p className="kicker">A MORE PERSONAL WAY TO FIND YOUR PHOTOGRAPHER</p><h2>Good work.<br/><em>Good people.</em><br/>A great fit.</h2>{[["01","Explore the work","Browse portfolios, styles and the services photographers offer."],["02","Find your fit","Compare experience, location and the kind of stories they love to tell."],["03","Start a conversation","Contact a photographer directly and tell them what you have in mind."]].map(([n,t,d])=><div className="how-step" key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div></div>)}<Link className="button-dark" href="/photographers">Meet the photographers <ArrowRight size={16}/></Link></div></section>
<section className="join-section" id="for-photographers"><div><p className="kicker">FOR THE PEOPLE BEHIND THE CAMERA</p><h2>Your work deserves<br/><em>to be discovered.</em></h2></div><div><p>Build a home for your photography, share the work you’re proud of and connect with people looking for your perspective.</p><Link className="button-light" href="/photographers/apply">Become a photographer <ArrowRight size={16}/></Link></div></section>
<footer className="market-footer" id="contact"><div className="footer-signature"><span className="footer-company">BLACK HYPHEN TECHNOLOGIES</span><strong>SHOOT FOR MEMORY</strong><span className="footer-super-admin">CONTACT INFORMATION</span></div><div className="footer-links"><Link href="/photographers">DISCOVER</Link><a href="#for-photographers">JOIN US</a><Link href="/contact">CONTACT</Link></div><div className="footer-social" aria-label="Contact links"><a href="tel:0711205316" aria-label="Call Lens and Light" title="Call 0711205316"><Phone size={16}/></a><a href="mailto:henrymunala2@gmail.com" aria-label="Email Lens and Light" title="Email"><Mail size={16}/></a><a href="https://www.instagram.com/kynekenya/" target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram"><Instagram size={16}/></a></div><small>© {new Date().getFullYear()} LENS &amp; LIGHT. ALL RIGHTS RESERVED.</small></footer></main>}
