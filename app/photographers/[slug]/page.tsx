"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Heart, MapPin, ShieldCheck } from "lucide-react";

const profiles = {
  "amara-wanjiku": {
    name:"Amara Wanjiku", studio:"Amara Wanjiku Photography", location:"Nairobi, Kenya",
    areas:"Kiambu · Machakos · Naivasha", category:"Weddings & celebrations",
    bio:"I make warm, documentary-led photographs for people who want to remember not only how a day looked, but how it felt. My approach is calm, observant and rooted in the small moments that make every story yours.",
    years:"Preview profile", services:["Wedding photography","Engagement sessions","Intimate celebrations"],
    portrait:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85",
    gallery:["https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?auto=format&fit=crop&w=1200&q=85"],
    approach:"Natural light · Documentary · Thoughtful details"
  },
  "daniel-mwangi": {
    name:"Daniel Mwangi", studio:"Daniel Mwangi Portraits", location:"Nakuru, Kenya",
    areas:"Naivasha · Nyahururu · Nairobi", category:"Portraits & people",
    bio:"I create honest, expressive portraits for individuals, artists and growing teams. Sessions are relaxed and collaborative, with space for personality to come through rather than forcing a pose.",
    years:"Preview profile", services:["Personal portraits","Creative headshots","Family sessions"],
    portrait:"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85",
    gallery:["https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85"],
    approach:"Portrait-led · Natural expression · Studio & outdoor"
  },
  "nia-creative-studio": {
    name:"Nia Creative Studio", studio:"Nia Creative Studio", location:"Mombasa, Kenya",
    areas:"Kilifi · Diani · Watamu", category:"Commercial & brand stories",
    bio:"Bright, intentional visual stories for hospitality, lifestyle and independent brands. I partner with teams to create cohesive image collections that feel considered, human and useful across platforms.",
    years:"Preview profile", services:["Brand photography","Hospitality & interiors","Product campaigns"],
    portrait:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=85",
    gallery:["https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1200&q=85"],
    approach:"Brand-led · Editorial · People, spaces & products"
  }
};

type Status={dataSource:string;workbook:string;verifiedTabs:number;expectedTabs:number;message:string};
export default function PublicPhotographerProfile(){
  const params=useParams<{slug:string}>();
  const slug=String(params.slug||"");
  const profile=profiles[slug as keyof typeof profiles];
  const [platform,setPlatform]=useState<Status|null>(null);
  const [liked,setLiked]=useState(false);
  const [enquiryPreview,setEnquiryPreview]=useState(false);
  const [activeImage,setActiveImage]=useState(0);
  const gallery=useMemo(()=>profile?.gallery??[],[profile]);
  useEffect(()=>{let active=true;fetch("/api/public/platform-status",{cache:"no-store"}).then(r=>r.json()).then(data=>{if(active)setPlatform(data);}).catch(()=>{if(active)setPlatform({dataSource:"unavailable",workbook:"verification_failed",verifiedTabs:0,expectedTabs:22,message:"Platform status could not be checked."});});return()=>{active=false;};},[]);
  if(!profile)return <main className="directory-page"><section className="directory-intro"><Link href="/photographers" className="back-link"><ArrowLeft size={15}/> BACK TO DIRECTORY</Link><h1>Profile not found.</h1><p>This preview profile may have moved. Explore the directory to view available examples.</p><Link className="button-dark" href="/photographers">Explore photographers <ArrowRight size={16}/></Link></section></main>;
  const statusLabel=platform?.workbook==="verified"?"Private workbook verified":platform?.workbook==="needs_attention"?"Workbook needs review":platform?.workbook==="verification_failed"?"Workbook check unavailable":"Workbook setup pending";
  return <main className="directory-page public-profile">
    <header className="market-header"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={19}/></span><span>LENS <i>&</i> LIGHT</span></Link><nav><Link href="/photographers">Find a photographer</Link><Link href="/#how-it-works">How it works</Link><Link href="/photographers/apply">For photographers</Link></nav><Link className="header-cta" href="/photographers">Back to directory <ArrowRight size={15}/></Link></header>
    <section className="profile-hero"><div className="profile-hero-image"><img src={gallery[0]} alt="Portfolio preview"/><span>DEMONSTRATION PORTFOLIO</span></div><div className="profile-hero-copy"><Link href="/photographers" className="back-link"><ArrowLeft size={15}/> ALL PHOTOGRAPHERS</Link><p className="kicker">{profile.category}</p><h1>{profile.name}</h1><p className="profile-location"><MapPin size={15}/>{profile.location}</p><p className="profile-lead">{profile.bio}</p><div className="profile-actions"><button type="button" className="button-dark" onClick={()=>document.getElementById("profile-enquiry")?.scrollIntoView({behavior:"smooth"})}>Make an enquiry <ArrowRight size={16}/></button><button type="button" className={liked?"like-button liked":"like-button"} onClick={()=>setLiked(!liked)}><Heart size={16} fill={liked?"currentColor":"none"}/>{liked?"Liked in this preview":"Like profile"}</button></div><p className="profile-interaction-note">Likes and enquiries are preview interactions only; they are not saved or sent.</p></div></section>
    <section className="profile-main"><div className="profile-details"><div className="profile-section-head"><p className="kicker">A LITTLE ABOUT THE WORK</p><span>01 — INTRODUCTION</span></div><h2>Every story has<br/><em>its own rhythm.</em></h2><p>{profile.bio}</p><p className="profile-approach">{profile.approach}</p><div className="profile-section-head"><p className="kicker">SERVICES</p><span>02 — WHAT I OFFER</span></div><div className="profile-services">{profile.services.map(s=><div key={s}><CheckCircle2 size={16}/>{s}</div>)}</div><div className="profile-section-head"><p className="kicker">BASED HERE, AVAILABLE THERE</p><span>03 — LOCATION</span></div><p className="profile-location"><MapPin size={15}/>{profile.location}</p><p className="profile-areas">ALSO AVAILABLE IN · {profile.areas}</p></div>
    <aside className="profile-contact-card" id="profile-enquiry"><p className="kicker">START A CONVERSATION</p><h2>Have a story<br/>in mind?</h2><p>Share a little about what you’re planning. This preview shows the enquiry experience before messaging is connected.</p><form onSubmit={e=>{e.preventDefault();setEnquiryPreview(true);}}><label>Your name<input required placeholder="Your name"/></label><label>Email address<input required type="email" placeholder="you@example.com"/></label><label>What are you planning?<textarea required rows={4} placeholder="Tell the photographer a little about your idea..."/></label><button className="button-dark" type="submit">Preview enquiry <ArrowRight size={15}/></button>{enquiryPreview&&<p className="preview-feedback"><CheckCircle2 size={16}/> Your enquiry passed the local preview check. It has not been sent or stored.</p>}</form><small>Messaging will be enabled after customer enquiry services and privacy controls are connected.</small></aside></section>
    <section className="profile-gallery"><div className="profile-section-head"><p className="kicker">SELECTED WORK</p><span>04 — PORTFOLIO PREVIEW</span></div><h2>A few moments<br/><em>worth keeping.</em></h2><div className="profile-gallery-grid">{gallery.map((src,i)=><button key={src} type="button" onClick={()=>setActiveImage(i)}><img src={src} alt={`Portfolio demonstration image ${i+1}`}/></button>)}</div><p className="directory-disclaimer">All photographs and profile details on this page are illustrative demonstration content, not verified photographer listings or live portfolio uploads.</p></section>
    <section className="profile-platform-status"><div><ShieldCheck size={20}/><div><strong>Platform integration status</strong><p>{platform?.message??"Checking the Preview backend and private workbook connection…"}</p></div></div><span className={platform?.workbook==="verified"?"status-good":"status-pending"}>{platform?statusLabel:"Checking backend"}</span>{platform?.workbook==="verified"&&<small>{platform.verifiedTabs} of {platform.expectedTabs} approved workbook tabs verified in a read-only check.</small>}</section>
    {activeImage!==-1&&<div className="profile-lightbox" role="dialog" aria-modal="true" aria-label="Portfolio image preview" onClick={()=>setActiveImage(-1)}><button type="button" onClick={()=>setActiveImage(-1)} aria-label="Close image">×</button><img src={gallery[activeImage]} alt="Selected portfolio preview"/></div>}
    <footer className="market-footer"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={18}/></span><span>LENS <i>&</i> LIGHT</span></Link><span>PHOTOGRAPHY, WITH PEOPLE AT ITS HEART.</span><div><Link href="/photographers">DISCOVER</Link><Link href="/photographers/apply">JOIN US</Link></div><small>© {new Date().getFullYear()} LENS & LIGHT. ALL RIGHTS RESERVED.</small></footer>
  </main>;
}
