"use client";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Menu, ShieldCheck } from "lucide-react";

const styles=["Weddings","Portraits","Commercial","Events","Fashion & editorial","Family","Product","Travel & lifestyle"];
export default function PhotographerApplyPage(){
  const [submitted,setSubmitted]=useState(false);
  const [categoryError,setCategoryError]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [accessLink,setAccessLink]=useState("");
  const [accountSetupLink,setAccountSetupLink]=useState("");
  const [expiresAt,setExpiresAt]=useState("");
  const [setupExpiresAt,setSetupExpiresAt]=useState("");
  const idempotencyKey=useRef("");
  function toggle(value:string){idempotencyKey.current="";setSelected(current=>current.includes(value)?current.filter(x=>x!==value):[...current,value]);}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    if(selected.length===0){setCategoryError(true);return;}
    setCategoryError(false);setError("");
    const form=event.currentTarget;
    const data=new FormData(form);
    if(!idempotencyKey.current){
      if(!globalThis.crypto?.randomUUID){setError("This browser cannot securely prepare your submission. Please update your browser and try again.");return;}
      idempotencyKey.current=globalThis.crypto.randomUUID();
    }
    const payload={
      name:data.get("name"),email:data.get("email"),phone:data.get("phone"),
      websiteUrl:data.get("websiteUrl"),town:data.get("town"),region:data.get("region"),
      categories:selected,introduction:data.get("introduction"),serviceAreas:data.get("serviceAreas"),
      portfolioUrl:data.get("portfolioUrl"),instagramUrl:data.get("instagramUrl"),
      additionalGalleryUrl:data.get("additionalGalleryUrl"),otherSocialUrl:data.get("otherSocialUrl"),
      consent:data.get("consent")==="on",companyWebsite:data.get("companyWebsite")
    };
    setBusy(true);
    try{
      const response=await fetch("/api/public/applications",{
        method:"POST",
        headers:{"content-type":"application/json","idempotency-key":idempotencyKey.current},
        body:JSON.stringify(payload)
      });
      const result=await response.json();
      if(!response.ok){const reference=typeof result.requestId==="string"?` Reference: ${result.requestId}`:"";throw new Error((result.error||"Your application could not be submitted. Please try again.")+reference);}
      if(result.duplicate)throw new Error(result.message||"An active application already exists for this email address.");
      if(typeof result.accessLink==="string"&&result.accessLink.startsWith("/application/updates#access=")){
        setAccessLink(new URL(result.accessLink,window.location.origin).toString());
        setExpiresAt(typeof result.accessLinkExpiresAt==="string"?result.accessLinkExpiresAt:"");
      }else{
        throw new Error("Your application was recorded, but a private access link was not returned. Please contact the Lens & Light team before submitting again.");
      }
      if(typeof result.accountSetupLink==="string"&&result.accountSetupLink.startsWith("/photographer/setup#token=")){
        setAccountSetupLink(new URL(result.accountSetupLink,window.location.origin).toString());
        setSetupExpiresAt(typeof result.accountSetupLinkExpiresAt==="string"?result.accountSetupLinkExpiresAt:"");
      }else{
        throw new Error("Your application was recorded, but the private account setup link was not returned. Please contact Lens & Light before submitting again.");
      }
      setSubmitted(true);
      form.reset();
      setSelected([]);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Your application could not be submitted. Please try again.");
    }finally{setBusy(false);}
  }
  return <main className="directory-page apply-page">
    <header className="market-header"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={19}/></span><span>LENS <i>&</i> LIGHT</span></Link><nav className="desktop-site-nav"><Link href="/" className="home-nav-link">Home</Link><Link href="/photographers">Find a photographer</Link><Link href="/#how-it-works">How it works</Link><Link href="/#for-photographers">For photographers</Link><Link href="/contact" className="contact-nav-link">Contact</Link></nav><details className="mobile-site-menu"><summary aria-label="Open navigation menu"><Menu size={23} strokeWidth={2.4} aria-hidden="true"/></summary><nav><Link href="/">Home</Link><Link href="/photographers">Find a photographer</Link><Link href="/#how-it-works">How it works</Link><Link href="/#for-photographers">For photographers</Link><Link href="/contact">Contact</Link></nav></details><Link className="header-cta" href="/photographers">Explore directory <ArrowRight size={15}/></Link></header>
    <section className="apply-intro"><Link href="/" className="back-link"><ArrowLeft size={15}/> BACK HOME</Link><p className="kicker">LENS & LIGHT · PHOTOGRAPHER COMMUNITY</p><h1>Let your work<br/><em>find its people.</em></h1><p>Tell us a little about yourself, the work you love making and where you make it. We’re building a thoughtful directory for photographers and the people looking for them.</p></section>
    <p style={{maxWidth:900,margin:"-22px auto 28px",padding:"0 20px",fontSize:13,color:"#6d685f"}}>Already an approved Lens & Light photographer? <Link href="/photographer/login" style={{textDecoration:"underline",fontWeight:700,color:"#25231f"}}>Sign in to edit your profile</Link>.</p>
    <section className="apply-layout"><aside className="apply-aside"><span className="apply-number">01 / GET TO KNOW YOU</span><h2>A good introduction<br/>starts a conversation.</h2><p>Your application is stored securely for the Lens & Light team to review. You’ll receive a private link to follow up on your application.</p><ul><li>Share your photography focus</li><li>Tell us where you’re based</li><li>Link to work you’re proud of</li></ul><p className="apply-note">PREVIEW INTAKE · PREVIEW DATABASE ONLY</p></aside>
    <form className="apply-form" onSubmit={submit} onChange={()=>{if(!busy&&!submitted)idempotencyKey.current="";}}>
      {submitted? <section className="preview-feedback" role="status"><CheckCircle2 size={20}/><div><strong>Your application has been recorded.</strong><p>Your next step is to create your photographer account. Keep this private setup link safe; it expires after 72 hours and can only be used once.</p><p><a href={accountSetupLink} style={{overflowWrap:"anywhere",fontWeight:700}}>Create your photographer account</a></p><button type="button" onClick={()=>{void navigator.clipboard?.writeText(accountSetupLink);}}>Copy account setup link</button><p style={{marginTop:18}}>You can also keep a separate private link for application messages:</p><p><a href={accessLink} style={{overflowWrap:"anywhere"}}>Open your application conversation</a></p><button type="button" onClick={()=>{void navigator.clipboard?.writeText(accessLink);}}>Copy application conversation link</button>{setupExpiresAt&&<small>Account setup link expires: {new Date(setupExpiresAt).toLocaleString()}</small>}{expiresAt&&<small>Application conversation link expires: {new Date(expiresAt).toLocaleString()}</small>}<p>Email notifications are not yet enabled. Save this link somewhere private before leaving this page.</p></div></section>:<>
      <div className="form-heading"><span>YOUR DETAILS</span><span>01 — 03</span></div>
      <div className="apply-fields two-col"><label>Photographer / studio name <span className="required-mark">*</span><input name="name" required maxLength={120} placeholder="Your name or studio"/></label><label>Email address <span className="required-mark">*</span><input name="email" required type="email" maxLength={254} placeholder="you@example.com"/></label><label>Phone number <span className="required-mark">*</span><input name="phone" required type="tel" maxLength={40} placeholder="+254 7XX XXX XXX"/></label><label>Website<input name="websiteUrl" type="url" placeholder="https://yourwebsite.com"/></label><label>Town / city <span className="required-mark">*</span><input name="town" required maxLength={100} placeholder="e.g. Nairobi"/></label><label>County / region <span className="required-mark">*</span><input name="region" required maxLength={100} placeholder="e.g. Nairobi County"/></label></div>
      <div className="form-heading"><span>YOUR PHOTOGRAPHY</span><span>02 — 03</span></div>
      <label className="wide-label">What do you photograph? <span className="required-mark">*</span> <span className="field-hint">Choose all that apply</span></label>
      <div className="style-options">{styles.map(s=><button type="button" key={s} className={selected.includes(s)?"chosen":""} onClick={()=>toggle(s)}>{selected.includes(s)?"✓　":""}{s}</button>)}</div>
      {categoryError&&<p className="category-error" role="alert">Please select at least one photography category.</p>}
      <label className="wide-label">A short introduction <span className="required-mark">*</span><textarea name="introduction" required minLength={30} maxLength={2000} rows={5} placeholder="Tell clients about your approach, experience and the stories you love to capture."/></label>
      <label className="wide-label">Areas you serve <span className="required-mark">*</span><textarea name="serviceAreas" required maxLength={800} rows={2} placeholder="List towns, counties or destinations you travel to."/></label>
      <div className="form-heading"><span>SHOW US YOUR WORK</span><span>03 — 03</span></div>
      <div className="apply-fields two-col"><label>Portfolio link <input name="portfolioUrl" type="url" placeholder="https://..."/></label><label>Instagram link <span className="required-mark">*</span><input name="instagramUrl" required type="url" placeholder="https://instagram.com/yourstudio"/></label><label>Additional gallery link <span className="required-mark">*</span><input name="additionalGalleryUrl" required type="url" placeholder="https://..."/></label><label>Other social / profile link <input name="otherSocialUrl" type="url" placeholder="https://..."/></label></div>
      <label className="consent-row"><input name="consent" type="checkbox" required/> I confirm that the information and portfolio links I provide are mine to share. <span className="required-mark">*</span></label>
      <label aria-hidden="true" style={{position:"absolute",left:"-10000px",width:1,height:1,overflow:"hidden"}}>Leave this field empty<input name="companyWebsite" tabIndex={-1} autoComplete="off"/></label>
      {error&&<p className="category-error" role="alert">{error}</p>}
      <button className="button-dark apply-submit" type="submit" disabled={busy}>{busy?"Submitting securely…":"Submit application"} <ArrowRight size={16}/></button>
      <p className="form-footnote"><ShieldCheck size={14}/> Applications are stored in the Preview database for testing. Acknowledgement emails to applicants are not enabled yet. Do not submit sensitive documents or private credentials here.</p>
      </>}
    </form></section>
    <footer className="market-footer"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={18}/></span><span>LENS <i>&</i> LIGHT</span></Link><span>PHOTOGRAPHY, WITH PEOPLE AT ITS HEART.</span><div><Link href="/photographers">DISCOVER</Link><Link href="/#for-photographers">JOIN US</Link></div><small>© {new Date().getFullYear()} LENS & LIGHT. ALL RIGHTS RESERVED.</small></footer>
  </main>;
}
