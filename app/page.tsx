"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Camera, Instagram, Menu, X } from "lucide-react";

const photos = [
  { id: 1, category: "Weddings", title: "A day to remember", place: "The wedding story", src: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85", shape: "tall" },
  { id: 2, category: "Portraits", title: "Quiet confidence", place: "Portrait session", src: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85", shape: "wide" },
  { id: 3, category: "Lifestyle", title: "In the golden light", place: "Lifestyle story", src: "https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1000&q=85", shape: "wide" },
  { id: 4, category: "Weddings", title: "The little moments", place: "Wedding details", src: "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=85", shape: "tall" },
  { id: 5, category: "Commercial", title: "Form & feeling", place: "Creative direction", src: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1000&q=85", shape: "wide" },
  { id: 6, category: "Portraits", title: "A study in light", place: "Studio portrait", src: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1000&q=85", shape: "wide" }
];

const categories = ["All work", "Weddings", "Portraits", "Lifestyle", "Commercial"];

export default function Home() {
  const [active, setActive] = useState("All work");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const visiblePhotos = useMemo(() => active === "All work" ? photos : photos.filter((photo) => photo.category === active), [active]);
  const currentPhoto = photos.find((photo) => photo.id === selected);

  const closeMenu = () => setMenuOpen(false);

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#home" onClick={closeMenu} aria-label="Lens and Light home"><span className="wordmark-icon"><Camera size={18} strokeWidth={1.5} /></span><span>LENS <i>&</i> LIGHT</span></a>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={menuOpen ? "main-nav open" : "main-nav"} aria-label="Main navigation">
          <a href="#work" onClick={closeMenu}>Selected work</a>
          <a href="#about" onClick={closeMenu}>The approach</a>
          <a href="#services" onClick={closeMenu}>Services</a>
          <a className="nav-contact" href="#contact" onClick={closeMenu}>Let's talk <ArrowUpRight size={14} /></a>
        </nav>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> INDEPENDENT PHOTOGRAPHER · NAIROBI & BEYOND</p>
          <h1>Honest moments.<br /><em>Timeless stories.</em></h1>
          <p className="hero-intro">Photographs with feeling, made to bring you back to the moments that matter most.</p>
          <a className="text-link" href="#work">Explore the work <ArrowDown size={15} /></a>
          <div className="hero-index"><span>01</span><span className="index-rule" /><span>04</span></div>
        </div>
        <div className="hero-image-wrap">
          <img className="hero-image" src="https://images.unsplash.com/photo-1532712938310-34cb3982ef74?auto=format&fit=crop&w=1800&q=90" alt="Couple sharing a quiet moment outdoors" />
          <span className="image-note">THE ART OF REMEMBERING</span>
        </div>
        <div className="hero-bottom"><span>BASED IN NAIROBI, KENYA</span><span>AVAILABLE WORLDWIDE</span><span>SCROLL TO DISCOVER ↓</span></div>
      </section>

      <section className="intro section-pad">
        <p className="eyebrow">A LITTLE ABOUT THE WORK</p>
        <p className="intro-statement">The best photographs don't just show how a moment looked. They let you <em>feel how it felt.</em></p>
        <div className="intro-foot"><span>OBSERVANT BY NATURE. INTENTIONAL BY DESIGN.</span><span>01 — 04</span></div>
      </section>

      <section className="work section-pad" id="work">
        <div className="section-heading">
          <div><p className="eyebrow">A CURATED COLLECTION</p><h2>Selected <em>work</em></h2></div>
          <p className="section-aside">A few stories, people and places<br />seen through my lens.</p>
        </div>
        <div className="filters" role="group" aria-label="Filter portfolio">
          {categories.map((category) => <button key={category} className={active === category ? "filter active" : "filter"} onClick={() => setActive(category)}>{category}</button>)}
        </div>
        <div className="gallery">
          {visiblePhotos.map((photo, index) => <button className={`gallery-item ${photo.shape === "tall" ? "gallery-tall" : ""}`} key={photo.id} onClick={() => setSelected(photo.id)} aria-label={`View ${photo.title}`}>
            <span className="gallery-image-wrap"><img src={photo.src} alt={photo.title} loading="lazy" /><span className="gallery-open"><ArrowUpRight size={19} /></span></span>
            <span className="gallery-meta"><span><strong>{photo.title}</strong><small>{photo.place}</small></span><span className="gallery-number">0{index + 1}</span></span>
          </button>)}
        </div>
        <p className="gallery-note">A photograph is only the beginning of the story.</p>
      </section>

      <section className="about section-pad" id="about">
        <div className="about-image"><img src="https://images.unsplash.com/photo-1452587925148-ce544e77e70d?auto=format&fit=crop&w=1200&q=85" alt="Photographer holding a camera" loading="lazy" /><span>BEHIND THE LENS</span></div>
        <div className="about-copy"><p className="eyebrow">THE PERSON BEHIND THE CAMERA</p><h2>Present in the moment.<br /><em>Curious about everything.</em></h2><p>I believe the most meaningful images happen when you feel comfortable enough to be yourself. My approach is relaxed, thoughtful and rooted in noticing the details others might miss.</p><p>Whether it is a celebration, a portrait or a story for your brand, I want the photographs to feel unmistakably yours.</p><a className="text-link" href="#contact">A little more about working together <ArrowRight size={15} /></a></div>
      </section>

      <section className="services section-pad" id="services">
        <div className="section-heading"><div><p className="eyebrow">WHAT I PHOTOGRAPH</p><h2>Made for <em>your story.</em></h2></div><p className="section-aside">Thoughtful imagery for people,<br />celebrations and growing brands.</p></div>
        <div className="service-list">
          {[
            ["01", "Weddings & celebrations", "For the big feeling and the small in-between moments."],
            ["02", "Portraits & people", "Honest portraits that feel like you, not a pose."],
            ["03", "Lifestyle & editorial", "Atmospheric stories with a sense of place and personality."],
            ["04", "Commercial & brand", "Distinctive imagery for businesses with something to say."]
          ].map(([number, title, description]) => <div className="service-row" key={number}><span className="service-number">{number}</span><h3>{title}</h3><p>{description}</p><ArrowUpRight className="service-arrow" size={20} /></div>)}
        </div>
      </section>

      <section className="quote-band"><span className="quote-mark">“</span><blockquote>Images that feel like <em>you.</em><br />Memories that stay with <em>you.</em></blockquote><span className="quote-credit">A PHOTOGRAPHY PHILOSOPHY</span></section>

      <section className="contact section-pad" id="contact">
        <div className="contact-top"><p className="eyebrow">YOUR STORY STARTS HERE</p><span>LET'S MAKE SOMETHING MEANINGFUL</span></div>
        <h2>Have a moment<br />worth <em>remembering?</em></h2>
        <p className="contact-intro">Tell me what you have in mind. I'd love to hear about it.</p>
        <a className="contact-button" href="https://wa.me/254700000000?text=Hello%2C%20I%20found%20your%20portfolio%20on%20Lens%20%26%20Light%20and%20would%20love%20to%20enquire%20about%20a%20photoshoot." target="_blank" rel="noreferrer">ENQUIRE ABOUT A SESSION <ArrowUpRight size={17} /></a>
        <div className="contact-details"><span>NAIROBI, KENYA · AVAILABLE WORLDWIDE</span><a href="mailto:hello@lensandlight.example">HELLO@LENSANDLIGHT.EXAMPLE</a></div>
      </section>

      <footer className="site-footer"><a className="wordmark footer-wordmark" href="#home">LENS <i>&</i> LIGHT</a><span>PHOTOGRAPHY WITH FEELING.</span><div className="footer-links"><a href="#work">WORK</a><a href="#about">ABOUT</a><a href="#contact">CONTACT</a><a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={16} /></a></div><small>© {new Date().getFullYear()} LENS & LIGHT. ALL RIGHTS RESERVED.</small></footer>

      {currentPhoto && <div className="lightbox" role="dialog" aria-modal="true" aria-label={currentPhoto.title} onClick={() => setSelected(null)}><button className="lightbox-close" onClick={() => setSelected(null)} aria-label="Close image"><X /></button><img src={currentPhoto.src} alt={currentPhoto.title} onClick={(event) => event.stopPropagation()} /><p>{currentPhoto.title} <span>— {currentPhoto.category}</span></p></div>}
    </main>
  );
}